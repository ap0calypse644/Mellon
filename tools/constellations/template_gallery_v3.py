#!/usr/bin/env python3
"""Create a reference-only constellation atlas from Mellon template geometry."""
import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent


def font(size):
    try:
        return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', size)
    except OSError:
        return ImageFont.load_default()


def render_card(identifier, template, size=(340, 290)):
    w, h = size
    im = Image.new('RGB', size, (11, 15, 31))
    d = ImageDraw.Draw(im, 'RGBA')
    d.rounded_rectangle((9, 9, w - 10, h - 9), radius=14,
                        outline=(72, 100, 142, 180), width=2)
    label = template['name']
    d.text((25, 21), label, font=font(17), fill=(214, 225, 255))
    d.text((25, 48), f"{identifier}   {len(template['points'])} stars",
           font=font(12), fill=(140, 174, 208))
    pts = template['points']
    if not pts:
        raise ValueError(f'Empty constellation: {identifier}')
    if any(len(p) != 2 or not all(math.isfinite(v) for v in p) for p in pts):
        raise ValueError(f'Invalid vertices: {identifier}')
    radius = 166
    center = (w / 2, 177)
    coords = [(center[0] + x * radius, center[1] + y * radius) for x, y in pts]
    for a, b in template['edges']:
        if not (0 <= a < len(coords) and 0 <= b < len(coords)) or a == b:
            raise ValueError(f'Invalid edge in {identifier}')
        d.line([coords[a], coords[b]], fill=(75, 168, 217, 208), width=2)
    for x, y in coords:
        d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(230, 244, 255))
    return im


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--templates', type=Path,
                    default=HERE / 'templates-v3.json')
    ap.add_argument('--output', type=Path,
                    default=Path('constellation-reference-atlas.jpg'))
    ap.add_argument('--columns', type=int, default=5)
    args = ap.parse_args()
    if args.columns < 1:
        ap.error('columns must be positive')
    templates = json.loads(args.templates.read_text())['templates']
    cards = [render_card(key, item) for key, item in templates.items()]
    cols = min(args.columns, len(cards))
    rows = math.ceil(len(cards) / cols)
    w, h = cards[0].size
    canvas = Image.new('RGB', (cols * w, rows * h), (6, 9, 20))
    for i, card in enumerate(cards):
        canvas.paste(card, ((i % cols) * w, (i // cols) * h))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output, quality=92, optimize=True)
    print(f'Wrote {len(cards)} reference shapes: {args.output}')


if __name__ == '__main__':
    main()
