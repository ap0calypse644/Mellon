#!/usr/bin/env python3
"""Check each source catalog against its exact source bytes and rendered backgrounds.

These assertions establish coordinate integrity. They do not prove that every
luminous image feature is a separate physical star.
"""
from __future__ import annotations
import argparse, hashlib, json, math
from pathlib import Path
from PIL import Image


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(folder,originals):
    m=json.loads((folder/'metadata.json').read_text())
    orig=originals/m['source_filename']
    assert sha(orig)==m['source_sha256'],f'{folder.name}: original SHA mismatch'
    assert sha(folder/'background-16x9.jpg')==m['background_sha256'], 'background SHA mismatch'
    assert sha(folder/'background-dim-16x9.jpg')==m['dimmed_background_sha256'], 'dimmed SHA mismatch'
    assert Image.open(orig).size==(m['source_width'],m['source_height'])
    assert Image.open(folder/'background-dim-16x9.jpg').size==(1920,1080)
    all_data=json.loads((folder/'stars-all.json').read_text())
    chosen=json.loads((folder/'stars-curated.json').read_text())
    graph=json.loads((folder/'graph-curated.json').read_text())
    match=json.loads((folder/'pattern-examples.json').read_text())
    assert chosen['image_sha256']==m['dimmed_background_sha256']
    assert len(all_data['stars'])==m['original_detected_features']
    assert len(chosen['stars'])==m['curated_features']
    orig_idx={s['id']:s for s in all_data['stars']}
    ids=set()
    w,h=m['source_width'],m['source_height']
    rot=m['transform']['clockwise_degrees']
    left,top,right,bottom=m['transform']['crop_box_rotated']
    for s in chosen['stars']:
        assert s['id'] in orig_idx
        assert s['id'] not in ids
        ids.add(s['id'])
        base=orig_idx[s['id']]
        assert s['source_px']==base['px'] and s['source_py']==base['py']
        x,y=base['px'],base['py']
        if rot==90: x,y=h-1-y,x
        else: assert rot==0
        px=(x-left)/(right-left)*1920
        py=(y-top)/(bottom-top)*1080
        assert abs(px-s['px'])<.02 and abs(py-s['py'])<.02,(s['id'],px,py)
        assert 0<=s['x']<=1 and 0<=s['y']<=1
        assert abs(s['x']*1920-s['px'])<.03
        assert abs(s['y']*1080-s['py'])<.03
    for a,b in graph['edges']:
        assert a in ids and b in ids
    for name,pattern in match['patterns'].items():
        assert len(pattern['star_ids'])==len(set(pattern['star_ids']))
        assert all(x in ids for x in pattern['star_ids'])
        assert all(0<=u<len(pattern['star_ids']) and 0<=v<len(pattern['star_ids'])
                   for u,v in pattern['edges'])
    print(folder.name,len(all_data['stars']),len(ids),len(graph['edges']),'OK')
    return len(all_data['stars']),len(ids),len(graph['edges'])


def main():
    pa=argparse.ArgumentParser();pa.add_argument('--data',type=Path,required=True)
    pa.add_argument('--originals',type=Path,required=True);args=pa.parse_args()
    counts=[validate(folder,args.originals) for folder in sorted(args.data.iterdir()) if folder.is_dir()]
    assert len(counts)==6, 'expected six datasets'
    print('VERIFIED ALL SIX:', [sum(x[i] for x in counts) for i in range(3)])

if __name__=='__main__':main()
