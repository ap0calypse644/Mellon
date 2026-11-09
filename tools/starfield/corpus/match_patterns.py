#!/usr/bin/env python3
"""Approximate arbitrary vector shapes using ONLY detected image-star coordinates.

Does not add or move stars. Matching constructs one-to-one matches between
shape vertices and existing catalog entries, then links their actual positions.
"""
from __future__ import annotations
import argparse,json,math,random
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
from scipy.optimize import linear_sum_assignment
from PIL import Image,ImageDraw

PATTERNS={
 'five_point_star':{
  'points':[[math.cos(-math.pi/2+math.pi*2*i/10)*(.45 if i%2==0 else .19),
             math.sin(-math.pi/2+math.pi*2*i/10)*(.45 if i%2==0 else .19)] for i in range(10)],
  'edges':[[i,(i+1)%10] for i in range(10)],
 },
 'crown':{
  'points':[[ -.50,.30],[-.50,-.20],[-.30,.03],[-.10,-.42],[.10,.03],[.32,-.34],[.50,.24],[.50,.35],[-.50,.35]],
  'edges':[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,0]],
 },
 'spacecraft':{
  'points':[[0,-.50],[.11,-.21],[.32,-.06],[.46,.24],[.30,.25],[.19,.12],[.13,.38],[0,.32],[-.13,.38],[-.19,.12],[-.30,.25],[-.46,.24],[-.32,-.06],[-.11,-.21]],
  'edges':[[i,(i+1)%14] for i in range(14)]+[[0,7],[1,13]],
 },
}

def solve(catalog,points,position=(.50,.51),size=(.64,.68),attempts=280,seed=2131):
    coords=np.array([[s['x'],s['y']] for s in catalog],dtype=np.float64)
    tree=cKDTree(coords)
    shape=np.array(points,dtype=np.float64)
    rng=random.Random(seed)
    best=None
    for t in range(attempts):
        angle=rng.uniform(-.14,.14)
        ca,sa=math.cos(angle),math.sin(angle)
        rotated=shape @ np.array([[ca,sa],[-sa,ca]])
        sx=size[0]*rng.uniform(.84,1.04)
        sy=size[1]*rng.uniform(.84,1.04)
        offx=position[0]+rng.uniform(-.045,.045)
        offy=position[1]+rng.uniform(-.045,.045)
        targets=rotated*np.array([sx,sy])+np.array([offx,offy])
        if np.any(targets<.03) or np.any(targets>.97): continue
        ds,idx=tree.query(targets,k=10)
        choices=sorted(set(idx.flatten().tolist()))
        candidate_coords=coords[choices]
        dist=(targets[:,None,:]-candidate_coords[None,:,:])**2
        costs=np.sum(dist,axis=2)
        valid=np.zeros_like(costs,dtype=bool)
        for i in range(len(points)):
            valid[i,np.searchsorted(choices,idx[i])]=True
        costs[~valid]=10
        ri,ci=linear_sum_assignment(costs)
        score=float(costs[ri,ci].mean())
        if best is None or score < best['score']:
            selected=[choices[k] for k in ci]
            best={'score':score,'stars':[catalog[k] for k in selected],
                  'targets':targets.tolist(),
                  'rms_error_px':round(float(np.sqrt(np.mean(np.sum(((coords[selected]-targets)*np.array([1920,1080]))**2,axis=1)))),2),
                  'mean_error_normalized':round(math.sqrt(score),5)}
    if best is None:raise RuntimeError('No matching geometric arrangement found')
    return best

def render(bg,matched,out):
    img=Image.open(bg).convert('RGB'); d=ImageDraw.Draw(img,'RGBA')
    colors={'five_point_star':(133,233,255,190),'crown':(255,167,198,186),
            'spacecraft':(179,179,255,183)}
    for name,match in matched.items():
        pts=match['stars']; color=colors.get(name,(160,240,255,200))
        for a,b in PATTERNS[name]['edges']:
            p1,p2=pts[a],pts[b]
            d.line([(p1['px'],p1['py']),(p2['px'],p2['py'])],fill=color,width=3)
        for p in pts:
            x,y=p['px'],p['py']
            d.ellipse((x-8,y-8,x+8,y+8),outline=(148,226,255,100),width=2)
            d.ellipse((x-3,y-3,x+3,y+3),fill=(220,252,255,230))
    img.save(out,quality=94,optimize=True)

def main():
    pa=argparse.ArgumentParser();pa.add_argument('--data',type=Path,required=True)
    args=pa.parse_args()
    for folder in sorted(args.data.iterdir()):
        if not folder.is_dir():continue
        raw=json.loads((folder/'stars-curated.json').read_text())
        stars=raw['stars']
        matches={}
        # Different chart zones for clear, nonoverlapping QA patterns.
        plans=[('crown',(.28,.46),(.35,.53)),('five_point_star',(.72,.49),(.29,.49)),
               ('spacecraft',(.51,.49),(.22,.37))]
        for name,position,size in plans:
            match=solve(stars,PATTERNS[name]['points'],position,size,240,seed=2026)
            matches[name]=match
        payload={'schema':'mellon-pattern-matching-v1',
                 'source_catalog_image_sha256':raw['image_sha256'],
                 'patterns':{name:{'star_ids':[s['id'] for s in m['stars']],
                                   'edges':PATTERNS[name]['edges'],
                                   'rms_error_px':m['rms_error_px'],
                                   'mean_error_normalized':m['mean_error_normalized']} 
                             for name,m in matches.items()}}
        (folder/'pattern-examples.json').write_text(json.dumps(payload,indent=2)+'\n')
        render(folder/'background-dim-16x9.jpg',matches,folder/'qa-patterns.jpg')
        print(folder.name,','.join(f'{n}:{m["rms_error_px"]}px' for n,m in matches.items()))
if __name__=='__main__':main()
