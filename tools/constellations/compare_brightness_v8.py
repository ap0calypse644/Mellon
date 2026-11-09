#!/usr/bin/env python3
"""Compare top source-star brightness in v6 vs v8 without changing either report."""
from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

from match_bright_centered_constellations_v8 import load_catalog, photometric_scores


def compare(baseline: Path, updated: Path, corpus: Path):
    v6 = json.loads(baseline.read_text())
    v8 = json.loads(updated.read_text())
    if v6['schema'] != 'mellon-centered-constellation-matches-v6':
        raise ValueError('Baseline is not the original v6 report')
    if v8['schema'] != 'mellon-bright-centered-constellation-matches-v8':
        raise ValueError('Updated report is not v8')
    entries = []
    for slug, record in v8['images'].items():
        old = v6['images'].get(slug)
        if old is None:
            continue
        stars, _ = load_catalog(corpus / slug, 'all')
        scores = photometric_scores(stars)
        by_id = {str(s['id']): float(scores[i]) for i, s in enumerate(stars)}

        def score_match(match):
            ids = match['star_ids']
            return sum(by_id[str(i)] for i in ids) / len(ids)

        for template, candidates in record['matches'].items():
            previous = old['matches'].get(template, [])
            if not previous or not candidates:
                continue
            b = score_match(previous[0])
            a = score_match(candidates[0])
            entries.append({
                'background': slug,
                'template': template,
                'v6_brightness_score': round(b, 6),
                'v8_brightness_score': round(a, 6),
                'improvement': round(a-b, 6),
                'v6_rms_px': previous[0]['rms_error_px'],
                'v8_rms_px': candidates[0]['rms_error_px'],
                'v6_span': previous[0]['coverage']['max_span_fraction'],
                'v8_span': candidates[0]['coverage']['max_span_fraction'],
            })
    if not entries:
        raise ValueError('No overlapping non-empty constellation/background combinations')
    improved = sum(e['improvement'] > 0 for e in entries)
    worse = sum(e['improvement'] < 0 for e in entries)
    tied = len(entries)-improved-worse
    totals = {
        'compared': len(entries),
        'brighter': improved,
        'dimmer': worse,
        'tied': tied,
        'mean_v6': round(statistics.mean(e['v6_brightness_score'] for e in entries), 6),
        'mean_v8': round(statistics.mean(e['v8_brightness_score'] for e in entries), 6),
        'median_improvement': round(statistics.median(e['improvement'] for e in entries), 6),
    }
    return totals, entries


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--v6', type=Path, required=True)
    parser.add_argument('--v8', type=Path, required=True)
    parser.add_argument('--corpus', type=Path,
                        default=Path('assets/starfield/corpus-v1/catalogs'))
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()

    totals, detail = compare(args.v6, args.v8, args.corpus)
    print('Compared common image/constellation combinations:', totals['compared'])
    print('Brightness higher:', totals['brighter'], '| lower:', totals['dimmer'],
          '| tied:', totals['tied'])
    print('Mean v6/v8 brightness percentile:',
          totals['mean_v6'], '/', totals['mean_v8'])
    print('Median change:', totals['median_improvement'])
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(
            {'schema': 'mellon-v6-v8-brightness-comparison',
             'summary': totals, 'details': detail}, indent=2) + '\n')
        print('Saved comparison:', args.output)


if __name__ == '__main__':
    main()
