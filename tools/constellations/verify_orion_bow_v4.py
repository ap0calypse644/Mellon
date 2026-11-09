#!/usr/bin/env python3
"""Verify Orion's bow comes from the retained astronomical reference lines.

Offline template test: no GNOME changes, no star catalog modification.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent


def check():
    v3 = json.loads((HERE / 'templates-v3.json').read_text())
    v4 = json.loads((HERE / 'templates-v4-orion-bow.json').read_text())
    atlas = json.loads((HERE / 'reference/constellations.lines.json').read_text())
    original = v3['templates']['Ori']
    expanded = v4['templates']['Ori']
    assert v4['schema'] == 'mellon-constellation-templates-v4'
    assert set(v3['templates']) == set(v4['templates']), 'Keep the same 31 templates'
    for name, t in v3['templates'].items():
        if name != 'Ori':
            assert t == v4['templates'][name], f'Unrelated template changed: {name}'
    assert len(original['points']) == 9 and len(expanded['points']) == 18
    assert expanded['edges'][:len(original['edges'])] == original['edges']
    assert len(expanded['edges']) == 18
    for edge in expanded['edges']:
        assert len(edge) == 2 and all(isinstance(i, int) and 0 <= i < 18
                                      for i in edge) and edge[0] != edge[1]
    assert len(set(tuple(sorted(edge)) for edge in expanded['edges'])) == 18

    # v3 Orion canonical point order, anchored to the upstream d3-celestial
    # line coordinates. Iota is a sword extension not present in the atlas.
    anchors = [
        [83.7845, 9.9342], [88.7929, 7.4071],
        [81.2828, 6.3497], [83.0017, -0.2991],
        [84.0534, -1.2019], [85.1897, -1.9426],
        [78.6345, -8.2016], [86.9391, -9.6696],
        [83.8580, -5.9097],
    ]

    def fit(xs, ys):
        mx = sum(xs)/len(xs)
        my = sum(ys)/len(ys)
        denominator = sum((x-mx)**2 for x in xs)
        slope = sum((x-mx)*(y-my) for x, y in zip(xs,ys)) / denominator
        return my-slope*mx, slope

    x_intercept, x_slope = fit(
        [p[0] for p in anchors], [p[0] for p in original['points']])
    y_intercept, y_slope = fit(
        [p[1] for p in anchors], [p[1] for p in original['points']])
    assert x_slope > 0 and y_slope < 0
    assert abs(x_slope + y_slope) < 1e-4, 'Uniform-scale mapping changed'
    for (ra, dec), (x, y) in zip(anchors, original['points']):
        assert math.hypot(x_intercept+x_slope*ra-x,
                          y_intercept+y_slope*dec-y) < 2.5e-5

    source = next(feature for feature in atlas['features']
                  if feature.get('id') == 'Ori')
    bow = source['geometry']['coordinates'][1]
    assert len(bow) == 9, 'Bow arc in reference changed'
    assert bow[5] == [73.7239, 10.1508]
    shoulder = [81.2828, 6.3497]
    main = source['geometry']['coordinates'][0]
    assert any(main[i-1] == shoulder and main[i] == bow[5]
               for i in range(1, len(main))), 'Bow attachment not in atlas'

    # Recreate the appended bow using only source coordinates and the
    # exact original similarity transform; no invented star positions.
    raw = [list(point) for point in original['points']]
    raw.extend([[x_intercept + x_slope * ra,
                 y_intercept + y_slope * dec] for ra, dec in bow])
    min_x, max_x = min(p[0] for p in raw), max(p[0] for p in raw)
    min_y, max_y = min(p[1] for p in raw), max(p[1] for p in raw)
    span = max(max_x - min_x, max_y - min_y)
    cx, cy = (min_x + max_x)/2, (min_y + max_y)/2
    expected = [[(x-cx)/span, (y-cy)/span] for x,y in raw]
    for a, b in zip(expected, expanded['points']):
        assert math.dist(a,b) < 3e-8, f'Bow geometry was modified: {a} / {b}'

    for i, edge in enumerate(original['edges']):
        assert expanded['edges'][i] == edge
    assert expanded['edges'][9:17] == [
        [9,10], [10,11], [11,12], [12,13],
        [13,14], [14,15], [15,16], [16,17],
    ], 'Bow arc topology changed'
    assert expanded['edges'][17] == [2,14], 'Shoulder-to-bow connection changed'
    counts = [0]*18
    for a,b in expanded['edges']:
        counts[a] += 1
        counts[b] += 1
    assert all(counts), 'Every bow/core vertex must connect to the figure'
    assert max(max(abs(x),abs(y)) for x,y in expanded['points']) <= .5000001
    print('PASS: 18-point astronomical Orion with 9-point bow arc, 18 edges')
    print('PASS: original 9 core vertices and edges retained by uniform transform')
    print('PASS: bow arc and shoulder attachment are present in d3-celestial')
    print('PASS: all 30 other constellations unchanged; no invented coordinates')


if __name__ == '__main__':
    check()
