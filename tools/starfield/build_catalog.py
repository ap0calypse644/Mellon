#!/usr/bin/env python3
"""Create a pixel-aligned catalog of luminous points from an existing image.

Does not invent or add stars. Detections are *image features*, not claims about
astronomical identity. All coordinates refer to the unmodified source image.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import cKDTree

VERSION = 'mellon-starfield-v1'
SOURCE_PAGE = 'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-24/'
SOURCE_URL = ('https://assets.science.nasa.gov/dynamicimage/assets/science/missions/'
              'hubble/stars/star-cloud/Hubble_M24_1_flat_FINAL_A_rot90.jpg'
              '?crop=faces%2Cfocalpoint&fit=clip&h=2022&w=3775')
CREDIT = ('NASA, ESA, and R. Sahai (Jet Propulsion Laboratory); '
          'processing: Gladys Kober (NASA/Catholic University of America)')


def detect(rgb: np.ndarray, threshold: float, separation: float,
           limit: int) -> list[dict]:
    height, width = rgb.shape[:2]
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)

    # Remove slowly varying sky background, rather than demanding bright stars.
    # A DoG response rejects much of the nebula / star-halo background.
    detail = cv2.GaussianBlur(gray, (0, 0), 1.0)
    background = cv2.GaussianBlur(gray, (0, 0), 8.0)
    response = detail - background

    # Candidate peaks: 7x7 spatial local maxima and enough contrast above the
    # local background. Separately require enough contiguous signal to reject
    # compression spikes and isolated hot pixels.
    kernel = np.ones((7, 7), dtype=np.uint8)
    local_max = cv2.dilate(response, kernel)
    mask = (response >= local_max - 1e-5) & (response >= threshold)
    # Ignore boundary peaks because the moment/annulus estimator is incomplete.
    mask[:7, :] = False
    mask[-7:, :] = False
    mask[:, :7] = False
    mask[:, -7:] = False
    py, px = np.nonzero(mask)
    strengths = response[py, px]
    ranks = np.argsort(-strengths, kind='stable')

    # Grid-accelerated NMS is deterministic and avoids selecting diffraction
    # spike splinters as many separate stars near the same bright object.
    cell = max(2.0, separation)
    occupied: dict[tuple[int, int], list[tuple[float, float]]] = {}
    accepted: list[dict] = []
    yy, xx = np.mgrid[-3:4, -3:4]
    for rank in ranks:
        ix, iy = int(px[rank]), int(py[rank])
        strength = float(strengths[rank])
        patch = np.maximum(response[iy - 3:iy + 4, ix - 3:ix + 4], 0.0)
        # A single harsh pixel spike or big diffuse source is not a reliably
        # isolatable luminous point. Tiny real stars may be excluded here.
        area = int(np.count_nonzero(patch > strength * .28))
        if area < 2 or area > 46:
            continue

        weights = patch * patch
        mass = float(weights.sum())
        if mass <= 0:
            continue
        cx = ix + float((weights * xx).sum()) / mass
        cy = iy + float((weights * yy).sum()) / mass
        var_x = float((weights * (xx - (cx - ix)) ** 2).sum()) / mass
        var_y = float((weights * (yy - (cy - iy)) ** 2).sum()) / mass
        sigma = math.sqrt((var_x + var_y) * .5)
        if not (0.34 <= sigma <= 2.9):
            continue

        gx, gy = int(cx // cell), int(cy // cell)
        if any((ox - cx) ** 2 + (oy - cy) ** 2 < separation ** 2
               for nx in (gx - 1, gx, gx + 1)
               for ny in (gy - 1, gy, gy + 1)
               for ox, oy in occupied.get((nx, ny), ())):
            continue

        # Simple local confidence proxy, not a calibrated probability.
        prominence = float(response[iy, ix])
        crispness = min(1.0, prominence / (threshold * 4))
        size_quality = min(1., area / 4.0)
        quality = round(.52 + .32 * crispness + .15 * size_quality, 3)
        rgb_patch = rgb[iy - 1:iy + 2, ix - 1:ix + 2, :].mean(axis=(0, 1))
        accepted.append({
            'id': '',
            'x': round(cx / width, 7), 'y': round(cy / height, 7),
            'px': round(cx, 2), 'py': round(cy, 2),
            'brightness': round(float(gray[iy, ix]) / 255.0, 4),
            'prominence': round(prominence, 2),
            'radius_px': round(max(.5, sigma * 1.18), 2),
            'rgb': [int(round(v)) for v in rgb_patch],
            'quality_score': quality,
        })
        occupied.setdefault((gx, gy), []).append((cx, cy))
        if len(accepted) >= limit:
            break

    # Spatial ordering yields stable IDs independent of candidate strength.
    accepted.sort(key=lambda v: (v['py'], v['px']))
    for number, star in enumerate(accepted):
        star['id'] = f'S{number + 1:06d}'
    return accepted


def make_graph(stars: list[dict], neighbors: int, max_edge_px: float) -> dict:
    if not stars:
        return {'k': neighbors, 'edges': [], 'adjacency': {}}
    coords = np.array([[s['px'], s['py']] for s in stars], dtype=float)
    tree = cKDTree(coords)
    k = min(neighbors + 1, len(stars))
    dists, indices = tree.query(coords, k=k)
    if k == 1:
        dists = dists.reshape((-1, 1))
        indices = indices.reshape((-1, 1))
    edges = set()
    adj: dict[str, list[str]] = {}
    for i, star in enumerate(stars):
        adj[star['id']] = []
        for distance, j in zip(dists[i], indices[i]):
            j = int(j)
            if i == j or distance > max_edge_px:
                continue
            a, b = sorted((i, j))
            edges.add((a, b))
            adj[star['id']].append(stars[j]['id'])
    return {
        'k': neighbors,
        'max_edge_px': max_edge_px,
        'edges': [[stars[i]['id'], stars[j]['id']] for i, j in sorted(edges)],
        'adjacency': adj,
    }


def make_preview(image: Image.Image, stars: list[dict], path: Path, maxwidth: int = 1920):
    width, height = image.size
    ratio = min(1.0, maxwidth / width)
    # This QA preview is NOT the canonical coordinate space; original is.
    preview = image.resize((round(width * ratio), round(height * ratio)),
                           Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(preview)
    for star in stars:
        x, y = star['px'] * ratio, star['py'] * ratio
        radius = 1.35 if star['quality_score'] >= .86 else .85
        draw.ellipse((x - radius, y - radius, x + radius, y + radius),
                     outline=(47, 255, 155))
    preview.save(path, quality=89, optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--threshold', type=float, default=5.6,
                        help='Minimum DoG prominence in 8-bit luminosity units')
    parser.add_argument('--min-separation', type=float, default=5.0,
                        help='Minimum pixel distance between independently indexed points')
    parser.add_argument('--limit', type=int, default=25000)
    parser.add_argument('--neighbors', type=int, default=8)
    parser.add_argument('--max-edge-px', type=float, default=180)
    args = parser.parse_args()

    if args.threshold <= 0 or args.min_separation < 2 or args.limit < 100:
        parser.error('invalid detection parameters')
    if not args.image.is_file():
        parser.error('source image does not exist')
    args.out.mkdir(parents=True, exist_ok=True)
    image = Image.open(args.image).convert('RGB')
    width, height = image.size
    if min(width, height) < 600:
        parser.error('input too small; do not use a thumbnail')

    array = np.asarray(image)
    stars = detect(array, args.threshold, args.min_separation, args.limit)
    if len(stars) < 300:
        raise RuntimeError(f'only {len(stars)} candidate stars; check source or threshold')
    graph = make_graph(stars, args.neighbors, args.max_edge_px)

    metadata = {
        'schema': VERSION,
        'image_file': args.image.name,
        'source_page': SOURCE_PAGE,
        'source_url': SOURCE_URL,
        'credit': CREDIT,
        'usage': 'NASA media guidelines; credit NASA/ESA and listed researchers; no endorsement implied',
        'source_sha256': hashlib.sha256(args.image.read_bytes()).hexdigest(),
        'width': width, 'height': height,
        'coordinate_origin': 'top-left',
        'coordinate_convention': 'normalized x=px/width, y=py/height before any crop or scaling',
        'object_definition': 'isolated luminous image features; may include nonstellar artifacts',
        'detection': {
            'algorithm': 'Gaussian difference of blurred luminance + local-maximum + morphology + NMS',
            'threshold': args.threshold,
            'min_separation_px': args.min_separation,
            'limit': args.limit,
            'quality_score': 'relative heuristic, NOT statistical probability of being a real star',
        },
        'total_points': len(stars),
        'graph_edges': len(graph['edges']),
        'generated_utc': datetime.now(timezone.utc).isoformat(),
    }
    (args.out / 'stars.json').write_text(json.dumps({
        'schema': VERSION, 'width': width, 'height': height,
        'image_sha256': metadata['source_sha256'],
        'stars': stars,
    }, separators=(',', ':')) + '\n')
    (args.out / 'graph.json').write_text(json.dumps(graph, separators=(',', ':')) + '\n')
    (args.out / 'metadata.json').write_text(json.dumps(metadata, indent=2) + '\n')
    make_preview(image, stars, args.out / 'detections-preview.jpg')
    print(f'Detected {len(stars):,} isolated luminous points in {width}x{height} image')
    print(f'Created {len(graph["edges"]):,} candidate graph edges')
    print(f'Source SHA256: {metadata["source_sha256"]}')
    print(f'Output: {args.out}')


if __name__ == '__main__':
    main()
