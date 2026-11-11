#!/usr/bin/env node
// Synthetic-only M7 effects tests; no GNOME, passwords, input or assets.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./stellar-effects.js', import.meta.url), 'utf8');
const {StellarEffects, completionWave, completionLevel, starLightProfile,
    connectionLightProfile, IGNITION_SEC, PULSE_SEC,
    COMPLETION_SEC} = await import('data:text/javascript;base64,' +
    Buffer.from(source).toString('base64'));

function mask(n, selected) {
    const result = new Uint8Array(n);
    for (const index of selected)
        result[index] = 1;
    return result;
}

const graph=[[3,7],[1,7],[0,3],[7,8]];
const fx=new StellarEffects(9,graph);
assert.equal(fx.sample(0).busy,false,'idle loop must stay inactive');
fx.transition(mask(9,[3,7]),1);
let frame=fx.sample(1.15);
assert.equal(frame.busy,true);
assert.ok(frame.ignition[3]>0);
assert.ok(frame.ignition[7]>0);
assert.equal(frame.ignition[1],0);
assert.equal(frame.pulses.length,1,'only one connected edge was completed');
assert.equal(frame.pulses[0].from,3);
assert.equal(frame.pulses[0].to,7);
assert.ok(frame.pulses[0].progress>0);
assert.ok(frame.pulses[0].strength>0);

// Unchanged length must never replay a stellar ignition or traveling pulse.
fx.transition(mask(9,[3,7]),1.3);
const after=fx.sample(1.4);
assert.equal(after.pulses.length,1);
assert.ok(after.pulses[0].progress>.4);
assert.equal(fx.sample(1+Math.max(PULSE_SEC,IGNITION_SEC)+.1).busy,false,
    'effects should stop automatically after bounded durations');

// Lighting a new star emits only pulses along now-complete connections.
fx.transition(mask(9,[1,3,7]),2);
frame=fx.sample(2.15);
assert.equal(frame.pulses.length,1);
assert.equal(frame.pulses[0].from,1);
assert.equal(frame.pulses[0].to,7);
assert.ok(frame.ignition[1]>0);
assert.equal(frame.ignition[3],0);

// Removing a random lit endpoint immediately cancels its edge animation.
fx.transition(mask(9,[1,3]),2.2);
frame=fx.sample(2.3);
assert.equal(frame.pulses.length,0,'No packet may travel along an inactive edge');
assert.equal(frame.ignition[7],0,'Backspace cannot leave stale star flares');

// Full constellation produces ONE completion wave, not an idle effect.
fx.transition(mask(9,[0,1,2,3,4,5,6,7,8]),3);
frame=fx.sample(3.35);
assert.notEqual(frame.completion,null);
assert.equal(frame.busy,true);
assert.ok(completionWave(frame.completion,0)>0);
assert.equal(completionWave(.15,1),0,
    'Outer star should not celebrate before inward wave reaches it');
fx.transition(mask(9,[0,1,2,3,4,5,6,7,8]),3.4);
assert.equal(fx.sample(3.7).completion!==null,true);
const finished=fx.sample(3+COMPLETION_SEC+.1);
assert.equal(finished.busy,false,'completed figure must not run an idle timer');
assert.equal(finished.settled,true,'stars/lines must remain bright after wave');
assert.equal(finished.completion,null);
assert.equal(completionLevel(finished),1,'static completed brightness persists');
assert.equal(completionLevel(fx.sample(3.6))>0,true,
    'Completion intensity must ramp up during the wave');

// Backspace cancels completion instantly; further typing may trigger it
// again exactly once, with no stale pulse queue.
fx.transition(mask(9,[0,1,2,3,4,5,6,7]),4.4);
assert.equal(fx.sample(4.41).completion,null);
assert.equal(fx.sample(4.41).settled,false,
    'Backspace must clear the persistent full-constellation latch');
assert.equal(completionLevel(fx.sample(4.41)),0);
fx.transition(mask(9,[0,1,2,3,4,5,6,7,8]),4.5);
assert.notEqual(fx.sample(4.7).completion,null);
fx.reset();
frame=fx.sample(4.8);
assert.equal(frame.completion,null);
assert.equal(frame.pulses.length,0);
assert.equal(frame.busy,false);
assert.equal(frame.settled,false,'Failed login/reset must clear bright latch');

// Original-color source-star texture should become DRAMATIC during
// ignition, have a much stronger wave, then remain visibly enhanced.
const normal=starLightProfile(0,0,0);
const ignite=starLightProfile(1,0,0);
const wavePeak=starLightProfile(0,1,.5);
const brilliant=starLightProfile(0,0,1);
assert.equal(normal.coreScale,1);
assert.equal(normal.haloStrength,0);
assert.ok(ignite.coreScale>=1.7 && ignite.haloScale>=2.6 &&
    ignite.haloStrength>=.95,
    'Initial ignition must be much more intense than M7');
assert.ok(wavePeak.coreScale>=1.5 && wavePeak.haloScale>=2.5 &&
    wavePeak.haloStrength>=.9,
    'Completion wave must be much stronger than M7');
assert.ok(brilliant.coreScale>1.15 && brilliant.haloStrength>=.6,
    'Bright star bloom must persist after completion');
assert.ok(brilliant.haloScale>1.6);
const baselineLine=connectionLightProfile(0,0);
const peakLine=connectionLightProfile(1,.5);
const retainedLine=connectionLightProfile(0,1);
assert.ok(peakLine.lineAlpha>.9 && peakLine.lineWidth>=3.0 &&
    peakLine.glowWidth>=9 && peakLine.glowAlpha>.5,
    'Completion must create a strong, broad line flash');
assert.ok(retainedLine.lineAlpha>.9 && retainedLine.lineWidth>=2 &&
    retainedLine.glowAlpha>=.4,
    'Lines must stay brighter and thicker after the wave');
assert.ok(retainedLine.lineAlpha>baselineLine.lineAlpha);
assert.ok(retainedLine.lineWidth>baselineLine.lineWidth);
assert.throws(()=>starLightProfile(1.5,0,0));
assert.throws(()=>connectionLightProfile(NaN,0));

// Any of the approved larger constellation sizes stays bounded.
for(const n of [8,9,10,12,13,14,17,18,24]) {
    const edges=Array.from({length:n-1},(_,i)=>[i,i+1]);
    const scene=new StellarEffects(n,edges);
    scene.transition(mask(n,Array.from({length:n},(_,i)=>i)),100);
    const current=scene.sample(100.2);
    assert.equal(current.pulses.length,n-1);
    assert.ok(current.ignition.every(v=>v>=0 && v<=1));
    assert.equal(current.busy,true);
    assert.equal(scene.sample(102).busy,false);
    assert.equal(scene.sample(102).settled,true);
    assert.equal(completionLevel(scene.sample(102)),1);
    scene.transition(mask(n,[]),103);
    assert.equal(scene.sample(103.1).busy,false);
    assert.equal(scene.sample(103.1).settled,false);
}

assert.throws(()=>new StellarEffects(7,[[0,1]]));
assert.throws(()=>new StellarEffects(9,[[0,9]]));
assert.throws(()=>fx.transition(mask(8,[]),1));
assert.throws(()=>fx.transition(mask(9,[]),-1));
assert.throws(()=>fx.sample(NaN));
assert.equal(completionWave(1,.2),0);
console.log('PASS M7.1: dramatic ignition and completion bloom, retained bright photo-stars and lines after idle stop, reset on Backspace/failure, 8–24 star compatibility');
