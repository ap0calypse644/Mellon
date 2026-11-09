#!/usr/bin/env python3
"""Build six star-position corpora and matched 16:9 lock-screen image variants.

Uses original Unsplash uploads as source; image features are not necessarily
astronomical stars. Never invents pixel coordinates. Curated stars are taken
only from points detected in the ORIGINAL image, then exactly transformed.
"""
from __future__ import annotations
import argparse, hashlib, json, math, shutil
from collections import defaultdict
from pathlib import Path
from PIL import Image, ImageEnhance, ImageDraw, ImageFont, ImageOps
import numpy as np
from scipy.spatial import cKDTree
from detector_v1 import detect, make_graph

VERSION='mellon-multifield-v1'
DESKTOP=(1920,1080)
NAME_MAP={
 'scott-lord-PiqZfESKt3k-unsplash.jpg':'rosy-rosette',
 'beat-schuler-9D2WUVsT9_I-unsplash.jpg':'cosmic-wings',
 'arnaud-girault-zWOgtUIX7OE-unsplash.jpg':'blue-gold-nebula',
 'aldebaran-s-qtRF_RxCAo0-unsplash.jpg':'chromatic-nebula',
 'scott-lord-KLFP4HwaXyk-unsplash.jpg':'veiled-ring',
 'wallace-henry-qW_OmkbDJVQ-unsplash.jpg':'dust-cloud',
}

def prepare(image):
    w,h=image.size
    # Rotate portraits clockwise, never reflect, warp, or paint missing stars.
    rot=90 if w/h<.96 else 0
    rotated=image.transpose(Image.Transpose.ROTATE_270) if rot else image
    rw,rh=rotated.size
    aspect=DESKTOP[0]/DESKTOP[1]
    if rw/rh>=aspect:
        ch=rh; cw=int(math.floor(ch*aspect))
    else:
        cw=rw; ch=int(math.floor(cw/aspect))
    cx=(rw-cw)//2; cy=(rh-ch)//2
    crop=(cx,cy,cx+cw,cy+ch)
    output=rotated.crop(crop).resize(DESKTOP,Image.Resampling.LANCZOS)
    return output,rot,crop,(rw,rh)

def project(star,w,h,rot,crop):
    x,y=star['px'],star['py']
    if rot:
        x,y=h-1-y,x
    cx,cy,xx,yy=crop
    if not (cx<=x<xx and cy<=y<yy):
        return None
    # Pixel-center normalized coordinates in the rendered production image.
    nx=(x-cx)/(xx-cx)
    ny=(y-cy)/(yy-cy)
    return {'id':star['id'], 'x':round(nx,7),'y':round(ny,7),
            'px':round(nx*DESKTOP[0],2),'py':round(ny*DESKTOP[1],2),
            'source_px':star['px'],'source_py':star['py'],
            'prominence':star['prominence'],
            'brightness':star['brightness'],
            'radius_px':star['radius_px'],
            'rgb':star['rgb'],'quality_score':star['quality_score']}

def curated(items,count=750,minimum=15):
    # Prioritize isolated, sharp, bright points while reducing clumping.
    # Coverage groups are soft, not a lattice of fabricated star locations.
    scored=[]
    for s in items:
        if s['quality_score']<.79 or s['prominence']<8.5: continue
        # Modest favor for brighter stars; prevents nebular bright blobs from
        # dominating the top entries while respecting local-star point quality.
        score=(s['quality_score']*.85 + min(1,s['prominence']/50)*.65
               + min(1,s['brightness'])*.1)
        scored.append((score,s))
    # Segments permit approx 8 candidates per tile; balanced across sky.
    bins=defaultdict(list)
    for score,s in scored:
        key=(min(11,int(s['x']*12)),min(6,int(s['y']*7)))
        bins[key].append((score,s))
    for bucket in bins.values():bucket.sort(key=lambda v:-v[0])
    selected=[]
    from scipy.spatial import cKDTree
    # Rounds of 1 per cell, avoid selecting too many in any one sector.
    for round_idx in range(17):
        choices=[]
        for key,bucket in bins.items():
            if round_idx>=len(bucket):continue
            choices.append((bucket[round_idx][0], key, bucket[round_idx][1]))
        choices.sort(key=lambda v:-v[0])
        for _score,_key,s in choices:
            if len(selected)>=count:break
            if any((s['px']-p['px'])**2+(s['py']-p['py'])**2<minimum**2
                   for p in selected[-320:]):
                # Last 320 is fast approximate prefilter; final dedup below.
                continue
            selected.append(s)
        if len(selected)>=count:break
    # Explicit exact minimum-separation check over all previously chosen items.
    final=[]
    for s in selected:
        if all((s['px']-p['px'])**2+(s['py']-p['py'])**2 >= minimum**2
               for p in final):
            final.append(s)
    return sorted(final,key=lambda s:(s['py'],s['px']))

def qa_preview(img,stars,out):
    overlay=img.copy()
    d=ImageDraw.Draw(overlay)
    for s in stars:
        x,y=s['px'],s['py'];r=2.5
        d.ellipse((x-r,y-r,x+r,y+r),outline='#52ffb9',width=1)
    overlay.save(out,quality=90,optimize=True)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--input',type=Path,required=True)
    ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--threshold',type=float,default=6.2)
    ap.add_argument('--min-separation',type=float,default=6.0)
    ap.add_argument('--curated-count',type=int,default=750)
    ap.add_argument('--dim-factor',type=float,default=.44)
    args=ap.parse_args()
    if not (0<args.dim_factor<=1): ap.error('dim-factor must be (0,1]')
    args.output.mkdir(exist_ok=True,parents=True)
    report=[]
    for filename,label in NAME_MAP.items():
        file=args.input/filename
        if not file.is_file():raise SystemExit(f'Missing source: {file}')
        print(f'[{label}] processing {file.name}',flush=True)
        source=Image.open(file).convert('RGB')
        w,h=source.size
        stars=detect(np.asarray(source),args.threshold,args.min_separation,30000)
        view,rot,crop,rotated_size=prepare(source)
        projected=[p for star in stars if (p:=project(star,w,h,rot,crop)) is not None]
        pick=curated(projected,args.curated_count)
        if len(pick)<300:raise SystemExit(f'Not enough curated points for {label}: {len(pick)}')
        out=args.output/label
        out.mkdir(parents=True,exist_ok=True)
        view.save(out/'background-16x9.jpg',quality=93,subsampling=0,optimize=True)
        dimmed=ImageEnhance.Brightness(view).enhance(args.dim_factor)
        dimmed.save(out/'background-dim-16x9.jpg',quality=93,subsampling=0,optimize=True)
        qa_preview(dimmed,pick,out/'qa-curated.jpg')
        originalhash=hashlib.sha256(file.read_bytes()).hexdigest()
        bghash=hashlib.sha256((out/'background-16x9.jpg').read_bytes()).hexdigest()
        dimhash=hashlib.sha256((out/'background-dim-16x9.jpg').read_bytes()).hexdigest()
        metadata={
            'schema':VERSION,'name':label,'source_filename':filename,
            'source_sha256':originalhash,'source_width':w,'source_height':h,
            'photo_url':'https://unsplash.com/photos/'+filename.split('-')[-2],
            'original_orientation':'portrait' if w<h else 'landscape',
            'transform':{
                'clockwise_degrees':rot,'rotated_size':list(rotated_size),
                'crop_box_rotated':list(crop),'output_size':list(DESKTOP),
                'resize':'Lanczos','stretch':False},
            'dim_factor':args.dim_factor,
            'background_sha256':bghash,'dimmed_background_sha256':dimhash,
            'original_detected_features':len(stars),
            'features_in_crop':len(projected),'curated_features':len(pick),
            'detector':{'method':'Difference-of-Gaussians + local peaks + non-max suppression',
                       'threshold':args.threshold,'min_source_separation_px':args.min_separation},
            'curation':{'count_cap':args.curated_count,'min_render_separation_px':15,
                        'quality_floor':.79,'prominence_floor':8.5,
                        'spatial_distribution':'12x7 stratified bins'},
            'note':'Luminous image features are not scientifically validated astronomical stars. '
                   'Coordinates refer to the supplied source bytes, then to the derived '
                   '1920x1080 image. Any new image transform requires remapping.'
        }
        (out/'metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
        # No detector info is invented. The source catalogue may include nebular features.
        (out/'stars-all.json').write_text(json.dumps({
            'schema':VERSION,'source_sha256':originalhash,'source_size':[w,h],
            'coordinate_space':'original','stars':stars},separators=(',',':'))+'\n')
        (out/'stars-curated.json').write_text(json.dumps({
            'schema':VERSION,'image_sha256':dimhash,'image_size':list(DESKTOP),
            'coordinate_space':'16:9 rotation+crop normalized','stars':pick},separators=(',',':'))+'\n')
        graph=make_graph(pick,8,280)
        (out/'graph-curated.json').write_text(json.dumps(graph,separators=(',',':'))+'\n')
        report.append({'name':label,'original_size':[w,h],
                       'orientation_change':rot,'detected':len(stars),
                       'in_16x9_crop':len(projected),'curated':len(pick),
                       'edges':len(graph['edges']),
                       'average_source_quality':round(sum(s['quality_score'] for s in stars)/len(stars),4)})
        print(f'  features={len(stars):,}  crop={len(projected):,}  curated={len(pick):,}  edges={len(graph["edges"]):,}',flush=True)
    (args.output/'summary.json').write_text(json.dumps({'schema':VERSION,'images':report},indent=2)+'\n')
    print('ALL DONE',flush=True)

if __name__=='__main__': main()
