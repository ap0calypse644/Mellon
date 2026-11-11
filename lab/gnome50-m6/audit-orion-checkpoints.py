#!/usr/bin/env python3
"""READ-ONLY: rank previously computed Orion-with-bow v9 checkpoints.

This never invokes the matcher, generates stars, modifies the GNOME VM,
or approves Orion for the live curated library. It is a diagnostic only.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

BACKGROUNDS = (
    'blue-gold-nebula', 'chromatic-nebula', 'cosmic-wings',
    'dust-cloud', 'rosy-rosette', 'veiled-ring',
)


def check_candidate(candidate: dict, source_ids: set[str] | None) -> tuple[float, float, float]:
    ids = candidate.get('star_ids', [])
    points = candidate.get('vertices', [])
    if len(ids) != 18 or len(set(ids)) != 18 or len(points) != 18:
        raise ValueError('Orion bow must have 18 distinct source points')
    if source_ids is not None and not set(ids).issubset(source_ids):
        raise ValueError('Orion match has unknown source feature IDs')
    if not all(len(p) == 2 and all(isinstance(v, (int,float)) and
               math.isfinite(v) and 0 < v < 1 for v in p) for p in points):
        raise ValueError('Out-of-frame Orion source vertices')
    geom = float(candidate['rms_error_px'])
    if not math.isfinite(geom) or geom > 13:
        raise ValueError('Orion bow is outside verified geometry threshold')
    value = float(candidate['rank_score'])
    bright = float(candidate['brightness']['composite'])
    if not math.isfinite(value) or not math.isfinite(bright):
        raise ValueError('Nonfinite Orion quality score')
    return value, bright, geom


def audit(checkpoints: Path, corpus: Path | None, limit: int):
    found = 0
    for slug in BACKGROUNDS:
        path = checkpoints / slug / 'Ori.json'
        if not path.is_file():
            print(f'{slug:<22}  NO SAVED CHECKPOINT')
            continue
        data = json.loads(path.read_text())
        if data.get('constellation') != 'Ori' or data.get('background') != slug:
            raise ValueError(f'Invalid checkpoint identity: {path}')
        source_ids = None
        if corpus is not None:
            catalog = corpus / slug / 'stars-all.json'
            if catalog.is_file():
                source_ids = {s['id'] for s in json.loads(catalog.read_text())['stars']}
        candidates = []
        for candidate in data.get('candidates', []):
            score, brightness, rms = check_candidate(candidate, source_ids)
            candidates.append((score, brightness, rms))
        candidates.sort(key=lambda x: x[0], reverse=True)
        print(f'{slug:<22}  {len(candidates)} saved Orion bow matches')
        for rank, (score, brightness, rms) in enumerate(candidates[:limit], 1):
            print(f'  {rank:>2}: score={score:.5f}  '
                  f'brightness={brightness:.5f}  RMS={rms:.2f}px')
            found += 1
    if found:
        print('\nCHECKPOINT AUDIT ONLY — no constellation has been approved or installed.')
    else:
        print('\nNo saved Orion-with-bow matches found; no new search was run.')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--checkpoints', type=Path, default=Path.home() /
                   'VMs/Mellon/constellation-quality-v9/checkpoints')
    p.add_argument('--corpus', type=Path, default=Path(
                   'assets/starfield/corpus-v1/catalogs'))
    p.add_argument('--top', type=int, default=3)
    a = p.parse_args()
    if not 1 <= a.top <= 5:
        p.error('--top must be between 1 and 5')
    audit(a.checkpoints, a.corpus, a.top)
