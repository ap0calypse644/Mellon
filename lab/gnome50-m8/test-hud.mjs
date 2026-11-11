#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

async function pure(path) {
    const src = await readFile(new URL(path, import.meta.url), 'utf8');
    return import('data:text/javascript;base64,' +
        Buffer.from(src).toString('base64'));
}
const {hudMetadata} = await pure('./hud-state.js');
const {hudLayout, SOURCE_SAFE_INSET} = await pure('./hud-layout.js');
const scene = {name: 'Scorpius',
    vertices: Array.from({length: 14}, (_, i) => [i / 20, i / 20]),
    edges: Array.from({length: 13}, (_, i) => [i, i + 1])};
const info = hudMetadata(scene);
assert.deepEqual(info, {
    constellation: 'SCORPIUS', sourceStars: 14,
    connections: 13, status: 'STAR MAP READY',
    mapping: 'VISUAL ARRAY STANDBY', stageCapacity: 8,
});
assert.ok(Object.isFrozen(info));
assert.throws(() => hudMetadata({...scene, name:'', vertices: []}));
assert.throws(() => hudMetadata({...scene, edges:[[0, 99]]}));
assert.equal(SOURCE_SAFE_INSET, .14);

const intersects = (a, b) => a && b &&
    a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
for (const [w,h] of [[1920,1080], [2560,1440], [1440,900],
    [1280,720], [1024,768], [900,1600], [800,600], [1024,600]]) {
    const r = hudLayout(w,h);
    const center = {x:.14*w,y:.14*h,width:.72*w,height:.72*h};
    const recovery = {x:26,y:22,width:145,height:46};
    const actors = Object.values(r).filter(Boolean);
    for (const b of actors) {
        assert.ok(b.x >= 0 && b.y >= 0 &&
            b.x + b.width <= w && b.y + b.height <= h);
        assert.ok(!intersects(b,center), 'HUD obscures central star-safe area');
        assert.ok(!intersects(b,recovery), 'HUD obscures SHOW LOGIN');
        for (const other of actors) {
            if (b !== other)
                assert.ok(!intersects(b,other), 'HUD panels collide');
        }
    }
}
const standard=hudLayout(1920,1080);
assert.ok(Object.values(standard).every(Boolean),
    'All four panels should fit at 1920x1080');
assert.equal(hudLayout(800,600).topRight,null,
    'HUD hides on cramped viewport rather than risk auth control');
console.log('PASS M8.1: real scene metadata, 8-stage standby, edge-safe responsive geometry and recovery collision constraints');
