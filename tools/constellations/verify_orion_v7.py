#!/usr/bin/env python3
"""Independent fail-closed verification for Mellon's offline Orion v7 previews.

No calls into the renderer. Verifies the image-source transform, immutable v6
star IDs, independent anatomical-anchor fit, SVG artwork extent (including bloom
padding), output resolution, and source/content hashes.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import cairosvg
import numpy as np
from PIL import Image

ART_ANCHORS=[(4,-500),(258,-370),(-126,-317),(-36,22),(17,68),(75,106),(-259,425),(165,499),(7,308)]

def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def projected(x,y,tr):
    angle=tr['rotation_deg']*math.pi/180;scale=tr['scale_px']/1000
    return (tr['center_px'][0]+scale*(x*math.cos(angle)-y*math.sin(angle)),
            tr['center_px'][1]+scale*(x*math.sin(angle)+y*math.cos(angle)))
def transform_original(star,meta):
    x,y=star['px'],star['py'];sw,sh=meta['source_width'],meta['source_height']
    deg=meta['transform']['clockwise_degrees']
    if deg==90:x,y=sh-1-y,x
    elif deg==180:x,y=sw-1-x,sh-1-y
    elif deg==270:x,y=y,sw-1-x
    elif deg!=0:raise AssertionError('Unsupported rotation')
    left,top,right,bottom=meta['transform']['crop_box_rotated'];w,h=meta['transform']['output_size']
    return (w*(x-left)/(right-left),h*(y-top)/(bottom-top))

def run(report,manifest,corpus,art,output):
    original=json.loads(report.read_text());doc=json.loads(manifest.read_text())
    assert original['schema']=='mellon-centered-constellation-matches-v6'
    assert doc['schema']=='mellon-orion-art-v7-preview'
    assert doc['approval']=='pending-human-visual-qa'
    used=set();art_sha=digest(art)
    for scene in doc['selection']:
        slug=scene['background'];assert slug not in used,'Duplicated scene'
        used.add(slug)
        saved=original['images'][slug]['matches']['Ori'][scene['match_index_zero_based']]
        assert saved==scene['match'],'v6 match changed after selection'
        match=scene['match'];tr=match['transform']
        assert len(match['star_ids'])==9==len(match['vertices'])==len(ART_ANCHORS)
        assert len(set(match['star_ids']))==9,'duplicate real star IDs'
        assert scene['art_sha256']==art_sha,'art asset changed'
        folder=corpus/slug;meta=json.loads((folder/'metadata.json').read_text())
        assert meta['source_sha256']==scene['source_image_sha256']
        assert digest(folder/'background-dim-16x9.jpg')==scene['displayed_background_sha256']
        starlist=json.loads((folder/'stars-all.json').read_text())
        assert starlist['source_sha256']==meta['source_sha256']
        catalog={star['id']:star for star in starlist['stars']}
        for i,sid in enumerate(match['star_ids']):
            assert sid in catalog, f'missing star: {slug}/{sid}'
            x,y=transform_original(catalog[sid],meta)
            px,py=match['vertices'][i][0]*1920,match['vertices'][i][1]*1080
            assert math.hypot(x-px,y-py)<=.065, f'moved source star: {slug}/{i}'
            ax,ay=projected(*ART_ANCHORS[i],tr)
            assert math.hypot(ax-px,ay-py)<24, f'unfit anatomical anchor: {slug}/{i}'
        assert match['edges']==original['images'][slug]['matches']['Ori'][scene['match_index_zero_based']]['edges']
        suffix=scene.get('output_suffix', 'orion-v7')
        assert suffix.startswith('orion-'), 'Unexpected output prefix'
        p=output/'previews'/f'{slug}-{suffix}.jpg';q=output/'qa'/f'{slug}-{suffix}-QA.jpg'
        v=output/'overlays'/f'{slug}-{suffix}-overlay.svg'
        assert p.is_file() and q.is_file() and v.is_file(),'missing v7 artifact'
        if 'overlay_sha256' in scene:
            assert digest(v)==scene['overlay_sha256'], 'overlay differs from selected art placement'
        assert Image.open(p).size==Image.open(q).size==(1920,1080),'output not full resolution'
        painted=Image.open(io.BytesIO(cairosvg.svg2png(url=str(v)))).convert('RGBA')
        alpha=painted.getchannel('A');ext=alpha.getbbox()
        assert ext is not None,'SVG produced empty render'
        x0,y0,x1,y1=ext
        glowpad=18
        xmin,ymin,xmax,ymax=x0-glowpad,y0-glowpad,x1+glowpad,y1+glowpad
        env=match['figure_envelope_bbox_px']
        frame=(96,54,1824,1026)
        for boundary in (env,frame):
            assert xmin>=boundary[0]-.9 and ymin>=boundary[1]-.9 and xmax<=boundary[2]+.9 and ymax<=boundary[3]+.9, f'art clips reserved area {slug}: {(xmin,ymin,xmax,ymax)} vs {boundary}'
        print(f'PASS {slug:20} {scene["id"]} 9 pixel-verified stars; SVG and 18px bloom safe; 1920×1080')
    assert len(used)>=3,'v7 requires at least three independent compositions'
    print(f'PASS: {len(used)} Orion art-fit scenes verified independently; pending artistic review')

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--report',required=True,type=Path)
    ap.add_argument('--manifest',required=True,type=Path)
    ap.add_argument('--corpus',required=True,type=Path)
    ap.add_argument('--art',required=True,type=Path)
    ap.add_argument('--output',required=True,type=Path)
    x=ap.parse_args()
    run(x.report,x.manifest,x.corpus,x.art,x.output)
