#!/usr/bin/env python3
"""Reproduce M4's four 1920x1080 password-length preview frames offline."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2])
    p.add_argument('--output',type=Path,default=Path('/tmp/mellon-m4-preview'))
    a=p.parse_args()
    scene=json.loads((a.root/'lab/gnome50-m4/scene.json').read_text())
    image=a.root/'assets/starfield/corpus-v1/catalogs'/scene['background_slug']/'background-dim-16x9.jpg'
    a.output.mkdir(parents=True,exist_ok=True)
    for count in (0,3,6,9):
        img=Image.open(image).convert('RGB');w,h=img.size
        draw=ImageDraw.Draw(img,'RGBA')
        coords=[(round(x*w),round(y*h)) for x,y in scene['vertices']]
        for i,j in scene['edges']:
            if i<count and j<count:
                draw.line((coords[i],coords[j]),fill=(139,217,254,194),width=2)
        for i,(x,y) in enumerate(coords):
            if i>=count:continue
            draw.ellipse((x-13,y-13,x+13,y+13),fill=(115,208,244,29))
            draw.ellipse((x-6,y-6,x+6,y+6),fill=(139,217,254,85))
            draw.ellipse((x-2,y-2,x+2,y+2),fill=(255,255,255,245))
        out=a.output/f'length-{count:02}.jpg';img.save(out,quality=92)
        print(out)

if __name__=='__main__':
    main()
