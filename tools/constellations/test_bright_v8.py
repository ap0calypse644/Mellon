#!/usr/bin/env python3
"""Fast, deterministic unit checks for Mellon v8 brightness preference."""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

import numpy as np
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from match_bright_centered_constellations_v8 import (
    brightness_assignment, load_catalog, photometric_scores, refine_bright,
    safe_zone, merit,
)
from match_constellations_v3 import targets_for


def check_basic_brightness():
    stars = [
        {'id': 'a', 'brightness': .10, 'prominence': 5},
        {'id': 'b', 'brightness': .95, 'prominence': 70},
        {'id': 'c', 'brightness': .55, 'prominence': 10},
    ]
    scores = photometric_scores(stars)
    assert 0 <= scores.min() <= scores.max() <= 1
    assert scores[1] > scores[2] > scores[0]

    # A brighter real point five pixels away should beat a very dim
    # nearer point only when the optional brightness preference is enabled.
    xy = np.array([[0., 0.], [5., 0.]], dtype=float)
    tree = cKDTree(xy)
    goal = np.array([[.1, 0.]], dtype=float)
    scores = np.array([0., 1.])
    assert brightness_assignment(tree, xy, goal, scores, 2, 0).tolist() == [0]
    assert brightness_assignment(tree, xy, goal, scores, 2, 8).tolist() == [1]


def check_geometry_unchanged():
    pts = np.array([[-.5, -.3], [.5, -.3], [0., .3]])
    center = np.array([960., 540.])
    xy = targets_for(pts, center, 1000., 0.)
    proposal = {'center': center, 'radius': 1000., 'angle': 0.}
    args = argparse.Namespace(
        brightness_neighbors=8, brightness_assignment_px=8,
        threshold_px=13., max_vertex_error_px=24.,
        min_scale=350., max_scale=3200.,
        frame_margin=.05, figure_room_x=.09, figure_room_y=.09,
        center_tolerance_x=.13, center_tolerance_y=.13,
        brightness_rank_bonus=.08)
    out = refine_bright(proposal, pts, xy, cKDTree(xy),
                        np.array([.25, .9, .7]), args, 1920, 1080)
    assert out is not None
    assert out['assignment'].tolist() == [0, 1, 2]
    assert out['rms_error_px'] < 1e-6

    safe_x, safe_y, room_x, room_y = safe_zone(1920, 1080, args)
    assert (safe_x, safe_y, room_x, room_y) == (268.8, 151.2, 172.8, 97.2)
    m = {
        'coverage': {'max_span_fraction': .61, 'bounding_area_fraction': .24,
                     'bbox_px': [300., 180., 1470., 815.]},
        'rms_error_px': 4.5, 'transform': {'rotation_deg': 3.},
        'brightness': {'score_mean': .8},
    }
    high = merit(m, 13., 1920, 1080, args)
    m['brightness']['score_mean'] = .1
    low = merit(m, 13., 1920, 1080, args)
    assert high > low, 'Final score must favor brighter source stars'


def check_real_catalogues():
    corpus = Path('assets/starfield/corpus-v1/catalogs')
    folders = sorted(p for p in corpus.iterdir() if p.is_dir())
    assert len(folders) == 6
    for folder in folders:
        stars, (w, h) = load_catalog(folder, 'all')
        assert (w, h) == (1920, 1080)
        assert len(stars) > 1000
        assert all('brightness' in s and 'prominence' in s for s in stars)
        scores = photometric_scores(stars)
        assert scores.shape == (len(stars),)
        assert all(0. <= x <= 1. for x in scores)
        print(f'{folder.name}: {len(stars)} detected image features with photometry')


if __name__ == '__main__':
    check_basic_brightness()
    check_geometry_unchanged()
    check_real_catalogues()
    print('PASS: v8 brightness preference, unique assignment, geometry, catalogs')
