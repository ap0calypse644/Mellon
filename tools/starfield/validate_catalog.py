#!/usr/bin/env python3
"""Validate stored coordinates against the exact, hashed original image."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--image', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    args = ap.parse_args()
    stars_data = json.loads((args.out / 'stars.json').read_text())
    meta = json.loads((args.out / 'metadata.json').read_text())
    graph = json.loads((args.out / 'graph.json').read_text())
    stars = stars_data['stars']
    image = np.array(Image.open(args.image).convert('RGB'))
    h, w = image.shape[:2]
    assert (meta['width'], meta['height']) == (w, h)
    assert (stars_data['width'], stars_data['height']) == (w, h)
    digest = hashlib.sha256(args.image.read_bytes()).hexdigest()
    assert digest == meta['source_sha256'] == stars_data['image_sha256']
    assert len(stars) == meta['total_points'] >= 300
    assert len(stars) == len(set(s['id'] for s in stars))
    assert all(0 <= s['x'] <= 1 and 0 <= s['y'] <= 1 for s in stars)
    assert all(abs(s['x'] * w - s['px']) < .02 and
               abs(s['y'] * h - s['py']) < .02 for s in stars)

    coords = np.array([[s['px'], s['py']] for s in stars], dtype=float)
    from scipy.spatial import cKDTree
    if len(stars) > 1:
        distance, _ = cKDTree(coords).query(coords, k=2)
        min_spacing = float(np.min(distance[:, 1]))
        assert min_spacing >= meta['detection']['min_separation_px'] - .05, min_spacing
    else:
        min_spacing = None

    ids = set(s['id'] for s in stars)
    assert set(graph['adjacency']) == ids
    assert all(a in ids and b in ids and a != b for a, b in graph['edges'])
    assert len(graph['edges']) == meta['graph_edges']

    # Spot-check source pixel correspondence, NOT astrophysical classification.
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY).astype(np.float32)
    response = cv2.GaussianBlur(gray, (0, 0), 1.0) - cv2.GaussianBlur(gray, (0, 0), 8.0)
    order = np.linspace(0, len(stars)-1, min(3000, len(stars)), dtype=int)
    ok = 0
    for index in order:
        s = stars[index]
        x, y = round(s['px']), round(s['py'])
        peak = response[max(0, y-2):y+3, max(0, x-2):x+3].max()
        if peak >= meta['detection']['threshold'] * .85:
            ok += 1
    fraction = ok / len(order)
    assert fraction >= .97, f'Only {fraction:.1%} sampled coordinates align with bright features'

    print(f'PASS: {len(stars):,} coordinate records; {len(graph["edges"]):,} graph edges')
    print(f'PASS: original image {w}x{h} SHA256 verified')
    print(f'PASS: minimum star distance {min_spacing:.2f}px')
    print(f'PASS: {fraction:.2%} brightness agreement in {len(order)} sampled points')
    print('NOTE: image-feature confidence is not astronomical star classification')


if __name__ == '__main__':
    main()
