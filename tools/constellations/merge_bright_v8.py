#!/usr/bin/env python3
"""Merge independent verified v8 image reports into one immutable scene candidate index."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

SCHEMA = 'mellon-bright-centered-constellation-matches-v8'
EXPECTED = {
    'blue-gold-nebula', 'chromatic-nebula', 'cosmic-wings',
    'dust-cloud', 'rosy-rosette', 'veiled-ring',
}
EXCLUDED_SETTINGS = {'only_backgrounds', 'output'}


def merged(paths, expected=EXPECTED):
    if not paths:
        raise ValueError('At least one input report is required')
    images = {}
    master_settings = None
    first_settings = None
    for path in paths:
        record = json.loads(path.read_text())
        if record.get('schema') != SCHEMA:
            raise ValueError(f'Unexpected v8 report schema in {path}')
        clean_settings = {k: v for k, v in record['settings'].items()
                          if k not in EXCLUDED_SETTINGS}
        if master_settings is None:
            master_settings = clean_settings
            first_settings = dict(record['settings'])
        elif clean_settings != master_settings:
            raise ValueError(f'Incompatible matcher settings in {path}')
        for slug, content in record['images'].items():
            if slug in images:
                raise ValueError(f'Duplicate image in merged reports: {slug}')
            images[slug] = content

    if expected and set(images) != expected:
        raise ValueError(f'Expected {sorted(expected)}, found {sorted(images)}')
    first_settings['only_backgrounds'] = None
    first_settings['output'] = '<merged>'
    return {
        'schema': SCHEMA,
        'note': 'Merged image reports from independent full v8 brightness-aware searches. Individual matches remain unmodified.',
        'settings': first_settings,
        'images': {key: images[key] for key in sorted(images)},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--parts', type=Path, nargs='+', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--allow-partial', action='store_true',
                        help='Permit fewer than the expected six image folders')
    args = parser.parse_args()
    artifact = merged(args.parts, None if args.allow_partial else EXPECTED)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + '\n')
    total = sum(len(rows) for img in artifact['images'].values()
                for rows in img['matches'].values())
    print(f'PASS: merged {len(artifact["images"])} images and {total} matches')
    print('Saved:', args.output)


if __name__ == '__main__':
    main()
