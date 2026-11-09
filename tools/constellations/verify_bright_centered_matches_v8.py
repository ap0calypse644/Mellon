#!/usr/bin/env python3
"""Independently validate v8 source stars, brightness, geometry and placement."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from match_bright_centered_constellations_v8 import load_catalog, photometric_scores


def check(report: Path, corpus: Path) -> tuple[int, int]:
    data = json.loads(report.read_text())
    if data['schema'] != 'mellon-bright-centered-constellation-matches-v8':
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
        scores = photometric_scores(stars)
        id_score = {str(star['id']): float(scores[i])
                    for i, star in enumerate(stars)}
        max_rms = float(settings['threshold_px'])
        max_vertex = float(settings['max_vertex_error_px'])
        min_span = float(settings['min_span'])
        for key, candidates in record['matches'].items():
            combinations += 1
            previous_rank = float('inf')
            previous_rms = -1.0
            for match in candidates:
                total += 1
                rank = float(match['rank_score'])
                rms = float(match['rms_error_px'])
                if rank > previous_rank + 1e-7:
                    raise ValueError(f'Match not sorted by final score in {folder}/{key}')
                if abs(rank - previous_rank) < 1e-7 and rms < previous_rms - 1e-4:
                    raise ValueError(f'Match RMS tie order invalid in {folder}/{key}')
                previous_rank, previous_rms = rank, rms
                if rms > max_rms + 1e-4 or float(match['max_error_px']) > max_vertex + 1e-4:
                    raise ValueError(f'RMS/worst-vertex threshold violated: {folder}/{key}')
                ids = list(map(str, match['star_ids']))
                if len(ids) != len(set(ids)):
                    raise ValueError(f'Duplicate star ID in {folder}/{key}')
                if len(ids) != len(match['vertices']):
                    raise ValueError(f'Mismatched vertex count in {folder}/{key}')
                info = match.get('brightness', {})
                selected = [by_id[ident] for ident in ids]
                expected_scores = [id_score[ident] for ident in ids]
                photometric = {
                    'score_mean': sum(expected_scores) / len(expected_scores),
                    'score_min': min(expected_scores),
                    'pixel_brightness_mean': sum(s['brightness'] for s in selected) / len(selected),
                    'prominence_mean': sum(s['prominence'] for s in selected) / len(selected),
                }
                for field, expected in photometric.items():
                    if abs(float(info[field]) - expected) > 1e-4:
                        raise ValueError(f'Photometric {field} mismatch in {folder}/{key}')
                if len(info.get('star_scores', [])) != len(ids):
                    raise ValueError(f'Per-star brightness count mismatch in {folder}/{key}')
                if any(abs(float(v) - expected) > 2e-6 for v, expected in
                       zip(info['star_scores'], expected_scores)):
                    raise ValueError(f'Source star brightness mismatch in {folder}/{key}')
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
                if match['coverage']['max_span_fraction'] < min_span - 1e-4:
                    raise ValueError(f'Minimum span violated: {folder}/{key}')
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
    print('PASS: Every selected star ID, source brightness, coordinate, center, '
          'fit threshold and artwork clearance verified')


if __name__ == '__main__':
    main()
