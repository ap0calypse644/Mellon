#!/usr/bin/env python3
"""Offline astronomy-template matcher; never invents/warps source star positions.

Sources: d3-celestial lines under BSD-3-Clause. See README.
Algorithm: randomized similarity transforms, unique nearest-star assignment,
then local refinement. Invalid matches are rejected, not forced into output.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment
from scipy.spatial import cKDTree
from PIL import Image, ImageDraw

THIS = Path(__file__).resolve().parent
DEFAULT_CORPUS = Path('assets/starfield/corpus-v1/catalogs')


def transformed(points: np.ndarray, center, radius, theta) -> np.ndarray:
    c, s = math.cos(theta), math.sin(theta)
    return points @ np.array([[c, s], [-s, c]]) * radius + center


def solve(stars, template, *, seed=2026, attempts=1400, min_size=260,
          max_size=520, max_rms_px=28.0, margin=40):
    xy = np.array([[float(s['px']), float(s['py'])] for s in stars])
    width, height = 1920, 1080
    t = np.array(template['points'], dtype=float)
    tree = cKDTree(xy)
    rng = np.random.default_rng(seed)
    best = None
    for _ in range(attempts):
        center = np.array([rng.uniform(300, 1620), rng.uniform(170, 900)])
        radius = rng.uniform(min_size, max_size)
        theta = rng.uniform(-math.pi, math.pi)
        targets = transformed(t, center, radius, theta)
        if (targets[:, 0].min() < margin or targets[:, 0].max() > width - margin
                or targets[:, 1].min() < margin or targets[:, 1].max() > height - margin):
            continue
        distance, indices = tree.query(targets, k=min(8, len(stars)))
        if indices.ndim == 1:
            indices = indices.reshape(-1, 1)
        candidates = np.unique(indices)
        if len(candidates) < len(t):
            continue
        costs = np.sum((targets[:, None] - xy[candidates][None, :])**2, axis=2)
        # Assign uniquely among eight nearest candidates to each vertex.
        row_allowed = np.zeros_like(costs, dtype=bool)
        row_allowed[np.arange(len(t))[:, None], np.searchsorted(candidates, indices)] = True
        costs[~row_allowed] = 1e10
        rows, cols = linear_sum_assignment(costs)
        if np.any(costs[rows, cols] > 28**2 * 9):
            continue
        assignment = candidates[cols]
        rms = float(np.sqrt(np.mean(np.sum((xy[assignment] - targets)**2, axis=1))))
        if best is None or rms < best['rms_error_px']:
            best = {'rms_error_px': rms, 'assignment': assignment.tolist(),
                    'targets': targets, 'radius': radius, 'angle_rad': theta,
                    'center': center.tolist()}
    if best is None or best['rms_error_px'] > max_rms_px:
        return None
    selected = [stars[i] for i in best['assignment']]
    assert len({s['id'] for s in selected}) == len(selected)
    return {'star_ids': [s['id'] for s in selected],
            'vertices': [[round(s['x'], 7), round(s['y'], 7)] for s in selected],
            'edges': template['edges'],
            'rms_error_px': round(best['rms_error_px'], 2),
            'relative_rms': round(best['rms_error_px'] / best['radius'], 4),
            'transform': {'center_px': [round(v, 1) for v in best['center']],
                          'rotation_deg': round(math.degrees(best['angle_rad']), 1),
                          'scale_px': round(best['radius'], 1)},
            'status': 'candidate-needs-visual-review'}


def render(img, results, templates, path):
    im = Image.open(img).convert('RGB')
    draw = ImageDraw.Draw(im, 'RGBA')
    palette = [(105, 202, 255, 210), (210, 142, 255, 210),
               (116, 255, 196, 210), (255, 199, 121, 210), (255, 128, 163, 210)]
    for (key, res), color in zip(results.items(), palette):
        if res is None:
            continue
        vertices = [(x*im.width, y*im.height) for x, y in res['vertices']]
        for a, b in res['edges']:
            draw.line([vertices[a], vertices[b]], fill=color, width=3)
        for x, y in vertices:
            draw.ellipse((x-4, y-4, x+4, y+4), fill=(238, 249, 255, 230),
                         outline=color, width=2)
        center = res['transform']['center_px']
        draw.text((center[0]+5, center[1]+4), f"{key} ({res['rms_error_px']:.1f}px)", fill=color)
    im.save(path, quality=91)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--corpus', type=Path, default=DEFAULT_CORPUS)
    parser.add_argument('--output', type=Path, default=Path('constellation-benchmark'))
    parser.add_argument('--attempts', type=int, default=1400)
    parser.add_argument('--threshold-px', type=float, default=28)
    args = parser.parse_args()
    templates = json.loads((THIS/'templates.json').read_text())['templates']
    args.output.mkdir(parents=True, exist_ok=True)
    report = {}
    for folder in sorted(args.corpus.iterdir()):
        catfile = folder/'stars-curated.json'
        if not catfile.is_file():
            continue
        data = json.loads(catfile.read_text())
        stars = data['stars']
        matches = {}
        for key, template in templates.items():
            result = solve(stars, template, seed=2026+sum(map(ord, folder.name + key)),
                           attempts=args.attempts, max_rms_px=args.threshold_px)
            matches[key] = result
            print(folder.name, key, 'REJECT' if result is None else
                  f"{result['rms_error_px']:.1f}px")
        imagefile = folder/'background-dim-16x9.jpg'
        if imagefile.is_file():
            render(imagefile, matches, templates,
                   args.output/f'{folder.name}-overlay.jpg')
        report[folder.name] = {'catalog_sha256': data['image_sha256'],
                               'matches': matches}
    (args.output/'matches.json').write_text(json.dumps({
        'schema': 'mellon-constellation-matches-v1',
        'note': 'CANDIDATES ONLY; requires visual inspection before production',
        'images': report}, indent=2) + '\n')
    print('Wrote:', args.output)


if __name__ == '__main__':
    main()
