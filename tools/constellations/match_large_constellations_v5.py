#!/usr/bin/env python3
"""Mellon v5: maximize single-constellation screen coverage, no scene packing.

Searches the measured source-image star catalogue. No fabricated vertices,
brightness weighting, cross-template collision checks, or artificial output cap.
CPU bounds come from --attempts/--refinements; --limit 0 keeps all distinct
accepted candidates. Generates separate QA images for each selected pattern.

Requires the v3 source module alongside this file for established image
rotation/crop handling and one-to-one rigid fitting.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree
from PIL import Image, ImageDraw, ImageFont

from match_constellations_v3 import (
    load_catalog, unique_nearest_assignment, similarity_fit, refine,
)

HERE = Path(__file__).resolve().parent
DEFAULT_CORPUS = Path('assets/starfield/corpus-v1/catalogs')


def font(size):
    for path in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                 '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def metrics(actual: np.ndarray, width: int, height: int):
    low = np.min(actual, axis=0)
    high = np.max(actual, axis=0)
    span = high - low
    w = float(span[0] / width)
    h = float(span[1] / height)
    return {'width_fraction': round(w, 5),
            'height_fraction': round(h, 5),
            'max_span_fraction': round(max(w, h), 5),
            'bounding_area_fraction': round(w*h, 5),
            'bbox_px': [round(float(low[0]), 2), round(float(low[1]), 2),
                        round(float(high[0]), 2), round(float(high[1]), 2)]}


def merit(m, max_rms):
    # Coverage DOMINATES after a strict geometric-quality filter.
    c = m['coverage']
    size = .64*c['max_span_fraction'] + .36*math.sqrt(c['bounding_area_fraction'])
    geometry_penalty = .05 * (m['rms_error_px'] / max_rms)
    # An upright shape is a preference only. Rotated constellations remain eligible.
    rot = abs(((m['transform']['rotation_deg'] + 180) % 360) - 180)
    orient_penalty = .012 * rot / 180
    return round(size - geometry_penalty - orient_penalty, 6)


def batch_proposals(points, width, height, tree, rng, attempts, args):
    """Screen-aware transforms: every trial fits inside the full viewport."""
    batch = 512
    limit = math.radians(args.rotation_limit_deg)
    shortlist = []
    for base in range(0, attempts, batch):
        count = min(batch, attempts - base)
        angle = rng.uniform(-limit, limit, count)
        c = np.cos(angle)
        s = np.sin(angle)
        rx = points[None, :, 0]*c[:, None] - points[None, :, 1]*s[:, None]
        ry = points[None, :, 0]*s[:, None] + points[None, :, 1]*c[:, None]
        minx = rx.min(axis=1)
        maxx = rx.max(axis=1)
        miny = ry.min(axis=1)
        maxy = ry.max(axis=1)
        feasible = np.minimum((width-2*args.margin) / np.maximum(maxx-minx, 1e-7),
                              (height-2*args.margin) / np.maximum(maxy-miny, 1e-7))
        feasible = np.minimum(feasible, args.max_scale)
        enabled = feasible > args.min_scale
        if not enabled.any():
            continue
        # We deliberately concentrate trials on *large* shapes, not small ones.
        low_scale = np.maximum(args.min_scale, feasible * args.min_scale_ratio)
        high_scale = feasible * .992
        enabled &= high_scale > low_scale
        if not enabled.any():
            continue
        frac = rng.beta(2.2, 1.05, count)
        scales = low_scale + (high_scale-low_scale)*frac
        xlo = args.margin - scales*minx
        xhi = width - args.margin - scales*maxx
        ylo = args.margin - scales*miny
        yhi = height - args.margin - scales*maxy
        enabled &= (xhi >= xlo) & (yhi >= ylo)
        if not enabled.any():
            continue
        cx = xlo + rng.random(count)*np.maximum(xhi-xlo, 0)
        cy = ylo + rng.random(count)*np.maximum(yhi-ylo, 0)
        tx = cx[:, None] + scales[:, None]*rx
        ty = cy[:, None] + scales[:, None]*ry
        candidates = np.flatnonzero(enabled)
        coords = np.stack((tx[enabled], ty[enabled]), axis=2)
        dist, idx = tree.query(coords.reshape(-1, 2), k=1, workers=1)
        dist = dist.reshape(-1, len(points))
        idx = idx.reshape(-1, len(points))
        rms = np.sqrt(np.mean(dist*dist, axis=1))
        duplicates = np.asarray([len(points)-len(set(row)) for row in idx])
        coverage_x = (tx[enabled].max(axis=1)-tx[enabled].min(axis=1))/width
        coverage_y = (ty[enabled].max(axis=1)-ty[enabled].min(axis=1))/height
        coverage = np.maximum(coverage_x, coverage_y)
        # Mild size incentive in the prescreen, strong size incentive after fit.
        score = rms + duplicates*8 - coverage*3.0
        n = min(max(20, args.shortlist_per_batch), len(score))
        selection = np.argpartition(score, n-1)[:n]
        for selected in selection:
            j = candidates[selected]
            shortlist.append({'pre_score': float(score[selected]),
                              'center': np.array([cx[j], cy[j]]),
                              'radius': float(scales[j]),
                              'angle': float(angle[j])})
    return sorted(shortlist, key=lambda item: item['pre_score'])


def is_near_duplicate(candidate, earlier, center_px, scale_ratio, angle_deg):
    ca, cb = candidate['transform'], earlier['transform']
    if math.dist(ca['center_px'], cb['center_px']) > center_px:
        return False
    ra, rb = ca['scale_px'], cb['scale_px']
    if abs(ra-rb)/max(ra, rb) > scale_ratio:
        return False
    angle_diff = abs((ca['rotation_deg']-cb['rotation_deg']+180) % 360-180)
    return angle_diff < angle_deg


def find_large(stars, template, width, height, args, seed):
    if len(stars) < len(template['points']):
        return [], {'proposals': 0, 'refined': 0, 'qualified': 0}
    xy = np.asarray([(s['px'], s['py']) for s in stars], dtype=np.float64)
    points = np.asarray(template['points'], dtype=np.float64)
    tree = cKDTree(xy)
    rng = np.random.default_rng(seed)
    proposals = batch_proposals(points, width, height, tree, rng, args.attempts, args)
    # Preserve an honest bound on computation; output count has NO fixed cap.
    budget = min(len(proposals), args.refinements)
    # Explore the highest-quality candidates and extra large-scale alternatives.
    to_refine = proposals[:budget]
    accepted = []
    seen_assignments = set()
    refined_count = 0
    for proposal in to_refine:
        candidate = refine(proposal, points, xy, tree,
                           args.threshold_px, args.max_vertex_error_px,
                           args.min_scale, args.max_scale,
                           args.margin, width, height)
        refined_count += 1
        if candidate is None:
            continue
        assignment = candidate['assignment']
        key = tuple(int(i) for i in assignment)
        if key in seen_assignments:
            continue
        seen_assignments.add(key)
        actual = xy[assignment]
        coverage = metrics(actual, width, height)
        if coverage['max_span_fraction'] < args.min_span:
            continue
        star_ids = [stars[int(i)]['id'] for i in assignment]
        if len(set(star_ids)) != len(points):
            raise AssertionError('Duplicate source star assigned')
        item = {
            'star_ids': star_ids,
            'vertices': [[round(float(x/width), 8), round(float(y/height), 8)] for x,y in actual],
            'edges': template['edges'],
            'coverage': coverage,
            'rms_error_px': round(candidate['rms_error_px'], 4),
            'max_error_px': round(candidate['max_error_px'], 4),
            'transform': {
                'center_px': [round(float(c), 2) for c in candidate['center']],
                'rotation_deg': round(math.degrees(candidate['angle_rad']), 2),
                'scale_px': round(candidate['radius'], 2),
            },
            'status': 'candidate-needs-visual-review',
        }
        item['rank_score'] = merit(item, args.threshold_px)
        accepted.append(item)
    accepted.sort(key=lambda item: (-item['rank_score'], item['rms_error_px']))
    unique = []
    for candidate in accepted:
        if any(is_near_duplicate(candidate, prev, args.dedup_center,
                                 args.dedup_scale, args.dedup_angle) for prev in unique):
            continue
        unique.append(candidate)
        if args.limit and len(unique) >= args.limit:
            break
    return unique, {'proposals': len(proposals), 'refined': refined_count,
                    'qualified': len(accepted), 'unique': len(unique)}


def overlay_image(bg, match, ident, name, index, target):
    with Image.open(bg) as source:
        frame = source.convert('RGBA')
    d = ImageDraw.Draw(frame, 'RGBA')
    coords = [(int(round(x*frame.width)), int(round(y*frame.height)))
              for x,y in match['vertices']]
    for a,b in match['edges']:
        d.line([coords[a], coords[b]], fill=(12, 112, 190, 110), width=8)
        d.line([coords[a], coords[b]], fill=(117, 222, 253, 244), width=2)
    for x,y in coords:
        d.ellipse((x-12, y-12, x+12, y+12), fill=(50, 161, 255, 42))
        d.ellipse((x-4, y-4, x+4, y+4), fill=(244, 250, 255, 244))
    text = (f'{name}  /  MATCH {index:03d}  /  '
            f'COVERAGE {match["coverage"]["max_span_fraction"]:.0%}  '
            f'RMS {match["rms_error_px"]:.1f}px')
    d.rounded_rectangle((30, 30, min(1050, frame.width-30), 88),
                        radius=10, fill=(4, 9, 27, 185))
    d.text((46, 46), text, font=font(24), fill=(232, 244, 255, 255))
    target.parent.mkdir(parents=True, exist_ok=True)
    frame.convert('RGB').save(target, quality=90, optimize=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--corpus', type=Path, default=DEFAULT_CORPUS)
    ap.add_argument('--templates', type=Path, default=HERE/'templates-v3.json')
    ap.add_argument('--output', type=Path, default=Path('constellation-large-v5'))
    ap.add_argument('--catalog', choices=['all','curated'], default='all')
    ap.add_argument('--only', nargs='+', default=None)
    ap.add_argument('--min-stars', type=int, default=0)
    ap.add_argument('--attempts', type=int, default=20000)
    ap.add_argument('--refinements', type=int, default=600,
                    help='Max expensive geometric refinements per template/image; 0 not supported')
    ap.add_argument('--limit', type=int, default=0,
                    help='Max matches to save per constellation per image; 0=unlimited')
    ap.add_argument('--qa-per-template', type=int, default=3)
    ap.add_argument('--min-scale', type=float, default=350)
    ap.add_argument('--max-scale', type=float, default=3200)
    ap.add_argument('--min-scale-ratio', type=float, default=.58,
                    help='Sample scales in [ratio*maximum-that-fits, maximum-that-fits]')
    ap.add_argument('--margin', type=float, default=40)
    ap.add_argument('--min-span', type=float, default=.55,
                    help='Minimum fraction of either screen dimension spanned by matched constellation')
    ap.add_argument('--threshold-px', type=float, default=13.0)
    ap.add_argument('--max-vertex-error-px', type=float, default=24.0)
    ap.add_argument('--rotation-limit-deg', type=float, default=35)
    ap.add_argument('--shortlist-per-batch', type=int, default=36)
    ap.add_argument('--dedup-center', type=float, default=35)
    ap.add_argument('--dedup-scale', type=float, default=.06)
    ap.add_argument('--dedup-angle', type=float, default=7)
    ap.add_argument('--seed', type=int, default=20261109)
    args = ap.parse_args()
    if args.attempts < 1 or args.refinements < 1 or args.limit < 0 or args.qa_per_template < 0:
        ap.error('attempts/refinements must be >=1; limit/qa-per-template must be >=0')
    if not 0 <= args.min_span <= 1 or not 0 < args.min_scale_ratio < 1:
        ap.error('min-span must be 0..1; min-scale-ratio must be between 0 and 1')
    templates = json.loads(args.templates.read_text())['templates']
    if args.only:
        missing = set(args.only) - set(templates)
        if missing:
            ap.error('Unknown constellation(s): ' + ', '.join(sorted(missing)))
        templates = {key: templates[key] for key in dict.fromkeys(args.only)}
    templates = {key: t for key,t in templates.items() if len(t['points']) >= args.min_stars}
    if not templates:
        ap.error('No templates selected')
    args.output.mkdir(parents=True, exist_ok=True)
    report = {}
    for folder in sorted(args.corpus.iterdir()):
        if not folder.is_dir():
            continue
        path = folder/('stars-all.json' if args.catalog=='all' else 'stars-curated.json')
        if not path.is_file():
            continue
        stars, (width,height) = load_catalog(folder,args.catalog)
        background = folder/'background-dim-16x9.jpg'
        matches = {}
        stats = {}
        for key,t in templates.items():
            seed = args.seed + sum(map(ord, f'{folder.name}-{key}'))
            result, detail = find_large(stars,t,width,height,args,seed)
            matches[key] = result
            stats[key] = detail
            top = result[0] if result else None
            print(f'{folder.name:<20} {key:<5} {len(result):>4} valid candidates  '
                  f'best span={top["coverage"]["max_span_fraction"]:.1%}  '
                  f'RMS={top["rms_error_px"]:.2f}px' if top else
                  f'{folder.name:<20} {key:<5} no accepted matches',flush=True)
            if background.is_file():
                for i,match in enumerate(result[:args.qa_per_template],1):
                    overlay_image(background,match,key,t['name'],i,
                                  args.output/folder.name/'qa'/key/f'match-{i:03d}.jpg')
        report[folder.name] = {'image_size':[width,height],
                               'source_stars':len(stars),
                               'matches':matches,'stats':stats}
    artifact={'schema':'mellon-single-constellation-matches-v5',
              'note':'Each scene displays ONE constellation; candidate bounding boxes may overlap. Every vertex comes from the source detection catalogue.',
              'settings':{k:str(v) if isinstance(v,Path) else v for k,v in vars(args).items()},
              'images':report}
    (args.output/'matches-v5.json').write_text(json.dumps(artifact,indent=2)+'\n')
    print('Wrote',args.output/'matches-v5.json',flush=True)


if __name__=='__main__':
    main()
