#!/usr/bin/env python3
"""M6 small synthetic image tests; never load photos or run Go search."""
from __future__ import annotations

import sys
from pathlib import Path
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parent))
from runpy import run_path
star_sprite = run_path(str(Path(__file__).with_name('build-pilot-pack.py')))['star_sprite']


def check(hue: str, rgb: tuple[int,int,int]):
    h=w=64
    dim=np.full((h,w,3),8,dtype=np.float32)
    original=np.full((h,w,3),15,dtype=np.float32)
    for y in range(h):
        for x in range(w):
            intensity=np.exp(-((x-32)**2+(y-32)**2)/(2*1.25**2))
            original[y,x,:] += np.asarray(rgb)*intensity
            dim[y,x,:] += np.asarray(rgb)*.3*intensity
    old_image=star_sprite(dim,original,32,32,gain=2.65,expand=1.60)
    previous_image=star_sprite(dim,original,32,32,gain=6.20,expand=1.90)
    image=star_sprite(dim,original,32,32)
    assert image.size==(26,26) and image.mode=='RGBA'
    pixel=np.asarray(image,dtype=np.float32)
    alpha=pixel[...,3:4]/255.0
    assert np.sum(alpha>0)>2, 'No original starlight pixels'
    assert np.sum(alpha[0])==0 and np.sum(alpha[-1])==0, 'Sprite has hard edges'
    # Composite onto baseline as GNOME's non-reactive alpha widget would.
    baseline=np.full((26,26,3),8,dtype=np.float32)
    composed=baseline*(1-alpha)+pixel[...,:3]*alpha
    center=composed[13,13]
    assert float(center.max())>float(baseline.max())+25, 'Original pixel not brightened'
    old_pixels=np.asarray(old_image,dtype=np.float32)
    old_alpha=old_pixels[...,3:4]/255.0
    old_composite=baseline*(1-old_alpha)+old_pixels[...,:3]*old_alpha
    previous_pixels=np.asarray(previous_image,dtype=np.float32)
    previous_alpha=previous_pixels[...,3:4]/255.0
    previous_composite=baseline*(1-previous_alpha)+previous_pixels[...,:3]*previous_alpha
    previous_light=float(np.maximum(0,previous_composite-baseline).sum())
    new_light=float(np.maximum(0,composed-baseline).sum())
    old_light=float(np.maximum(0,old_composite-baseline).sum())
    assert new_light > previous_light*1.03, (
        f'New {hue} star is not brighter than M6.2: '
        f'{new_light:.2f} vs {previous_light:.2f}')
    assert new_light > old_light*1.15, (
        f'New {hue} star is not visibly brighter than M6.0: '
        f'{new_light:.2f} vs {old_light:.2f}')
    # The intensity-weighted footprint should grow with the magnification
    # of the actual photographed light profile, not by adding a fake dot.
    yy,xx=np.mgrid[0:26,0:26]
    radius_sq=(xx-13)**2+(yy-13)**2
    previous_power=np.maximum(0,previous_composite-baseline).sum(axis=2)
    new_power=np.maximum(0,composed-baseline).sum(axis=2)
    previous_radius=float(np.sqrt((previous_power*radius_sq).sum()/
                                  previous_power.sum()))
    new_radius=float(np.sqrt((new_power*radius_sq).sum()/
                             new_power.sum()))
    assert new_radius > previous_radius*1.02, (
        f'New {hue} star did not grow enough: '
        f'{new_radius:.3f}px vs {previous_radius:.3f}px')
    if hue=='red': assert center[0] > center[1]*2 and center[0]>center[2]*2
    if hue=='blue': assert center[2] > center[1] > center[0], f'Blue star hue changed: {center}'
    assert np.max(alpha[0])==0 and np.max(alpha[:,-1])==0
    print(f'PASS: {hue} original photographic light brighter and larger '
          f'(size {previous_radius:.3f}px -> {new_radius:.3f}px); '
          'no generic white dot')

check('red',(205,28,18))
check('blue',(18,55,215))
