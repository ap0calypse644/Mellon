#!/usr/bin/env python3
"""Fail-closed independent verification of the selected Mellon M4 MVP scene.

Only standard library is required. This checks exact source feature IDs, the
original image crop transform, template topology, display image checksum, and
(optionally) that the match came unchanged from the v6 benchmark report.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def projected(star, metadata):
    x, y = star['px'], star['py']
    sw, sh = metadata['source_width'], metadata['source_height']
    t = metadata['transform']
    angle = t['clockwise_degrees']
    if angle == 90:
        x, y = sh - 1 - y, x
    elif angle == 180:
        x, y = sw - 1 - x, sh - 1 - y
    elif angle == 270:
        x, y = y, sw - 1 - x
    elif angle != 0:
        raise AssertionError('Unsupported rotation')
    left, top, right, bottom = t['crop_box_rotated']
    w, h = t['output_size']
    return (w * (x - left) / (right - left),
            h * (y - top) / (bottom - top))


def run(root, scene_path, report):
    scene = json.loads(scene_path.read_text())
    assert scene['schema'] == 'mellon-mvp-scene-v1'
    assert scene['constellation'] == 'Ori'
    assert scene['image_size'] == [1920, 1080]
    assert scene['image'] == 'background.jpg'
    assert len(scene['star_ids']) == len(scene['vertices']) == 9
    assert len(set(scene['star_ids'])) == 9
    template = json.loads((root/'tools/constellations/templates-v3.json').read_text())['templates']['Ori']
    assert scene['edges'] == template['edges'], 'Template topology changed'

    folder = root/'assets/starfield/corpus-v1/catalogs'/scene['background_slug']
    metadata = json.loads((folder/'metadata.json').read_text())
    catalog = json.loads((folder/'stars-all.json').read_text())
    assert catalog['source_sha256'] == metadata['source_sha256'] == scene['source_image_sha256']
    assert metadata['transform']['output_size'] == [1920, 1080]
    image = folder/'background-dim-16x9.jpg'
    assert sha(image) == scene['image_sha256'] == metadata['dimmed_background_sha256']
    stars = {s['id']:s for s in catalog['stars']}
    for i, (star_id, vertex) in enumerate(zip(scene['star_ids'],scene['vertices'])):
        assert star_id in stars, f'Unknown detected image feature: {star_id}'
        assert len(vertex) == 2 and all(0.14 <= p <= 0.86 for p in vertex), f'Unsafe vertex {i}'
        real = projected(stars[star_id],metadata)
        xy = [vertex[0]*1920, vertex[1]*1080]
        assert math.dist(real,xy) <= 0.075, f'Feature #{i} moved: {math.dist(real,xy):.3f}px'
    if report:
        saved = json.loads(report.read_text())
        assert saved['schema'] == 'mellon-centered-constellation-matches-v6'
        match = saved['images'][scene['background_slug']]['matches']['Ori'][scene['v6_match_index_zero_based']]
        for key in ('star_ids','vertices','edges'):
            assert scene[key] == match[key], f'v6 {key} differs'
        assert math.isclose(scene['geometry']['rms_error_px'],match['rms_error_px'],abs_tol=1e-7)
    print('PASS: 9 source features, exact crop coordinates, image SHA256, Orion topology')
    if report:
        print('PASS: unmodified v6 candidate index',scene['v6_match_index_zero_based'])
    print('PASS: scene ready for M4 VM-only staging')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2])
    p.add_argument('--scene',type=Path)
    p.add_argument('--report',type=Path,help='Optional local original v6 report')
    a = p.parse_args()
    run(a.root, a.scene or a.root/'lab/gnome50-m4/scene.json',a.report)
