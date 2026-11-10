#!/usr/bin/env python3
"""Pixel-level review images for Mellon quality-first real-star matches.

Only modifies tiny neighborhoods of the *selected existing pixels* in
copies of the supplied background. Preserves per-star RGB chromatic ratios.
No white synthetic star markers, large halo circles, bounding boxes or labels.
A second copy adds precisely one-pixel-wide subdued constellation lines.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

def enhance_existing_stars(dimmed: Image.Image, original: Image.Image,
                           vertices: list[list[float]], *, strength: float,
                           radius: float) -> Image.Image:
    if dimmed.size != original.size:
        raise ValueError('Original and dimmed backgrounds have different sizes')
    if radius <= 0 or radius > 7 or not 0 < strength <= 1:
        raise ValueError('Invalid subpixel enhancement range')
    w, h = dimmed.size
    result = np.array(dimmed.convert('RGB'), dtype=np.float32, copy=True)
    reference = np.asarray(original.convert('RGB'), dtype=np.float32)

    for nx, ny in vertices:
        x, y = nx * w, ny * h
        # Sample the brightest actual source pixel close to the exact
        # detector centroid, preserving its existing red/blue/gold tint.
        cx, cy = int(round(x)), int(round(y))
        xa, xb = max(0, cx-2), min(w, cx+3)
        ya, yb = max(0, cy-2), min(h, cy+3)
        if xa >= xb or ya >= yb:
            raise ValueError('Source centroid outside image')
        patch = reference[ya:yb, xa:xb]
        luminance = .2126*patch[..., 0]+.7152*patch[..., 1]+.0722*patch[..., 2]
        bright_pixel = patch.reshape(-1, 3)[int(luminance.argmax())]
        bright_max = float(bright_pixel.max())
        if bright_max <= 1.0:
            raise ValueError(f'Selected detection has no source pixel brightness at {x:.1f},{y:.1f}')
        # Relative RGB gains retain hue: blue stays blue, red stays red,
        # gold stays gold, and white stays nearly neutral.
        chroma = bright_pixel / bright_max
        # Strength is a proportional lift of the existing source star;
        # the Gaussian broadens it by just a few pixel widths.
        amplitude = strength * min(170., 85. + .42*bright_max)
        x0, x1 = max(0, int(math.floor(x-radius))), min(w, int(math.ceil(x+radius))+1)
        y0, y1 = max(0, int(math.floor(y-radius))), min(h, int(math.ceil(y+radius))+1)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        dist2 = (xx-x)**2 + (yy-y)**2
        sigma = max(.75, radius*.43)
        weight = np.exp(-dist2/(2*sigma*sigma))
        weight[dist2 > radius*radius] = 0
        # Pixel modification, not new dots or a generic white overlay.
        result[y0:y1, x0:x1] += amplitude * weight[..., None] * chroma[None, None, :]
    return Image.fromarray(np.uint8(np.clip(np.rint(result), 0, 255)), 'RGB')


def add_thin_lines(image: Image.Image, vertices, edges, alpha: int) -> Image.Image:
    if not 0 <= alpha <= 255:
        raise ValueError('Invalid line transparency')
    coords = [(round(nx*image.width), round(ny*image.height))
              for nx, ny in vertices]
    overlay = Image.new('RGBA', image.size, (0,0,0,0))
    pen = ImageDraw.Draw(overlay)
    for a, b in edges:
        pen.line([coords[a], coords[b]], fill=(109, 181, 218, alpha), width=1)
    return Image.alpha_composite(image.convert('RGBA'), overlay).convert('RGB')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--input', type=Path, required=True,
                    help='Prepared quality catalog used for Go search')
    ap.add_argument('--matches', type=Path, required=True)
    ap.add_argument('--corpus', type=Path,
                    default=Path('assets/starfield/corpus-v1/catalogs'))
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--boost', type=float, default=.65,
                    help='Brightness strength, 0..1; default 0.65')
    ap.add_argument('--radius', type=float, default=3.25,
                    help='Maximum locally modified radius, 0..7 pixels')
    ap.add_argument('--line-alpha', type=int, default=130,
                    help='One-pixel line transparency, 0..255')
    args = ap.parse_args()
    inp = json.loads(args.input.read_text())
    data = json.loads(args.matches.read_text())
    if inp['schema'] != 'mellon-quality-input-v1' or data['schema'] != 'mellon-quality-results-v1':
        raise ValueError('Invalid source or result schema')
    for slug, entry in sorted(data['images'].items()):
        background = args.corpus / slug
        with Image.open(background / 'background-16x9.jpg') as im:
            original = im.convert('RGB')
        with Image.open(background / 'background-dim-16x9.jpg') as im:
            dimmed = im.convert('RGB')
        if tuple(entry['image_size']) != dimmed.size:
            raise ValueError(f'Stale image dimension in {slug}')
        for number, m in enumerate(entry['matches'], 1):
            target = args.output / slug / f'{number:02d}-{m["constellation"]}'
            target.mkdir(parents=True, exist_ok=True)
            # Build the star pixels from the pristine dimmed source for each
            # separate scene. We NEVER mutate the original source photograph.
            enhanced = enhance_existing_stars(dimmed, original, m['vertices'],
                                               strength=args.boost, radius=args.radius)
            enhanced.save(target / 'selected-star-pixels.png', optimize=True)
            lines = add_thin_lines(enhanced, m['vertices'], m['edges'], args.line_alpha)
            lines.save(target / 'thin-constellation-lines.png', optimize=True)
            (target / 'match.json').write_text(json.dumps(m, indent=2) + '\n')
        print(f'{slug}: {len(entry["matches"])} scenes × 2 pixel-based previews', flush=True)
    print('Rendered: ', args.output, flush=True)

if __name__ == '__main__':
    main()
