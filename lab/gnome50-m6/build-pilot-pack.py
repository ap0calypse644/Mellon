#!/usr/bin/env python3
"""Package M6 pilot scenes from the user's verified local v9 database.

NEVER search for new stars, move existing coordinates, or touch host/guest GNOME.
Uses only v9's exact star IDs, vertices and edges plus original photo pixels.
Outputs six photographs, sparse RGBA per-star overlays, JSON library/config.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
WIDTH, HEIGHT = 1920, 1080
SPRITE_SIZE = 26
HALF = SPRITE_SIZE // 2


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bilinear(image: np.ndarray, x: float, y: float) -> np.ndarray:
    height, width = image.shape[:2]
    x = float(np.clip(x, 0, width - 1))
    y = float(np.clip(y, 0, height - 1))
    x0, y0 = int(math.floor(x)), int(math.floor(y))
    x1, y1 = min(x0 + 1, width - 1), min(y0 + 1, height - 1)
    fx, fy = x - x0, y - y0
    return ((1-fy) * ((1-fx)*image[y0,x0] + fx*image[y0,x1]) +
             fy * ((1-fx)*image[y1,x0] + fx*image[y1,x1]))


def star_sprite(dim: np.ndarray, original: np.ndarray, x: float, y: float,
                gain: float = 6.20, expand: float = 1.90) -> Image.Image:
    """Recover real photographed light; make a sparse alpha patch for St.Widget.

    Alpha inversion produces a transparent texture which, composited at 100%
    over the original DIM JPEG, recreates a locally brightened version of the
    exact same star pixels. No generic circular fill, white point or halo.
    """
    if not (4 < x < WIDTH-5 and 4 < y < HEIGHT-5):
        raise ValueError('Detected star outside image')
    samples = []
    for i in range(20):
        theta = 2 * math.pi * i / 20
        radius = 9.0 + (i % 4)
        samples.append(bilinear(original, x + radius*math.cos(theta),
                               y + radius*math.sin(theta)))
    base = np.median(np.asarray(samples, dtype=np.float32), axis=0)
    out = np.zeros((SPRITE_SIZE, SPRITE_SIZE, 4), dtype=np.uint8)
    pixels_nonzero = 0
    for py in range(SPRITE_SIZE):
        for px in range(SPRITE_SIZE):
            dx, dy = px - HALF, py - HALF
            r = math.hypot(dx, dy)
            if r > 10.75:
                continue
            # Isolate and magnify *only* the existing local source star light.
            photon = bilinear(original, x+dx/expand, y+dy/expand)
            residual = np.maximum(photon-base, 0.0)
            if float(np.max(residual)) < 1.5:
                continue
            feather = 1.0
            if r > 5.5:
                k = max(0.0, min(1.0, (10.75-r)/5.25))
                feather = k*k*(3-2*k)
            if feather < .001:
                continue
            actual = bilinear(dim, x+dx, y+dy)
            # Brighter than M6.0, but scale ALL RGB residual channels by
            # the same gain. Independent per-channel clipping would wash a
            # colored blue/red star toward neutral white.
            wanted = residual * gain * feather
            headroom = np.maximum(0.0, 252.0-actual)
            occupied = wanted > 0.001
            safe_scale = min(1.0, float(np.min(headroom[occupied] /
                                            wanted[occupied])))
            delta = wanted * max(0.0, safe_scale)
            if float(np.max(delta)) < 0.25:
                continue
            # Solve opacity * (spriteRGB - actualRGB) == deltaRGB.
            denom = np.maximum(1.0, 255-actual)
            alpha = float(np.max(delta/denom))
            if alpha < 1/255:
                continue
            sprite_rgb = np.clip(actual+delta/alpha,0,255)
            out[py,px,:3] = np.rint(sprite_rgb).astype(np.uint8)
            out[py,px,3] = round(min(1.0,alpha)*255)
            pixels_nonzero += 1
    if pixels_nonzero < 2:
        raise ValueError(f'Insufficient original star pixels at ({x:.2f},{y:.2f})')
    return Image.fromarray(out,'RGBA')


def build(selection: Path, index: Path, database: Path, corpus: Path,
          dest: Path, *, gain: float = 6.20, expand: float = 1.90):
    config = json.loads(selection.read_text())
    qa_index = json.loads(index.read_text())
    report = json.loads(database.read_text())
    if config['schema'] != 'mellon-m6-pilot-selection-v1':
        raise ValueError('Unknown M6 selection schema')
    if report.get('schema') != 'mellon-quality-constellation-matches-v9':
        raise ValueError('Not a verified v9 constellation database')
    ids = config['pilot_scene_ids']
    if len(ids) != 6 or len(set(ids)) != 6:
        raise ValueError('Exactly six distinct pilot scenes required')
    if dest.exists():
        raise FileExistsError(f'Pack already exists; refusing overwrite: {dest}')
    if not (1.0 <= gain <= 7.0 and 1.0 <= expand <= 2.3):
        raise ValueError('Invalid original-pixel enhancement settings')

    # Perform all image/schema validation before writing the final pack.
    jobs = []
    for scene_id in ids:
        slug, filename = scene_id.split('/')
        rank, code = filename.split('-',1)
        rank = int(rank)
        record = next((r for r in qa_index[slug]
                       if r['rank']==rank and r['constellation']==code), None)
        if record is None or len(record['star_ids']) < 8:
            raise ValueError(f'Pilot scene missing or below 8 stars: {scene_id}')
        image = report['images'][slug]
        if image['selection_order'][rank-1] != code:
            raise ValueError(f'V9 report rank/constellation mismatch: {scene_id}')
        candidates = image['matches'][code]
        if len(candidates) != 1:
            raise ValueError(f'Expected exactly one verified match: {scene_id}')
        m = candidates[0]
        n = len(m['star_ids'])
        if (n != len(record['star_ids']) or n != len(m['vertices']) or
            n < 8 or n > 24 or m['star_ids'] != record['star_ids'] or
            len(set(m['star_ids'])) != n):
            raise ValueError(f'Source IDs/vertices inconsistent: {scene_id}')
        if not all(len(p)==2 and all(0<v<1 for v in p) for p in m['vertices']):
            raise ValueError(f'Invalid source vertex coordinates: {scene_id}')
        if any(len(edge)!=2 or min(edge)<0 or max(edge)>=n
               for edge in m['edges']):
            raise ValueError(f'Invalid original connections: {scene_id}')
        if not (m['rms_error_px'] <= 13 and m['max_error_px'] <= 24):
            raise ValueError(f'Unverified fit threshold: {scene_id}')
        folder = corpus/slug
        dim = folder/'background-dim-16x9.jpg'
        original = folder/'background-16x9.jpg'
        cat = folder/'stars-all.json'
        if not (dim.is_file() and original.is_file() and cat.is_file()):
            raise ValueError(f'Original catalog/photo missing: {slug}')
        if sha256(dim) != image['background_sha256']:
            raise ValueError(f'Source photograph SHA mismatch: {slug}')
        original_ids = {s['id'] for s in json.loads(cat.read_text())['stars']}
        if not set(m['star_ids']).issubset(original_ids):
            raise ValueError(f'Selected star ID absent from original catalog: {scene_id}')
        jobs.append((scene_id, slug, code, record, m, dim, original))

    staging = dest.with_name(dest.name+'.staging')
    if staging.exists():
        raise FileExistsError(f'Staging pack already exists: {staging}')
    staging.mkdir(parents=True, exist_ok=False)
    try:
        scenes = []
        loaded = {}
        for scene_id, slug, code, record, m, dim, orig in jobs:
            if slug not in loaded:
                with Image.open(dim) as im:
                    if im.size != (WIDTH,HEIGHT):
                        raise ValueError(f'Invalid cropped image: {slug}')
                    dim_np = np.asarray(im.convert('RGB'),dtype=np.float32)
                with Image.open(orig) as im:
                    if im.size != (WIDTH,HEIGHT):
                        raise ValueError(f'Invalid original image: {slug}')
                    orig_np = np.asarray(im.convert('RGB'),dtype=np.float32)
                loaded[slug] = (dim_np,orig_np)
                (staging/'assets'/slug).mkdir(parents=True,exist_ok=True)
                shutil.copyfile(dim,staging/'assets'/slug/'background.jpg')
            base,photo = loaded[slug]
            star_folder = staging/'assets'/slug/f'{record["rank"]:02d}-{code}'
            star_folder.mkdir(parents=True,exist_ok=True)
            sprite_paths = []
            for i, (nx,ny) in enumerate(m['vertices']):
                sprite = star_sprite(base,photo,nx*WIDTH,ny*HEIGHT,gain,expand)
                filename = f'star-{i:02d}.png'
                sprite.save(star_folder/filename,optimize=True)
                sprite_paths.append(f'assets/{slug}/{record["rank"]:02d}-{code}/{filename}')
            scenes.append({
                'id': scene_id,
                'background': slug,
                'name': record['name'],
                'constellation': code,
                'image': f'assets/{slug}/background.jpg',
                'image_sha256': sha256(dim),
                'image_size': [WIDTH,HEIGHT],
                'star_ids': m['star_ids'],
                'vertices': m['vertices'],
                'edges': m['edges'],
                'sprites': sprite_paths,
                'sprite_size': [SPRITE_SIZE,SPRITE_SIZE],
                'brightness': m['brightness'],
            })
            print(f'PACKED {scene_id}: {len(sprite_paths)} source-colored star sprites',flush=True)
        library = {
            'schema':'mellon-m6-scene-library-v1',
            'provenance':{
                'database_schema':report['schema'],
                'database_sha256':sha256(database),
                'qa_index_sha256':sha256(index),
                'pilot_selection_sha256':sha256(selection),
                'status':'pilot-only-not-validated-in-GNOME',
                'star_light_renderer':'mellon-m6-photo-light-v3',
                'enhance_gain':gain,
                'expand_factor':expand,
            },
            'scenes':scenes,
        }
        (staging/'library.json').write_text(json.dumps(library,indent=2)+'\n')
        (staging/'scene-config.json').write_text(json.dumps({
            'mode':'fixed', 'scene_id':config['default_scene_id'],
            'stages':config['activation_stages'],
        },indent=2)+'\n')
        dest.parent.mkdir(parents=True,exist_ok=True)
        staging.rename(dest)
        print(f'PASS: six pilot scenes assembled from verified v9 at {dest}',flush=True)
    except BaseException:
        # Do not silently delete potentially useful output on a failure.
        print(f'Pack incomplete; inspect/remove this staging directory before retry: {staging}')
        raise


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--selection',type=Path,default=HERE/'pilot-selection.json')
    p.add_argument('--index',type=Path,required=True)
    p.add_argument('--database',type=Path,required=True)
    p.add_argument('--corpus',type=Path,default=Path('assets/starfield/corpus-v1/catalogs'))
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--gain',type=float,default=6.20)
    p.add_argument('--expand',type=float,default=1.90)
    a=p.parse_args()
    build(a.selection,a.index,a.database,a.corpus,a.out,gain=a.gain,expand=a.expand)
