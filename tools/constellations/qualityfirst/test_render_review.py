#!/usr/bin/env python3
"""Non-search renderer unit checks using tiny synthetic RGB images only."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_review import enhance_existing_stars, add_thin_lines


def test_color_preservation():
    a = np.full((25,25,3), 9, dtype=np.uint8)
    dim = np.full((25,25,3), 4, dtype=np.uint8)
    a[12,12] = [20,35,225]  # A real blue source pixel
    a[6,6] = [215,34,18]   # A separate real red source pixel
    im = enhance_existing_stars(
        Image.fromarray(dim, 'RGB'), Image.fromarray(a, 'RGB'),
        [[12/25, 12/25], [6/25, 6/25]], strength=.7, radius=3.25)
    pixels = np.asarray(im)
    blue = pixels[12,12]
    red = pixels[6,6]
    assert blue[2] > blue[1] > blue[0], f'Blue star lost hue: {blue}'
    assert red[0] > red[1] > red[2], f'Red star lost hue: {red}'
    assert np.any(pixels[12,13] > dim[12,13]), 'Blue star not enlarged'
    assert np.any(pixels[6,7] > dim[6,7]), 'Red star not enlarged'
    assert np.array_equal(pixels[0,0], dim[0,0]), 'Unselected background was modified'


def test_thin_lines():
    base = Image.new('RGB', (25,25), (4,4,4))
    lined = add_thin_lines(base, [[4/25,4/25],[20/25,4/25]],[[0,1]], 130)
    out = np.asarray(lined)
    assert out[4,12,2] > 4, 'Missing one-pixel line'
    assert np.array_equal(out[5,12], [4,4,4]), 'Line thicker than one pixel'
    assert np.array_equal(out[3,12], [4,4,4]), 'Line thicker than one pixel'


if __name__ == '__main__':
    test_color_preservation()
    test_thin_lines()
    print('PASS: synthetic red/blue pixel enhancement and exactly 1px line QA')
