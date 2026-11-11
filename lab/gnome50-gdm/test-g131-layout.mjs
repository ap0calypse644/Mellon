#!/usr/bin/env node
// Pixel-geometry regression for GDM screenshots: actual ~1484×928
// and native laptop / responsive sizes. The user unlock layout is
// deliberately unchanged. No GDM or VM calls.
import assert from 'node:assert/strict';
import {hudLayout, SOURCE_SAFE_INSET} from './greeter-extension/hud-layout.js';
import {hudLayout as userHudLayout}
    from '../gnome50-m8/hud-layout.js';
const intersect=(a,b)=>a&&b&&
    a.x<b.x+b.width&&a.x+a.width>b.x&&
    a.y<b.y+b.height&&a.y+a.height>b.y;

for(const [width,height] of [
    [1484,928], [1485,927], [1920,1080], [2560,1440],
    [1200,800], [1600,900], [1024,768]
]){
    const p=hudLayout(width,height);
    const center={x:width*SOURCE_SAFE_INSET,y:height*SOURCE_SAFE_INSET,
        width:width*(1-2*SOURCE_SAFE_INSET),
        height:height*(1-2*SOURCE_SAFE_INSET)};
    assert.ok(p.topLeft, `GDM upper-left HUD missing at ${width}×${height}`);
    assert.equal(p.topLeft.y,14);
    for(const [name,panel] of Object.entries(p)){
        if(!panel)continue;
        assert.ok(panel.x>=0&&panel.y>=0&&
            panel.x+panel.width<=width&&panel.y+panel.height<=height,
            `Offscreen ${name} at ${width}×${height}`);
        assert.ok(!intersect(panel,center),
            `Panel ${name} obscures photo-safe center at ${width}×${height}`);
    }
    for(const [name,a] of Object.entries(p))
        for(const [other,b] of Object.entries(p))
            if(name<other)assert.ok(!intersect(a,b),
                `Panel collision ${name} / ${other} at ${width}×${height}`);
}
const old=userHudLayout(1484,928);
assert.equal(old.topLeft,null,
    'Do not silently change already approved M8.3.2 unlock layout');
assert.equal(hudLayout(800,600).topLeft,null,
    'Existing tiny-screen suppression must remain intact');
console.log('PASS G1.3.1: GDM upper-left HUD visible at VM sizes; photo-safe; original unlock layout unchanged');
