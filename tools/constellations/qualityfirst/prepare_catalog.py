#!/usr/bin/env python3
"""Prepare immutable Mellon catalog coordinates/photometry for the Go v9 solver.

Uses the proven v8 crop/rotation mapping and brightness percentiles.
Never mutates existing stars-all.json, images, templates or GNOME files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from match_bright_centered_constellations_v8 import load_catalog, photometric_scores

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--corpus', type=Path,
                    default=Path('assets/starfield/corpus-v1/catalogs'))
    ap.add_argument('--templates', type=Path,
                    default=Path('tools/constellations/templates-v4-orion-bow.json'))
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()

    raw = json.loads(args.templates.read_text())
    templates = raw['templates']
    if len(templates) != 31:
        raise ValueError(f'Expected 31 original templates; found {len(templates)}')
    if len(templates['Ori']['points']) != 18:
        raise ValueError('Orion-with-bow must have 18 reference points')

    images = []
    for folder in sorted(args.corpus.iterdir()):
        if not folder.is_dir():
            continue
        original = folder / 'background-16x9.jpg'
        dim = folder / 'background-dim-16x9.jpg'
        if not original.is_file() or not dim.is_file():
            continue

        stars, (width, height) = load_catalog(folder, 'all')
        scores = photometric_scores(stars)
        if len(stars) != len(scores):
            raise ValueError('Photometric score misalignment')
        records = []
        for s, rank in zip(stars, scores):
            records.append({
                'id': s['id'],
                'x': s['px'], 'y': s['py'],
                'score': round(float(rank), 10),
                'brightness': s['brightness'],
                'prominence': s['prominence'],
            })
        images.append({
            'name': folder.name,
            'width': width,
            'height': height,
            'background': str(dim),
            'stars': records,
        })
        print(f'{folder.name:20s}: {len(records):5d} real detected points', flush=True)

    if len(images) != 6:
        raise ValueError(f'Expected six image catalogs; found {len(images)}')
    output = {
        'schema': 'mellon-quality-input-v1',
        'provenance': {
            'catalog_type': 'all',
            'template_sha256': hashlib.sha256(args.templates.read_bytes()).hexdigest(),
            'template_path': str(args.templates),
            'source_catalog_root': str(args.corpus),
            'brightness_method': 'v8-percentile: 75% pixel brightness + 25% DoG prominence',
            'note': 'Only source feature IDs and positions; no fabricated vertices.',
        },
        'templates': templates,
        'images': images,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    tmp = args.output.with_suffix(args.output.suffix + '.tmp')
    tmp.write_text(json.dumps(output, separators=(',', ':')) + '\n')
    tmp.replace(args.output)
    print('Prepared input:', args.output, flush=True)

if __name__ == '__main__':
    main()
