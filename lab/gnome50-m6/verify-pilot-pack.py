#!/usr/bin/env python3
"""Fail-closed validation of the M6.4 twelve-scene photo pack before VM deploy."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


def validate(pack: Path):
    if not pack.is_dir() or pack.is_symlink():
        raise ValueError('M6 pack must be an ordinary directory')
    library = json.loads((pack/'library.json').read_text())
    config = json.loads((pack/'scene-config.json').read_text())
    if library.get('schema') != 'mellon-m6-scene-library-v1':
        raise ValueError('Unexpected M6 scene library schema')
    provenance = library.get('provenance') or {}
    if provenance.get('star_light_renderer') != 'mellon-m6-photo-light-v4':
        raise ValueError('Stale star pack detected; rebuild with the v4 renderer')
    if provenance.get('library_release') != 'mellon-m6.4-curated-12-v1':
        raise ValueError('Stale M6.3/six-scene pack; M6.4 needs the twelve-scene release')
    gain = provenance.get('enhance_gain')
    expand = provenance.get('expand_factor')
    if (not isinstance(gain,(int,float)) or abs(gain - 7.20) > 0.000001 or
        not isinstance(expand,(int,float)) or abs(expand - 2.12) > 0.000001):
        raise ValueError('Unexpected M6.3 brightness/expansion settings')
    scenes = library.get('scenes')
    if not isinstance(scenes,list) or len(scenes)!=12:
        raise ValueError('M6.4 must contain exactly twelve curated scene records')
    ids, backgrounds = set(), set()
    for scene in scenes:
        scene_id=scene['id']
        if scene_id in ids or scene['background'] != scene_id.split('/')[0]:
            raise ValueError(f'Invalid or duplicate scene: {scene_id}')
        ids.add(scene_id); backgrounds.add(scene['background'])
        n=len(scene['vertices'])
        if (n < 8 or n > 24 or len(scene['star_ids'])!=n or
            len(set(scene['star_ids']))!=n or
            len(scene['sprites'])!=n or scene['sprite_size']!=[26,26] or
            scene['image_size']!=[1920,1080] or
            not all(0 < p[0] < 1 and 0 < p[1] < 1 for p in scene['vertices'])):
            raise ValueError(f'Malformed source-star scene: {scene_id}')
        if any(len(e)!=2 or min(e)<0 or max(e)>=n or e[0]==e[1]
               for e in scene['edges']):
            raise ValueError(f'Bad constellation edges: {scene_id}')
        for rel in [scene['image'],*scene['sprites']]:
            path=Path(rel)
            if (path.is_absolute() or '..' in path.parts or
                path.parts[0]!='assets'):
                raise ValueError(f'Unsafe asset path: {rel}')
            full=pack/path
            if not full.is_file() or full.is_symlink():
                raise ValueError(f'Missing/linked M6 asset: {rel}')
        photo=pack/scene['image']
        if hashlib.sha256(photo.read_bytes()).hexdigest()!=scene['image_sha256']:
            raise ValueError(f'Image SHA256 mismatch: {scene_id}')
        with Image.open(photo) as im:
            if im.size != (1920,1080):
                raise ValueError(f'Photo size mismatch: {scene_id}')
        for path in scene['sprites']:
            with Image.open(pack/path) as image:
                if image.size!=(26,26) or image.mode!='RGBA':
                    raise ValueError(f'Invalid source-photometry overlay: {path}')
                if image.getchannel('A').getextrema()[1] == 0:
                    raise ValueError(f'Empty selected-source star overlay: {path}')
    if len(backgrounds)!=6 or config.get('stages')!=8:
        raise ValueError('Missing backgrounds or invalid animation stages')
    if config.get('mode')=='fixed':
        if config.get('scene_id') not in ids:
            raise ValueError('Unknown manually selected scene')
    elif config.get('mode')!='random-on-lock':
        raise ValueError('Unknown scene selection mode')
    print('PASS: exactly twelve vetted, >=8-star source-photographic scenes')
    print('PASS: brighter, slightly larger v4 photo-derived sprites, image SHA256, geometry and paths')
    print('PASS: fixed scene or per-lock random configuration valid')
    return scenes


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pack',required=True,type=Path)
    a=parser.parse_args()
    validate(a.pack)
