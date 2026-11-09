#!/usr/bin/env python3
"""Offline v7 Orion: place original layered SVG on exact v6 image-star matches.

The image/constellation coordinates are immutable. The artwork receives only a rigid
similarity transform. This script neither touches GNOME nor runs the matcher.
Requires: pillow, numpy, cairosvg. Report is the user-verified matches-v6.json.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import io
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

import cairosvg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SVGNS = "http://www.w3.org/2000/svg"
ET.register_namespace('', SVGNS)
ANCHORS = [
    ('head', (0.004, -0.500)), ('right_shoulder', (0.258, -0.370)),
    ('left_shoulder', (-0.126, -0.317)), ('belt_left', (-0.036, 0.022)),
    ('belt_middle', (0.017, 0.068)), ('belt_right', (0.075, 0.106)),
    ('left_foot', (-0.259, 0.425)), ('right_foot', (0.165, 0.499)),
    ('sword', (0.007, 0.308)),
]
PALETTE = [(150, 232, 250), (229, 198, 154)]
DEFAULT_SLUGS = ['blue-gold-nebula', 'veiled-ring', 'dust-cloud', 'cosmic-wings']


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1048576), b''):
            h.update(block)
    return h.hexdigest()


def signature(match, slug):
    h = hashlib.sha256((slug+'|Ori|'+','.join(match['star_ids'])).encode()).hexdigest()
    return 'ori-'+h[:14]


def svg_tree(path):
    return ET.parse(path).getroot()


def position(points, transform):
    p = np.asarray(points, dtype=float)
    angle = math.radians(transform['rotation_deg'])
    c, s = math.cos(angle), math.sin(angle)
    rot = np.array([[c, s], [-s, c]])
    return (p @ rot)*transform['scale_px']+np.array(transform['center_px'])


def fitted_overlay(art, match, width, height):
    """SVG overlay; keeps layer IDs and named vector paths editable after fitting."""
    root = ET.Element(f'{{{SVGNS}}}svg', {
        'width':str(width), 'height':str(height), 'viewBox':f'0 0 {width} {height}',
        'version':'1.1'})
    tr = match['transform']
    g = ET.SubElement(root, f'{{{SVGNS}}}g', {
        'id':'orion-transformed-art',
        'transform':(f'translate({tr["center_px"][0]:.8f} '
                     f'{tr["center_px"][1]:.8f}) '
                     f'rotate({tr["rotation_deg"]:.8f}) '
                     f'scale({tr["scale_px"]/1000:.10f})')})
    # Copy defs and style to root so they resolve for all nested groups.
    for item in art:
        if item.tag in (f'{{{SVGNS}}}defs', f'{{{SVGNS}}}style'):
            root.insert(0, copy.deepcopy(item))
        elif item.tag not in (f'{{{SVGNS}}}title', f'{{{SVGNS}}}desc'):
            g.append(copy.deepcopy(item))
    return ET.tostring(root, encoding='utf-8', xml_declaration=True)


def art_mask(art_path):
    """Visible fully styled artwork mask in canonical coordinate space."""
    img = Image.open(io.BytesIO(cairosvg.svg2png(url=str(art_path),
                                                 output_width=1960,
                                                 output_height=2500))).convert('RGBA')
    alpha = np.asarray(img.getchannel('A'))
    yy, xx = np.nonzero(alpha>5)
    # 2px sampling in art units; exact horizontal extrema are retained by row.
    rows = []
    for y in range(0, len(alpha), 2):
        ids = np.flatnonzero(alpha[y]>5)
        if len(ids):
            rows.extend([((ids[0] / 2)-490,(y/2)-620),
                         ((ids[-1] / 2)-490,(y/2)-620)])
    if not len(rows):
        raise ValueError('Art SVG is empty or fully transparent')
    return np.asarray(rows, dtype=float) / 1000


def art_bounds(art_points, transform, pad=22):
    px = position(art_points, transform)
    return [float(px[:,0].min()-pad), float(px[:,1].min()-pad),
            float(px[:,0].max()+pad), float(px[:,1].max()+pad)]


def inside(bbox, outer, eps=0.0):
    return bbox[0]>=outer[0]-eps and bbox[1]>=outer[1]-eps and bbox[2]<=outer[2]+eps and bbox[3]<=outer[3]+eps


def anchor_results(match):
    fitted = position([v for _,v in ANCHORS], match['transform'])
    stars = np.asarray(match['vertices'])*[1920,1080]
    errors = np.linalg.norm(fitted-stars,axis=1)
    return fitted,stars,errors


def score(match, points):
    bbox = art_bounds(points, match['transform'])
    env = match['figure_envelope_bbox_px']
    frame = [96,54,1824,1026]
    anchors,stars,err=anchor_results(match)
    valid = inside(bbox,env) and inside(bbox,frame) and float(err.max()) < 24
    span=match['coverage']['max_span_fraction']
    ofs=np.linalg.norm(match['center_offset_fraction'])
    angle=abs(match['transform']['rotation_deg'])
    # Subjective layout preference is distinct from v6 geometric rank.
    rank=(2.5*span - 1.1*ofs - .014*angle - .021*float(np.mean(err))
          - .008*match['rms_error_px'])
    return valid, rank, bbox


def transform_catalog(star, meta):
    x,y=star['px'],star['py']
    sw,sh=meta['source_width'],meta['source_height']
    deg=meta['transform']['clockwise_degrees']
    if deg==90: x,y=sh-1-y,x
    elif deg==180: x,y=sw-1-x,sh-1-y
    elif deg==270: x,y=y,sw-1-x
    elif deg!=0: raise ValueError('Unsupported rotation')
    l,t,r,b=meta['transform']['crop_box_rotated']
    w,h=meta['transform']['output_size']
    return ((x-l)*w/(r-l),(y-t)*h/(b-t))


def validate_stars(match, catalog, meta):
    raw=json.loads(catalog.read_text())
    if raw['source_sha256']!=meta['source_sha256']:
        raise ValueError('Source hash mismatch')
    ids={v['id']:v for v in raw['stars']}
    if len(match['star_ids'])!=9 or len(set(match['star_ids']))!=9:
        raise ValueError('Orion needs nine distinct source features')
    observed=np.asarray(match['vertices'],dtype=float)*[1920,1080]
    results=[]
    for i,(name,sid) in enumerate(zip((v[0] for v in ANCHORS),match['star_ids'])):
        if sid not in ids: raise ValueError('Missing feature id: '+sid)
        expected=transform_catalog(ids[sid],meta)
        discrepancy=float(np.linalg.norm(observed[i]-expected))
        if discrepancy>0.065:
            raise ValueError(f'Star source-to-display mapping discrepancy {sid}: {discrepancy:.4f}px')
        results.append({'anchor':name,'source_star_id':sid,
                        'display_position_px':list(map(float,observed[i])),
                        'catalog_transform_discrepancy_px':round(discrepancy,5)})
    return results


def starfield_draw(base, match):
    """Clean scene lines only on real measured stars, never on idealized template vertices."""
    image=base.copy().convert('RGBA'); w,h=image.size
    stars=np.asarray(match['vertices'])*[w,h]
    lum=Image.new('RGBA',(w,h)); ldr=ImageDraw.Draw(lum,'RGBA')
    for ax,ay in stars:
        for r,alpha in [(21,13),(12,29),(6,52)]:
            ldr.ellipse((ax-r,ay-r,ax+r,ay+r),fill=(114,207,252,alpha))
    lum=lum.filter(ImageFilter.GaussianBlur(5))
    image=Image.alpha_composite(image,lum)
    line=Image.new('RGBA',(w,h)); dr=ImageDraw.Draw(line,'RGBA')
    for ia,ib in match['edges']:
        dr.line([tuple(stars[ia]),tuple(stars[ib])],fill=(142,206,237,52),width=2)
    for x,y in stars:
        dr.ellipse((x-4,y-4,x+4,y+4),fill=(234,249,255,236))
        dr.ellipse((x-7,y-7,x+7,y+7),outline=(158,224,249,152),width=2)
    image=Image.alpha_composite(image,line)
    return image


def composition(base, vector, match):
    w,h=base.size
    painting=Image.open(io.BytesIO(cairosvg.svg2png(bytestring=vector))).convert('RGBA')
    # Glow from actual art alpha, not an invented background star map.
    glow=Image.new('RGBA',(w,h),(142,202,235,0)); glow.putalpha(painting.getchannel('A').filter(ImageFilter.GaussianBlur(4)).point(lambda a:int(a*.20)))
    image=Image.alpha_composite(starfield_draw(base,match),glow)
    return Image.alpha_composite(image,painting)


def draw_qa(clean, match, figure_bbox, starinfo, anchorfit, errors, slug, ident):
    image=clean.copy().convert('RGBA');dr=ImageDraw.Draw(image,'RGBA')
    w,h=image.size
    inner=[.14*w,.14*h,.86*w,.86*h]
    env=match['figure_envelope_bbox_px']
    dr.rectangle(tuple(inner),outline=(64,221,249,185),width=2)
    dr.rectangle(tuple(env),outline=(249,187,83,210),width=3)
    dr.rectangle(tuple(figure_bbox),outline=(123,244,173,210),width=3)
    stars=np.asarray(match['vertices'])*[w,h]
    try:font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17)
    except OSError:font=ImageFont.load_default()
    for i, (s,p) in enumerate(zip(stars,anchorfit)):
        dr.line((tuple(s),tuple(p)),fill=(255,102,121,240),width=2)
        dr.ellipse((s[0]-4,s[1]-4,s[0]+4,s[1]+4),fill=(250,250,250,255))
        dr.text((s[0]+9,s[1]+7),f'{i}:{ANCHORS[i][0]}  {errors[i]:.1f}px',font=font,
                fill=(255,255,255,235),stroke_fill=(7,12,20,230),stroke_width=3)
    dr.rounded_rectangle((16,16,900,73),radius=9,fill=(5,11,20,230))
    dr.text((30,28),f'{slug}  |  {ident}  |  RMS {match["rms_error_px"]:.2f}px  |  figure safe',font=font,fill=(238,239,243,255))
    return image.convert('RGB')


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--report',type=Path,required=True,help='Existing matches-v6.json; do not rerun matcher')
    ap.add_argument('--corpus',type=Path,default=ROOT/'assets/starfield/corpus-v1/catalogs')
    ap.add_argument('--art',type=Path,default=ROOT/'assets/constellation-art/orion/orion-figure.svg')
    ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--slugs',nargs='+',default=DEFAULT_SLUGS)
    ap.add_argument('--preview-count',type=int,default=4)
    ap.add_argument('--variant',default='v7',help='Suffix for output file names; default preserves original v7 prototype')
    args=ap.parse_args()
    report=json.loads(args.report.read_text())
    if report['schema']!='mellon-centered-constellation-matches-v6':
        raise ValueError('Expected the original v6 report; got '+str(report.get('schema')))
    art=svg_tree(args.art)
    pts=art_mask(args.art)
    out=args.output; (out/'previews').mkdir(parents=True,exist_ok=True);(out/'qa').mkdir(parents=True,exist_ok=True);(out/'overlays').mkdir(parents=True,exist_ok=True)
    generated=[]
    suffix='orion-'+args.variant
    for slug in args.slugs[:args.preview_count]:
        data=report['images'][slug]
        candidates=[]
        for idx,match in enumerate(data['matches']['Ori']):
            valid,rank,bbox=score(match,pts)
            if valid:candidates.append((rank,idx,match,bbox))
        if not candidates:raise ValueError(f'No art-safe Orion placement found for {slug}')
        candidates.sort(reverse=True)
        rank,idx,match,bbox=candidates[0]
        ident=signature(match,slug)
        cdir=args.corpus/slug
        meta=json.loads((cdir/'metadata.json').read_text())
        bg=cdir/'background-dim-16x9.jpg'
        if sha256(bg)!=meta['dimmed_background_sha256']:
            raise ValueError('Background pixels/hash mismatch: '+slug)
        src=validate_stars(match,cdir/'stars-all.json',meta)
        fitted,stars,errors=anchor_results(match)
        w,h=data['image_size']
        base=Image.open(bg).convert('RGB')
        if base.size!=(w,h):raise ValueError('Unexpected background dimensions')
        vector=fitted_overlay(art,match,w,h)
        clean=composition(base,vector,match)
        clean.convert('RGB').save(out/'previews'/f'{slug}-{suffix}.jpg',quality=94,subsampling=0)
        qa=draw_qa(clean,match,bbox,src,fitted,errors,slug,ident)
        qa.save(out/'qa'/f'{slug}-{suffix}-QA.jpg',quality=92)
        (out/'overlays'/f'{slug}-{suffix}-overlay.svg').write_bytes(vector)
        generated.append({'id':ident,'background':slug,'source_image_sha256':meta['source_sha256'],
            'displayed_background_sha256':meta['dimmed_background_sha256'],
            'match_index_zero_based':idx,'match':match,'source_stars':src,
            'art_sha256':sha256(args.art),'art_layer_path':str(args.art),
            'art_bbox_px_including_glow':list(map(lambda x:round(x,3),bbox)),
            'anchor_errors_px':{name:round(float(x),3) for (name,_),x in zip(ANCHORS,errors)},
            'anchor_rms_px':round(float(np.sqrt(np.mean(errors**2))),3),
            'art_fit_rank':round(rank,6), 'human_review':'pending',
            'output_suffix':suffix, 'overlay_sha256':hashlib.sha256(vector).hexdigest()})
        print(f'PASS {slug:<19} idx={idx:3} {ident} span={match["coverage"]["max_span_fraction"]:.3f} angle={match["transform"]["rotation_deg"]:+.1f} RMS={match["rms_error_px"]:.2f} anchor-max={errors.max():.2f}px art-bbox={list(map(int,bbox))}')
    manifest={'schema':'mellon-orion-art-v7-preview','version':('classical-celestial-engraving' if args.variant != 'v7' else 'first-art-direction-prototype'),
              'approval':'pending-human-visual-qa','source_report':str(args.report),
              'art_license':'Original artwork; attribution/provenance in PROVENANCE.md',
              'selection_note':'single Orion per scene; rigid-only art fit; one selected placement per distinct source image',
              'selection':generated}
    (out/'fit-results.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Saved',out)

if __name__=='__main__':main()
