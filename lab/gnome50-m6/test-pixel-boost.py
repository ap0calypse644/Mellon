#!/usr/bin/env python3
"""M6 small synthetic image tests; never load photos or run Go search."""
from __future__ import annotations

import sys
from pathlib import Path
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_pilot_pack import star_sprite


def check(hue: str, rgb: tuple[int,int,int]):
    h=w=64
    dim=np.full((h,w,3),8,dtype=np.float32)
    original=np.full((h,w,3),15,dtype=np.float32)
    for y in range(h):
        for x in range(w):
            intensity=np.exp(-((x-32)**2+(y-32)**2)/(2*1.25**2))
            original[y,x,:] += np.asarray(rgb)*intensity
            dim[y,x,:] += np.asarray(rgb)*.3*intensity
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
    if hue=='red': assert center[0] > center[1]*2 and center[0]>center[2]*2
    if hue=='blue': assert center[2] > center[0]*2 and center[2]>center[1]*1.5
    assert np.max(alpha[0])==0 and np.max(alpha[:,-1])==0
    print(f'PASS: {hue} original photographed light enhanced with sparse alpha, '
          'no generic white dot')

check('red',(205,28,18))
check('blue',(18,55,215))
