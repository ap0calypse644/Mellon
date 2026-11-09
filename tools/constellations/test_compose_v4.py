#!/usr/bin/env python3
"""Small deterministic tests for Mellon v4 composition selection."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import types
import unittest
import sys

MOD = Path(__file__).with_name('compose_constellations_v4.py')
spec = importlib.util.spec_from_file_location('mellon_v4', MOD)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)


class TestComposition(unittest.TestCase):
    def test_rectangular_clearance(self):
        a = (20, 30, 100, 150)
        self.assertFalse(mod.boxes_collide(a, (140, 30, 220, 150), 20))
        self.assertTrue(mod.boxes_collide(a, (115, 30, 220, 150), 20))
        self.assertFalse(mod.boxes_collide(a, (20, 200, 100, 240), 20))

    def test_fit_prefers_orientation_without_using_brightness(self):
        base = {'rms_error_px': 2, 'max_error_px': 4,
                'vertices': [[.1, .1], [.2, .2]] * 5,
                'transform': {'rotation_deg': 0, 'scale_px': 450}}
        good = mod.match_score(base, 1920, 1080)
        side = {**base, 'transform': {**base['transform'], 'rotation_deg': 130}}
        self.assertGreater(good, mod.match_score(side, 1920, 1080))
        with_brightness = {**base, 'brightness': 999}
        self.assertEqual(good, mod.match_score(with_brightness, 1920, 1080))

    def test_source_ids_validation(self):
        base = {'star_ids': ['A', 'B'], 'vertices': [[.15, .2], [.7, .6]],
                'edges': [[0, 1]], 'rms_error_px': 1.2, 'max_error_px': 2.0}
        mod.validate_match('A', 0, base)
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            mod.validate_match('A', 0, {**base, 'star_ids': ['A','A']})
        with self.assertRaisesRegex(ValueError, 'invalid normalized'):
            mod.validate_match('A', 0, {**base, 'vertices': [[1.2,.2],[.7,.6]]})
        with self.assertRaisesRegex(ValueError, 'graph edge'):
            mod.validate_match('A', 0, {**base, 'edges': [[0,3]]})

    def test_selects_multiple_nonoverlapping_shapes(self):
        def obj(name, x):
            match = {'star_ids': [f'{name}-1', f'{name}-2'],
                     'vertices': [[x/400, .2], [(x+40)/400, .35]],
                     'edges': [[0,1]], 'rms_error_px': 2.0,
                     'max_error_px': 3.0,
                     'transform': {'rotation_deg': 0, 'scale_px': 300}}
            return mod.Candidate(name,0,match,(x,50,x+40,100),
                                 (x+20,75),5.0,frozenset(match['star_ids']))
        pool = [obj('A', 0), obj('B', 140), obj('C', 280)]
        args = types.SimpleNamespace(scenes=3, target=3, trials=20,
              spacing=20, jitter=.4, reuse_penalty=1.8,
              template_reuse_penalty=.85, count_reward=2.5,
              shortfall_penalty=2.0)
        scenes = mod.pick_scenes(pool,400,200,args,seed=99)
        self.assertEqual(len(scenes),1)  # Only one possible triple of variants.
        self.assertEqual(len(scenes[0]),3)
        self.assertEqual({c.key for c in scenes[0]}, {'A','B','C'})
        self.assertTrue(mod.compatible(obj('D',500),scenes[0],20))


if __name__ == '__main__':
    unittest.main()
