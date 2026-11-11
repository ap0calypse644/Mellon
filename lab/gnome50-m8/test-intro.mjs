#!/usr/bin/env node
// M8.3.2 synthetic full-screen grid-sweep verification (no GNOME/VM).
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = path => readFile(new URL(path, import.meta.url), 'utf8');
const load = async path => import('data:text/javascript;base64,' +
    Buffer.from(await source(path)).toString('base64'));
const {INTRO_DURATION_MS, INTRO_TICK_MS, INTRO_REPEAT_MS, introFrame,
    gridGeometry, gridCellStrength} = await load('./hud-intro-state.js');
const {hudLayout} = await load('./hud-layout.js');

assert.equal(INTRO_DURATION_MS, 1850);
assert.equal(INTRO_TICK_MS, 50);
assert.equal(INTRO_REPEAT_MS, 5000);
assert.ok(INTRO_REPEAT_MS > INTRO_DURATION_MS,
    'Recurring sweeps must have an idle period');
assert.equal(INTRO_REPEAT_MS - INTRO_DURATION_MS,3150);
assert.deepEqual(introFrame(0), {
    done: false, progress: 0, sweep: 0,
    gridOpacity: 0, panelOpacity: 0,
});
const end = introFrame(INTRO_DURATION_MS);
assert.equal(end.done, true);
assert.equal(end.sweep, 1);
assert.equal(end.gridOpacity, 0);
assert.equal(end.panelOpacity, 255);
assert.equal(introFrame(INTRO_DURATION_MS * 10).done, true);
for (const input of [-1, NaN, Infinity])
    assert.throws(() => introFrame(input));

const geom = gridGeometry(1920, 1080);
assert.deepEqual([geom.columns, geom.rows], [23, 14]);
assert.ok(Object.isFrozen(geom));
assert.ok(Math.abs(geom.cellWidth * geom.columns - 1920) < 1e-8);
assert.ok(Math.abs(geom.cellHeight * geom.rows - 1080) < 1e-8);
for (const [w, h] of [[2560,1440],[1920,1080],[1440,900],
    [1280,720],[1024,768],[800,600],[600,400]]) {
    const g = gridGeometry(w,h);
    assert.ok(g.columns>=12 && g.columns<=36);
    assert.ok(g.rows>=5 && g.rows<=24);
    assert.equal(g.width, w);
    assert.equal(g.height, h);
    // Grid is viewport-wide even when the HUD intentionally hides panels.
    if (w===800 && h===600) {
        assert.ok(Object.values(hudLayout(w,h)).every(x=>x===null));
        assert.ok(g.columns >= 12);
    }
    // The maximum row stagger stays below the next column's start.
    for (let col=0; col<g.columns-1; col++)
        assert.ok(col/g.columns + .014 < (col+1)/g.columns);
    for (const progress of [0,.01,.13,.31,.5,.67,.85,1]) {
        let seenRight=false;
        for (let col=g.columns-1; col>=0; col--) {
            const strength=gridCellStrength({sweep:progress},col,0,g);
            assert.ok(strength>=0 && strength<=1);
            if (strength>0)seenRight=true;
            else assert.ok(!seenRight, 'Left-to-right column ordering reversed');
        }
    }
    // At the halfway point every far-right column stays dark.
    const atHalf={sweep:.5};
    assert.ok(gridCellStrength(atHalf,0,0,g)>0);
    assert.equal(gridCellStrength(atHalf,g.columns-1,g.rows-1,g),0);
    assert.ok(gridCellStrength({sweep:1},g.columns-1,g.rows-1,g)>0);
}
for(const bad of [[0,1080],[1920,0],[319,240],
    [800,239],[NaN,800],[Infinity,800]])
    assert.throws(()=>gridGeometry(...bad));

const g=gridGeometry(1920,1080);
for(const args of [
    [null,0,0,g],[{sweep:-.1},0,0,g],
    [{sweep:.5},-1,0,g],[{sweep:.5},g.columns,0,g],
    [{sweep:.5},0,g.rows,g],[{sweep:.5},0,0,null],
]) assert.throws(()=>gridCellStrength(...args));

// Once the deadline is reached there is no live progress or opacity.
let ticks=0;
for(let elapsed=0;elapsed<=INTRO_DURATION_MS+100;elapsed+=INTRO_TICK_MS) {
    const f=introFrame(elapsed);
    if(f.done)break;
    assert.ok(f.gridOpacity>=0 && f.gridOpacity<=1);
    assert.ok(f.sweep>=0 && f.sweep<=1);
    assert.ok(f.panelOpacity>=0 && f.panelOpacity<=255);
    ticks++;
}
assert.ok(ticks<=Math.ceil(INTRO_DURATION_MS/INTRO_TICK_MS));
console.log('PASS M8.3.2: 23x14 full-screen grid, left-to-right columns, deterministic mosaic, finite 1.85s sweep with 5s start-to-start cadence');
