#!/usr/bin/env python3
"""Offline, multi-instance constellation matcher for Mellon's starfield corpus.

Only transforms the *reference geometry*, never the image or extracted star positions.
Scores geometry only: no weighting by star brightness. An aggressive, batched random
similarity-transform search is followed by one-to-one assignment and Procrustes
refinement. Local matches are de-duplicated spatially, not globally.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment
from scipy.spatial import cKDTree
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
DEFAULT_CORPUS = Path('assets/starfield/corpus-v1/catalogs')


def load_catalog(folder: Path, mode: str) -> tuple[list[dict], tuple[int, int]]:
    """Map original detections to the EXACT crop/rotation used by the 16:9 image."""
    if mode == 'curated':
        data = json.loads((folder / 'stars-curated.json').read_text())
        return data['stars'], tuple(data['image_size'])
    data = json.loads((folder / 'stars-all.json').read_text())
    metadata = json.loads((folder / 'metadata.json').read_text())
    t = metadata['transform']
    w, h = t['output_size']
    l, top, right, bottom = t['crop_box_rotated']
    src_w, src_h = metadata['source_width'], metadata['source_height']
    transformed = []
    for star in data['stars']:
        x, y = star['px'], star['py']
        if t['clockwise_degrees'] == 90:
            x, y = src_h - 1 - y, x
        elif t['clockwise_degrees'] == 180:
            x, y = src_w - 1 - x, src_h - 1 - y
        elif t['clockwise_degrees'] == 270:
            x, y = y, src_w - 1 - x
        elif t['clockwise_degrees'] != 0:
            raise ValueError('Unsupported clockwise rotation')
        px, py = (x-l)*w/(right-l), (y-top)*h/(bottom-top)
        if not (1 <= px < w-1 and 1 <= py < h-1):
            continue
        transformed.append({
            'id': star['id'], 'px': round(px, 4), 'py': round(py, 4),
            'x': round(px/w, 8), 'y': round(py/h, 8),
            'quality_score': star.get('quality_score'),
        })
    return transformed, (w, h)


def targets_for(points: np.ndarray, center: np.ndarray,
                radius: float, angle: float) -> np.ndarray:
    c, s = np.cos(angle), np.sin(angle)
    rot = np.array([[c, s], [-s, c]])
    return (points @ rot) * radius + center


def similarity_fit(template: np.ndarray, actual: np.ndarray):
    """Least-squares translation + rotation + UNIFORM scale; no reflection."""
    a = template - template.mean(axis=0)
    b = actual - actual.mean(axis=0)
    u, singular, vt = np.linalg.svd(a.T @ b)
    sign = np.linalg.det(u @ vt)
    diag = np.diag([1., -1. if sign < 0 else 1.])
    rotation = u @ diag @ vt
    radius = float(np.sum(singular * np.diag(diag)) / np.sum(a * a))
    center = actual.mean(axis=0) - template.mean(axis=0) @ rotation * radius
    predicted = template @ rotation * radius + center
    theta = float(math.atan2(rotation[0, 1], rotation[0, 0]))
    return predicted, center, radius, theta


def unique_nearest_assignment(tree: cKDTree, xy: np.ndarray,
                              targets: np.ndarray, k: int = 6):
    """Minimum-cost unique source-star mapping over per-vertex KD candidates."""
    k = min(k, len(xy))
    distances, nearest = tree.query(targets, k=k)
    if k == 1:
        nearest = nearest.reshape(-1, 1)
    available = np.unique(nearest)
    if len(available) < len(targets):
        return None
    costs = np.sum((targets[:, None, :] - xy[available][None, :, :]) ** 2,
                   axis=2)
    allowed = np.zeros(costs.shape, dtype=bool)
    allowed[np.arange(len(targets))[:, None],
            np.searchsorted(available, nearest)] = True
    costs[~allowed] = 1.e10
    rows, cols = linear_sum_assignment(costs)
    if np.max(costs[rows, cols]) > 1.e8:
        return None
    assignment = available[cols]
    return assignment


def refine(proposal: dict, points: np.ndarray, xy: np.ndarray,
           tree: cKDTree, max_rms: float, max_vertex: float,
           min_scale: float, max_scale: float,
           margin: float, width: int, height: int) -> dict | None:
    center = proposal['center'].copy()
    angle = proposal['angle']
    radius = proposal['radius']
    chosen = None
    for _ in range(4):
        target = targets_for(points, center, radius, angle)
        chosen = unique_nearest_assignment(tree, xy, target)
        if chosen is None:
            return None
        selected = xy[chosen]
        target, center, radius, angle = similarity_fit(points, selected)
        if radius < min_scale * .88 or radius > max_scale * 1.12:
            return None
    # Reassignment once more, in case the final refinement changed neighbors.
    chosen = unique_nearest_assignment(tree, xy, target)
    if chosen is None:
        return None
    actual = xy[chosen]
    target, center, radius, angle = similarity_fit(points, actual)
    errors = np.linalg.norm(actual - target, axis=1)
    rms = float(np.sqrt(np.mean(errors ** 2)))
    worst = float(np.max(errors))
    if rms > max_rms or worst > max_vertex:
        return None
    if (target[:, 0].min() < margin or target[:, 0].max() > width-margin or
            target[:, 1].min() < margin or target[:, 1].max() > height-margin):
        return None
    if len(set(chosen.tolist())) != len(chosen):
        return None
    return {
        'assignment': chosen,
        'rms_error_px': rms,
        'max_error_px': worst,
        'relative_rms': rms / radius,
        'radius': radius,
        'center': center,
        'angle_rad': angle,
    }


def search(stars: list[dict], template: dict, *, seed: int, attempts: int,
           width: int, height: int, instances: int, min_scale: float,
           max_scale: float, max_rms: float, max_vertex: float,
           margin: float, min_separation: float,
           rotation_limit_deg: float) -> list[dict]:
    if len(stars) < len(template['points']):
        return []
    xy = np.asarray([(s['px'], s['py']) for s in stars], dtype=np.float64)
    points = np.asarray(template['points'], dtype=np.float64)
    tree = cKDTree(xy)
    rng = np.random.default_rng(seed)
    proposals = []
    # More search != a bigger CPU bill than necessary: each batch queries the
    # KD-tree vectorially, then only promising transforms receive slow Hungarian
    # assignment / Procrustes optimization.
    batch = 512
    keep_each = max(12, min(60, 1 + attempts // 700))
    for base in range(0, attempts, batch):
        count = min(batch, attempts-base)
        cx = rng.uniform(width * .17, width * .83, count)
        cy = rng.uniform(height * .18, height * .82, count)
        scale = rng.uniform(min_scale, max_scale, count)
        limit = math.radians(rotation_limit_deg)
        theta = rng.uniform(-limit, limit, count)
        c = np.cos(theta)[:, None]
        s = np.sin(theta)[:, None]
        tx = points[None, :, 0]
        ty = points[None, :, 1]
        x = cx[:, None] + scale[:, None] * (tx*c - ty*s)
        y = cy[:, None] + scale[:, None] * (tx*s + ty*c)
        valid = ((x.min(axis=1) >= margin) &
                 (x.max(axis=1) <= width - margin) &
                 (y.min(axis=1) >= margin) &
                 (y.max(axis=1) <= height - margin))
        if not np.any(valid):
            continue
        valid_idxs = np.flatnonzero(valid)
        target = np.stack((x[valid], y[valid]), axis=2)
        nearest_distance, nearest_id = tree.query(target.reshape(-1, 2), k=1)
        d = nearest_distance.reshape(-1, len(points))
        ids = nearest_id.reshape(-1, len(points))
        score = np.sqrt(np.mean(d**2, axis=1))
        # Duplicates are unfavorable, but may be repaired in assignment stage.
        duplicates = [len(points) - len(np.unique(row)) for row in ids]
        score += np.asarray(duplicates) * 7.0
        survivors = min(keep_each, len(score))
        shortlist = np.argpartition(score, survivors-1)[:survivors]
        for i in shortlist:
            j = valid_idxs[i]
            proposals.append({'score': float(score[i]),
                              'center': np.asarray([cx[j], cy[j]]),
                              'radius': float(scale[j]), 'angle': float(theta[j])})
    proposals.sort(key=lambda p: p['score'])
    # Brute-force refinement: spend real effort on hundreds of promising
    # transforms, rank by the FINAL rigid-fit error, then choose spatially
    # diverse instances. This is deliberately more expensive than v1.
    refine_budget = min(len(proposals), max(450, attempts // 40))
    refined = []
    seen = set()
    for proposal in proposals[:refine_budget]:
        candidate = refine(proposal, points, xy, tree, max_rms,
                           max_vertex, min_scale, max_scale,
                           margin, width, height)
        if candidate is None:
            continue
        # Exact selected-star assignment duplicates are redundant.
        key = tuple(candidate['assignment'].tolist())
        if key in seen:
            continue
        seen.add(key)
        refined.append(candidate)

    refined.sort(key=lambda item: (item['rms_error_px'], item['max_error_px']))
    matches = []
    accepted = []
    for candidate in refined:
        close = False
        for prev in accepted:
            center_distance = np.linalg.norm(candidate['center'] - prev['center'])
            shared = len(set(candidate['assignment']) & set(prev['assignment']))
            overlap = shared / len(points)
            if center_distance < min_separation or overlap > .22:
                close = True
                break
        if close:
            continue
        accepted.append(candidate)
        chosen = candidate['assignment']
        selected = xy[chosen]
        matches.append({
            'star_ids': [stars[int(i)]['id'] for i in chosen],
            'vertices': [[round(float(x / width), 8),
                          round(float(y / height), 8)] for x, y in selected],
            'edges': template['edges'],
            'rms_error_px': round(candidate['rms_error_px'], 3),
            'max_error_px': round(candidate['max_error_px'], 3),
            'relative_rms': round(candidate['relative_rms'], 5),
            'transform': {
                'center_px': [round(float(v), 2) for v in candidate['center']],
                'rotation_deg': round(math.degrees(candidate['angle_rad']), 2),
                'scale_px': round(candidate['radius'], 2),
            },
            'status': 'candidate-needs-visual-review',
        })
        if len(matches) >= instances:
            break
    return matches


COLORS = [
    (92, 211, 244, 255), (198, 152, 250, 255),
    (141, 244, 179, 255), (255, 194, 100, 255),
    (246, 129, 166, 255),
]


def draw_match(img: Image.Image, match: dict, color, label=None,
               *, line_width=3):
    draw = ImageDraw.Draw(img, 'RGBA')
    coords = [(x * img.width, y * img.height) for x, y in match['vertices']]
    for ia, ib in match['edges']:
        draw.line((coords[ia], coords[ib]), fill=color, width=line_width)
    for x, y in coords:
        draw.ellipse((x-4, y-4, x+4, y+4),
                     fill=(240, 249, 255, 230), outline=color, width=2)
    if label:
        cx, cy = match['transform']['center_px']
        draw.text((cx+8, cy+9), label, fill=color)


def draw_reference(template: dict, size=(700, 700)):
    canvas = Image.new('RGB', size, (9, 14, 31))
    shape = np.asarray(template['points'])
    center = np.array([size[0] / 2, size[1] / 2])
    pts = shape * min(size) * .72 + center
    draw = ImageDraw.Draw(canvas, 'RGBA')
    for a, b in template['edges']:
        draw.line((tuple(pts[a]), tuple(pts[b])), fill=(100, 200, 250, 220), width=3)
    for x, y in pts:
        draw.ellipse((x-6, y-6, x+6, y+6), fill=(239, 251, 255, 235))
    return canvas


def render(img_path: Path, img_matches: dict, templates: dict, output: Path,
           preview_instances: int):
    source = Image.open(img_path).convert('RGB')
    overall = source.copy()
    for i, (key, matches) in enumerate(img_matches.items()):
        if matches:
            best = matches[0]
            draw_match(overall, best, COLORS[i % len(COLORS)],
                       f'{key}  {best["rms_error_px"]:.1f}px')
    overall.save(output / 'best-one-each.jpg', quality=92)

    # Rather than a cluttered 30-overlay collage, provide separate views of
    # the reference shape and 3 independently positioned matches per image.
    qa = output / 'qa'
    qa.mkdir(exist_ok=True)
    for key, matches in img_matches.items():
        if not matches:
            continue
        count = min(preview_instances, len(matches))
        width = 768
        cells = [draw_reference(templates[key], (width, 432))]
        for j, match in enumerate(matches[:count]):
            image = source.copy()
            draw_match(image, match, COLORS[j % len(COLORS)],
                       f'{key} #{j+1} RMS={match["rms_error_px"]:.2f}px',
                       line_width=4)
            # Scale to thumbnail without altering the match source coordinates.
            cells.append(image.resize((width, 432), Image.Resampling.LANCZOS))
        out = Image.new('RGB', (width * 2, 432 * 2), (9, 14, 31))
        for n, cell in enumerate(cells[:4]):
            out.paste(cell, ((n % 2) * width, (n // 2) * 432))
        out.save(qa / f'{key}-top.jpg', quality=89)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus', type=Path, default=DEFAULT_CORPUS)
    parser.add_argument('--output', type=Path, default=Path('constellation-benchmark-v2'))
    parser.add_argument('--templates', type=Path, default=HERE/'templates-v2.json')
    parser.add_argument('--catalog', choices=['all', 'curated'], default='all')
    parser.add_argument('--attempts', type=int, default=20000)
    parser.add_argument('--instances', type=int, default=12)
    parser.add_argument('--threshold-px', type=float, default=13.0)
    parser.add_argument('--max-vertex-error-px', type=float, default=24.0)
    parser.add_argument('--min-scale', type=float, default=270.0)
    parser.add_argument('--max-scale', type=float, default=620.0)
    parser.add_argument('--min-separation-px', type=float, default=145.0)
    parser.add_argument('--seed', type=int, default=20261109)
    parser.add_argument('--rotation-limit-deg', type=float, default=65.0,
                        help='Max absolute rotation from template orientation (180 allows any)')
    parser.add_argument('--preview-instances', type=int, default=3)
    args = parser.parse_args()
    if args.attempts < 1 or args.instances < 1:
        parser.error('attempts and instances must be positive')
    if not 0 < args.rotation_limit_deg <= 180:
        parser.error('rotation-limit-deg must be in (0, 180]')
    args.output.mkdir(parents=True, exist_ok=True)
    templates = json.loads(args.templates.read_text())['templates']
    images = {}
    for folder in sorted(args.corpus.iterdir()):
        if not folder.is_dir():
            continue
        cat = folder / ('stars-all.json' if args.catalog == 'all'
                        else 'stars-curated.json')
        if not cat.is_file():
            continue
        stars, (width, height) = load_catalog(folder, args.catalog)
        img = folder / 'background-dim-16x9.jpg'
        if img.is_file() and Image.open(img).size != (width, height):
            raise ValueError(f'Image/catalog dimensions disagree: {folder}')
        results = {}
        for key, template in templates.items():
            seed = args.seed + sum(map(ord, f'{folder.name}-{key}'))
            matches = search(stars, template, seed=seed,
                             attempts=args.attempts, width=width, height=height,
                             instances=args.instances, min_scale=args.min_scale,
                             max_scale=args.max_scale, max_rms=args.threshold_px,
                             max_vertex=args.max_vertex_error_px,
                             margin=30, min_separation=args.min_separation_px,
                             rotation_limit_deg=args.rotation_limit_deg)
            results[key] = matches
            rms = f'{matches[0]["rms_error_px"]:.2f}' if matches else 'n/a'
            print(f'{folder.name:<20} {key:<4} {len(matches):>2} matches, '
                  f'best RMS {rms}', flush=True)
        report = {'catalog_source': args.catalog,
                  'num_input_stars': len(stars),
                  'template_matches': results}
        images[folder.name] = report
        if img.is_file():
            destination = args.output / folder.name
            destination.mkdir(exist_ok=True)
            render(img, results, templates, destination,
                   args.preview_instances)
    output = {'schema': 'mellon-constellation-matches-v2',
              'note': ('Geometrically matched reference templates, exact detected '
                       'image-star coordinates; ALL CANDIDATES REQUIRE VISUAL QA.'),
              'settings': {k: (str(v) if isinstance(v, Path) else v)
                           for k, v in vars(args).items()},
              'images': images}
    (args.output/'matches-v2.json').write_text(json.dumps(output, indent=2) + '\n')
    print('Report:', args.output/'matches-v2.json')

if __name__ == '__main__':
    main()
