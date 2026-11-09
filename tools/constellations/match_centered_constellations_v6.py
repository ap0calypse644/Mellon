#!/usr/bin/env python3
"""Mellon v6: large, centered single constellations with artwork clearance.

Searches the measured source-image star catalogue. No fabricated vertices,
brightness weighting, cross-template collision checks, or artificial output cap.
CPU bounds come from --attempts/--refinements; --limit 0 keeps all distinct
accepted candidates. All matched stars must fit a central safe region.
Preserves an independent outer border and a gap for later character artwork.
Generates individual QA previews and never modifies image-star positions.

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


def safe_zone(width: int, height: int, args):
    """Outer artwork border plus extra room to draw a figure around stars.

    No constellation star may enter this INNER safe margin. The future
    figure may extend by figure_room_x/y into the reserved band, while
    remaining inside the outer frame margin.
    """
    outer_x = width * args.frame_margin
    outer_y = height * args.frame_margin
    room_x = width * args.figure_room_x
    room_y = height * args.figure_room_y
    return outer_x + room_x, outer_y + room_y, room_x, room_y


def center_offset(coverage, width, height):
    left, top, right, bottom = coverage['bbox_px']
    return (round(((left + right) / 2 - width / 2) / width, 5),
            round(((top + bottom) / 2 - height / 2) / height, 5))


def merit(m, max_rms, width, height, args):
    """Prefer large, upright, centered, geometrically accurate figures."""
    coverage = m['coverage']
    size = (.64 * coverage['max_span_fraction'] +
            .36 * math.sqrt(coverage['bounding_area_fraction']))
    geometry_penalty = .05 * (m['rms_error_px'] / max_rms)
    rot = abs(((m['transform']['rotation_deg'] + 180) % 360) - 180)
    orient_penalty = .016 * rot / 180
    ox, oy = center_offset(coverage, width, height)
    center_penalty = .12 * math.hypot(ox / args.center_tolerance_x,
                                    oy / args.center_tolerance_y)
    return round(size - geometry_penalty - orient_penalty - center_penalty, 6)


def batch_proposals(points, width, height, tree, rng, attempts, args):
    """Constrain each randomized placement to the art-safe CENTRAL screen."""
    batch = 512
    limit = math.radians(args.rotation_limit_deg)
    proposals = []
    safe_x, safe_y, _, _ = safe_zone(width, height, args)
    center_x_low = width * (.5 - args.center_tolerance_x)
    center_x_high = width * (.5 + args.center_tolerance_x)
    center_y_low = height * (.5 - args.center_tolerance_y)
    center_y_high = height * (.5 + args.center_tolerance_y)

    for base in range(0, attempts, batch):
        count = min(batch, attempts - base)
        angle = rng.uniform(-limit, limit, count)
        c, sine = np.cos(angle), np.sin(angle)
        rx = points[None, :, 0] * c[:, None] - points[None, :, 1] * sine[:, None]
        ry = points[None, :, 0] * sine[:, None] + points[None, :, 1] * c[:, None]
        minx, maxx = rx.min(axis=1), rx.max(axis=1)
        miny, maxy = ry.min(axis=1), ry.max(axis=1)
        midx, midy = (minx + maxx) / 2, (miny + maxy) / 2

        available_x = width - 2 * safe_x
        available_y = height - 2 * safe_y
        feasible = np.minimum(available_x / np.maximum(maxx - minx, 1e-7),
                              available_y / np.maximum(maxy - miny, 1e-7))
        feasible = np.minimum(feasible, args.max_scale)
        enabled = feasible > args.min_scale
        if not enabled.any():
            continue

        low_scale = np.maximum(args.min_scale, feasible * args.min_scale_ratio)
        high_scale = feasible * .992
        enabled &= high_scale > low_scale
        if not enabled.any():
            continue
        frac = rng.beta(2.2, 1.05, count)
        scales = low_scale + (high_scale - low_scale) * frac

        # First restrict the target bbox to the INNER star-safe rectangle.
        xlo = safe_x - scales * minx
        xhi = width - safe_x - scales * maxx
        ylo = safe_y - scales * miny
        yhi = height - safe_y - scales * maxy

        # Then restrict the ACTUAL constellation bbox midpoint, not the
        # template origin, to a slightly off-center permitted region.
        xlo = np.maximum(xlo, center_x_low - scales * midx)
        xhi = np.minimum(xhi, center_x_high - scales * midx)
        ylo = np.maximum(ylo, center_y_low - scales * midy)
        yhi = np.minimum(yhi, center_y_high - scales * midy)
        enabled &= (xhi >= xlo) & (yhi >= ylo)
        if not enabled.any():
            continue
        cx = xlo + rng.random(count) * np.maximum(xhi - xlo, 0)
        cy = ylo + rng.random(count) * np.maximum(yhi - ylo, 0)
        tx = cx[:, None] + scales[:, None] * rx
        ty = cy[:, None] + scales[:, None] * ry
        ids = np.flatnonzero(enabled)
        coords = np.stack((tx[enabled], ty[enabled]), axis=2)
        distance, nearest = tree.query(coords.reshape(-1, 2), k=1, workers=1)
        distance = distance.reshape(-1, len(points))
        nearest = nearest.reshape(-1, len(points))
        rms = np.sqrt(np.mean(distance ** 2, axis=1))
        duplicate_penalty = np.asarray([len(points) - len(set(row)) for row in nearest])
        width_fraction = (tx[enabled].max(axis=1) - tx[enabled].min(axis=1)) / width
        height_fraction = (ty[enabled].max(axis=1) - ty[enabled].min(axis=1)) / height
        span = np.maximum(width_fraction, height_fraction)
        midx_actual = (tx[enabled].max(axis=1) + tx[enabled].min(axis=1)) / 2
        midy_actual = (ty[enabled].max(axis=1) + ty[enabled].min(axis=1)) / 2
        displacement = np.hypot((midx_actual / width - .5) / args.center_tolerance_x,
                                (midy_actual / height - .5) / args.center_tolerance_y)
        prescore = rms + duplicate_penalty * 8 - span * 3 + displacement * .8
        n = min(max(20, args.shortlist_per_batch), len(prescore))
        selection = np.argpartition(prescore, n - 1)[:n]
        for pick in selection:
            i = ids[pick]
            proposals.append({'pre_score': float(prescore[pick]),
                              'center': np.array([cx[i], cy[i]]),
                              'radius': float(scales[i]),
                              'angle': float(angle[i])})
    return sorted(proposals, key=lambda item: item['pre_score'])


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
    # Output has no fixed cap; CPU budget is bounded by refinements.
    budget = min(len(proposals), args.refinements)
    to_refine = proposals[:budget]
    accepted = []
    seen_assignments = set()
    refined_count = 0
    safe_x, safe_y, room_x, room_y = safe_zone(width, height, args)
    for proposal in to_refine:
        candidate = refine(proposal, points, xy, tree,
                           args.threshold_px, args.max_vertex_error_px,
                           args.min_scale, args.max_scale,
                           0, width, height)
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
        xmin, ymin, xmax, ymax = coverage['bbox_px']
        # These tests inspect the ACTUAL matched image-star coordinates,
        # not the projected reference targets. Refinement can move points.
        tolerance = 1e-5
        if (xmin < safe_x - tolerance or xmax > width - safe_x + tolerance or
                ymin < safe_y - tolerance or ymax > height - safe_y + tolerance):
            continue
        dx, dy = center_offset(coverage, width, height)
        if abs(dx) > args.center_tolerance_x + tolerance or abs(dy) > args.center_tolerance_y + tolerance:
            continue
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
            'center_offset_fraction': [dx, dy],
            'figure_room_px': [round(room_x, 2), round(room_y, 2)],
            'figure_envelope_bbox_px': [round(xmin - room_x, 2), round(ymin - room_y, 2),
                                        round(xmax + room_x, 2), round(ymax + room_y, 2)],
            'rms_error_px': round(candidate['rms_error_px'], 4),
            'max_error_px': round(candidate['max_error_px'], 4),
            'transform': {
                'center_px': [round(float(c), 2) for c in candidate['center']],
                'rotation_deg': round(math.degrees(candidate['angle_rad']), 2),
                'scale_px': round(candidate['radius'], 2),
            },
            'status': 'candidate-needs-visual-review',
        }
        item['rank_score'] = merit(item, args.threshold_px, width, height, args)
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


def overlay_image(bg, match, ident, name, index, target, args):
    with Image.open(bg) as source:
        frame = source.convert('RGBA')
    d = ImageDraw.Draw(frame, 'RGBA')
    safe_x, safe_y, room_x, room_y = safe_zone(frame.width, frame.height, args)
    # Two explicit, visually inspectable frames:
    # cyan = star-safe inner bounds; amber = candidate artwork envelope.
    d.rectangle((round(safe_x), round(safe_y), round(frame.width - safe_x),
                 round(frame.height - safe_y)),
                outline=(91, 211, 245, 105), width=2)
    d.rectangle(tuple(round(x) for x in match['figure_envelope_bbox_px']),
                outline=(255, 186, 78, 190), width=2)
    center_x = (match['coverage']['bbox_px'][0] + match['coverage']['bbox_px'][2]) / 2
    center_y = (match['coverage']['bbox_px'][1] + match['coverage']['bbox_px'][3]) / 2
    d.line((center_x - 14, center_y, center_x + 14, center_y),
           fill=(255, 199, 121, 160), width=2)
    d.line((center_x, center_y - 14, center_x, center_y + 14),
           fill=(255, 199, 121, 160), width=2)
    coords = [(int(round(x*frame.width)), int(round(y*frame.height)))
              for x,y in match['vertices']]
    for a,b in match['edges']:
        d.line([coords[a], coords[b]], fill=(12, 112, 190, 110), width=8)
        d.line([coords[a], coords[b]], fill=(117, 222, 253, 244), width=2)
    for x,y in coords:
        d.ellipse((x-12, y-12, x+12, y+12), fill=(50, 161, 255, 42))
        d.ellipse((x-4, y-4, x+4, y+4), fill=(244, 250, 255, 244))
    text = (f'{name}  /  MATCH {index:03d}  /  '
            f'SPAN {match["coverage"]["max_span_fraction"]:.0%}  '
            f'CENTERED  RMS {match["rms_error_px"]:.1f}px')
    d.rounded_rectangle((30, 30, min(1050, frame.width-30), 88),
                        radius=10, fill=(4, 9, 27, 185))
    d.text((46, 46), text, font=font(24), fill=(232, 244, 255, 255))
    target.parent.mkdir(parents=True, exist_ok=True)
    frame.convert('RGB').save(target, quality=90, optimize=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--corpus', type=Path, default=DEFAULT_CORPUS)
    ap.add_argument('--templates', type=Path, default=HERE/'templates-v3.json')
    ap.add_argument('--output', type=Path, default=Path('constellation-centered-v6'))
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
    ap.add_argument('--frame-margin', type=float, default=.05,
                    help='Fractional frame margin, outside planned character art (each side)')
    ap.add_argument('--figure-room-x', type=float, default=.09,
                    help='Additional width fraction reserved for character drawing')
    ap.add_argument('--figure-room-y', type=float, default=.09,
                    help='Additional height fraction reserved for character drawing')
    ap.add_argument('--center-tolerance-x', type=float, default=.13,
                    help='Max fractional screen-width offset of constellation bbox center')
    ap.add_argument('--center-tolerance-y', type=float, default=.13,
                    help='Max fractional screen-height offset of constellation bbox center')
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
    if any(v < 0 for v in (args.frame_margin, args.figure_room_x, args.figure_room_y)):
        ap.error('Frame margin and character drawing reserve must be non-negative')
    if (args.frame_margin + args.figure_room_x >= .5 or
            args.frame_margin + args.figure_room_y >= .5):
        ap.error('Art-safe region must have positive width and height')
    if not (0 < args.center_tolerance_x <= .5 and 0 < args.center_tolerance_y <= .5):
        ap.error('Center tolerances must be in (0, 0.5]')
    if args.max_scale <= args.min_scale or args.shortlist_per_batch < 1:
        ap.error('Invalid scale or shortlist settings')
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
    print('Star-safe inset: {:.0%} horizontally, {:.0%} vertically; '
          'figure room: {:.0%} width, {:.0%} height; '
          'max center offset: ±{:.0%} width / ±{:.0%} height'.format(
              args.frame_margin + args.figure_room_x,
              args.frame_margin + args.figure_room_y,
              args.figure_room_x, args.figure_room_y,
              args.center_tolerance_x, args.center_tolerance_y), flush=True)
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
                                  args.output/folder.name/'qa'/key/f'match-{i:03d}.jpg', args)
        report[folder.name] = {'image_size':[width,height],
                               'source_stars':len(stars),
                               'matches':matches,'stats':stats}
    artifact={'schema':'mellon-centered-constellation-matches-v6',
              'note': 'Each match is a SINGLE image-aligned constellation. All matched vertices are inside the inner safe region, with reserved room for later character art. Candidate matches may overlap.',
              'settings':{k:str(v) if isinstance(v,Path) else v for k,v in vars(args).items()},
              'images':report}
    (args.output/'matches-v6.json').write_text(json.dumps(artifact,indent=2)+'\n')
    print('Wrote',args.output/'matches-v6.json',flush=True)


if __name__=='__main__':
    main()
