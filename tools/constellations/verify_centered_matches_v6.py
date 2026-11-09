#!/usr/bin/env python3
"""Validate v6 star identities, image alignment, centered bounds and art clearance."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from match_constellations_v3 import load_catalog


def check(report: Path, corpus: Path) -> tuple[int, int]:
    data = json.loads(report.read_text())
    if data['schema'] != 'mellon-centered-constellation-matches-v6':
        raise ValueError('Incorrect report schema')
    settings = data['settings']
    margin = float(settings['frame_margin'])
    room_x = float(settings['figure_room_x'])
    room_y = float(settings['figure_room_y'])
    tolerance_x = float(settings['center_tolerance_x'])
    tolerance_y = float(settings['center_tolerance_y'])
    catalog = settings['catalog']
    total = 0
    combinations = 0
    for folder, record in data['images'].items():
        stars, (width, height) = load_catalog(corpus / folder, catalog)
        by_id = {str(star['id']): star for star in stars}
        for key, candidates in record['matches'].items():
            combinations += 1
            for match in candidates:
                total += 1
                ids = list(map(str, match['star_ids']))
                if len(ids) != len(set(ids)):
                    raise ValueError(f'Duplicate star ID in {folder}/{key}')
                points = []
                for ident, (nx, ny) in zip(ids, match['vertices']):
                    star = by_id.get(ident)
                    if star is None:
                        raise ValueError(f'Unknown star {folder}/{key}/{ident}')
                    x, y = star['px'], star['py']
                    if abs(x / width - nx) > 2e-7 or abs(y / height - ny) > 2e-7:
                        raise ValueError(f'Star coordinates shifted in {folder}/{key}/{ident}')
                    points.append((x, y))
                left = min(p[0] for p in points)
                right = max(p[0] for p in points)
                top = min(p[1] for p in points)
                bottom = max(p[1] for p in points)
                epsilon = 0.11  # bbox and stored coordinates are rounded for JSON
                if (left < (margin + room_x) * width - epsilon or
                        right > (1 - margin - room_x) * width + epsilon or
                        top < (margin + room_y) * height - epsilon or
                        bottom > (1 - margin - room_y) * height + epsilon):
                    raise ValueError(f'Constellation violates inner safe bounds: {folder}/{key}')
                if (abs((left + right) / (2 * width) - .5) > tolerance_x + 1e-4 or
                        abs((top + bottom) / (2 * height) - .5) > tolerance_y + 1e-4):
                    raise ValueError(f'Constellation is off-center: {folder}/{key}')
                envelope = match['figure_envelope_bbox_px']
                expected = (left - room_x * width, top - room_y * height,
                            right + room_x * width, bottom + room_y * height)
                if any(abs(a - b) > .1 for a, b in zip(envelope, expected)):
                    raise ValueError(f'Artwork envelope mismatch: {folder}/{key}')
                if (envelope[0] < margin * width - epsilon or
                        envelope[2] > (1 - margin) * width + epsilon or
                        envelope[1] < margin * height - epsilon or
                        envelope[3] > (1 - margin) * height + epsilon):
                    raise ValueError(f'Artwork envelope touches outside frame: {folder}/{key}')
    return total, combinations


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--report', type=Path, required=True)
    ap.add_argument('--corpus', type=Path,
                    default=Path('assets/starfield/corpus-v1/catalogs'))
    args = ap.parse_args()
    total, combinations = check(args.report, args.corpus)
    print(f'PASS: {total} candidate placements across {combinations} constellation/image combinations')
    print('PASS: Every selected star ID, coordinate, center and artwork clearance verified')


if __name__ == '__main__':
    main()
