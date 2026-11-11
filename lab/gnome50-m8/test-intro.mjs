#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=async path=>import('data:text/javascript;base64,'+
    Buffer.from(await readFile(new URL(path, import.meta.url), 'utf8'))
        .toString('base64'));
const {introFrame,introScanBounds,INTRO_DURATION_MS,INTRO_TICK_MS}=
    await load('./hud-intro-state.js');
const {hudLayout,SOURCE_SAFE_INSET}=await load('./hud-layout.js');
assert.equal(INTRO_DURATION_MS,1050);
assert.equal(INTRO_TICK_MS,50);
assert.deepEqual(introFrame(0),{
    done:false,progress:0,panelOpacity:0,scanOpacity:0,
});
for (const t of [1050,1100,20000]) {
    const f=introFrame(t);
    assert.equal(f.done,true);
    assert.equal(f.panelOpacity,255);
    assert.equal(f.scanOpacity,0);
}
for(const value of [-1,NaN,Infinity])
    assert.throws(()=>introFrame(value));
let opacity=0,frames=0;
for(let t=0;t<=INTRO_DURATION_MS+INTRO_TICK_MS;t+=INTRO_TICK_MS) {
    const f=introFrame(t);
    assert.ok(f.panelOpacity>=opacity && f.panelOpacity<=255);
    assert.ok(f.scanOpacity>=0 && f.scanOpacity<=96);
    opacity=f.panelOpacity;
    if(!f.done)frames++;
}
assert.ok(frames<=Math.ceil(INTRO_DURATION_MS/INTRO_TICK_MS));
const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&
    a.y<b.y+b.height&&a.y+a.height>b.y;
for(const [w,h] of [[1920,1080],[2560,1440],[1440,900],
    [1280,720],[1024,768],[900,1600],[800,600]]) {
    const boxes=hudLayout(w,h);
    const center={x:w*SOURCE_SAFE_INSET,y:h*SOURCE_SAFE_INSET,
        width:w*(1-2*SOURCE_SAFE_INSET),
        height:h*(1-2*SOURCE_SAFE_INSET)};
    const recovery={x:26,y:22,width:145,height:46};
    for(const box of Object.values(boxes).filter(Boolean))
        for(const p of [0,.03,.25,.5,.8,1]) {
            const scan=introScanBounds(box,p);
            assert.ok(scan.x>=box.x && scan.y>=box.y);
            assert.ok(scan.x+scan.width<=box.x+box.width);
            assert.ok(scan.y+scan.height<=box.y+box.height);
            assert.ok(!intersects(scan,center),'Scan enters central starfield');
            assert.ok(!intersects(scan,recovery),'Scan covers SHOW LOGIN');
        }
}
assert.throws(()=>introScanBounds(null,.5));
assert.throws(()=>introScanBounds({x:0,y:0,width:9,height:2},.5));
assert.throws(()=>introScanBounds({x:0,y:0,width:300,height:80},1.1));
console.log('PASS M8.3: bounded one-shot fading, no ongoing effect and screen-safe scan geometry');
