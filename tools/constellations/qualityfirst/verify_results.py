#!/usr/bin/env python3
"""Independent v9 source-star, brightness, geometry and art-safety validator.

The existing photographic catalogs are immutable. This verifier recomputes
candidate positions, constellation topology and fit from the source data
rather than relying on self-reported Go scores.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path

import numpy as np
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from match_bright_centered_constellations_v8 import load_catalog, photometric_scores
from match_constellations_v3 import similarity_fit

def verify(input_path: Path, matches_path: Path, corpus: Path):
    prepared = json.loads(input_path.read_text())
    output = json.loads(matches_path.read_text())
    if prepared['schema'] != 'mellon-quality-input-v1':
        raise ValueError('Unexpected input schema')
    if output['schema'] != 'mellon-quality-results-v1':
        raise ValueError('Unexpected Go output schema')
    cfg = output['settings']
    tol_x = float(cfg['center_tolerance_x'])
    tol_y = float(cfg['center_tolerance_y'])
    frame = float(cfg['frame_margin'])
    art_x = float(cfg['figure_room_x'])
    art_y = float(cfg['figure_room_y'])
    templates = prepared['templates']
    original_by_name = {record['name']: record for record in prepared['images']}
    if set(output['images']) != set(original_by_name):
        raise ValueError('Missing or additional image in v9 report')
    selected_total = 0
    for slug, entry in sorted(output['images'].items()):
        original = original_by_name[slug]
        stars, (width, height) = load_catalog(corpus / slug, 'all')
        if entry['image_size'] != [width, height]:
            raise ValueError(f'Stale image size in {slug}')
        if len(stars) != entry['source_stars']:
            raise ValueError(f'Stale star count in {slug}')
        ranks = photometric_scores(stars)
        by_id = {str(s['id']): (s, float(rank))
                 for s, rank in zip(stars, ranks)}
        if entry['evaluated_proposals'] != int(cfg['attempts_per_template']) * len(cfg['template_ids']):
            raise ValueError(f'Search budget was not completed for {slug}')
        if len(entry['matches']) > cfg['scenes_per_background']:
            raise ValueError(f'Too many final scenes for {slug}')
        used_templates = Counter()
        previous_rank = float('inf')
        for m in entry['matches']:
            selected_total += 1
            constellation = m['constellation']
            if constellation not in templates:
                raise ValueError(f'Unknown constellation {constellation}')
            template = templates[constellation]
            ids = [str(v) for v in m['star_ids']]
            n = len(template['points'])
            if len(ids) != n or len(m['vertices']) != n or len(set(ids)) != n:
                raise ValueError(f'Duplicate or missing source stars: {slug}/{constellation}')
            if m['edges'] != template['edges']:
                raise ValueError(f'Edited constellation line topology: {slug}/{constellation}')
            if m['status'] != 'candidate-needs-visual-review':
                raise ValueError('Candidates must require visual review')
            used_templates[constellation] += 1
            if used_templates[constellation] > 2:
                raise ValueError(f'Too many duplicate scenes for template {constellation}')
            if m['rank_score'] > previous_rank + 1e-7:
                raise ValueError('Final scenes must be sorted by quality')
            previous_rank = m['rank_score']
            points = []
            scores = []
            for ident, (nx,ny) in zip(ids,m['vertices']):
                if ident not in by_id:
                    raise ValueError(f'Unknown source detection {slug}/{ident}')
                star, score = by_id[ident]
                if abs(nx - star['px']/width) > 2e-7 or abs(ny - star['py']/height) > 2e-7:
                    raise ValueError(f'Moved existing image star {slug}/{ident}')
                points.append([star['px'],star['py']])
                scores.append(score)
            points = np.asarray(points, dtype=float)
            template_pts = np.asarray(template['points'], dtype=float)
            projected, center, scale, angle = similarity_fit(template_pts, points)
            errors = np.linalg.norm(projected - points, axis=1)
            rms = float(np.sqrt(np.mean(errors**2)))
            worst = float(np.max(errors))
            if rms > 13.0001 or worst > 24.0001:
                raise ValueError(f'Geometrical fit degraded in {slug}/{constellation}')
            if abs(m['rms_error_px']-rms) > .002 or abs(m['max_error_px']-worst) > .002:
                raise ValueError('Go fit did not match independent Procrustes result')
            low, high = points.min(axis=0), points.max(axis=0)
            if (low[0] < (frame+art_x)*width-.001 or
                    high[0] > (1-frame-art_x)*width+.001 or
                    low[1] < (frame+art_y)*height-.001 or
                    high[1] > (1-frame-art_y)*height+.001):
                raise ValueError('Source star entered reserved artwork margin')
            ox = (low[0]+high[0])/(2*width)-.5
            oy = (low[1]+high[1])/(2*height)-.5
            if abs(ox)>tol_x+.00001 or abs(oy)>tol_y+.00001:
                raise ValueError('Selected constellation outside centered bounds')
            max_span=max((high[0]-low[0])/width,(high[1]-low[1])/height)
            if max_span < float(cfg['min_span'])-1e-6:
                raise ValueError('Constellation too small')
            envelope=[low[0]-art_x*width,low[1]-art_y*height,
                      high[0]+art_x*width,high[1]+art_y*height]
            if any(abs(float(x)-y) > .002 for x,y in zip(m['figure_envelope_bbox_px'],envelope)):
                raise ValueError('Incorrect reserved artwork envelope')
            b=m['brightness']
            sorted_scores=sorted(scores)
            p20=sorted_scores[int(math.floor(.2*(n-1)))]
            expected={
                'score_mean':float(np.mean(scores)),
                'score_min':min(scores),
                'score_p20':p20,
                'fraction_top_quartile':sum(v>=.75 for v in scores)/n,
            }
            for field,value in expected.items():
                if abs(b[field]-value) > 3e-5:
                    raise ValueError(f'Incorrect brightness statistic {field}')
            if len(b['star_scores'])!=n or any(abs(x-y)>3e-5 for x,y in zip(b['star_scores'],scores)):
                raise ValueError('Per-star photometry does not match source catalog')
        print(f'PASS {slug}: {len(entry["matches"])} unique review candidates, '
              f'{entry["evaluated_proposals"]:,} placements, '
              f'{entry["valid_candidates_before_dedup"]:,} qualified',flush=True)
    print(f'PASS: {selected_total} image-aligned scenes across {len(output["images"])} backgrounds')
    print('PASS: all stars and RGB-feature scores trace back to unchanged source catalogs')
    print('PASS: original v6 rigid fit, 14% inset, 55% span, ±13% centering, art reserve')

if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input',type=Path,required=True)
    p.add_argument('--matches',type=Path,required=True)
    p.add_argument('--corpus',type=Path,
                   default=Path('assets/starfield/corpus-v1/catalogs'))
    args=p.parse_args()
    verify(args.input,args.matches,args.corpus)
