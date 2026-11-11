#!/usr/bin/env node
// Pure M6 schema/activation tests: NO GNOME, no password values, no real search.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('./scene-data.js', import.meta.url), 'utf8');
const {
    validateLibrary, activationCount, pickScene, coverTransform,
    updateActiveStars, activeEdges,
} = await import('data:text/javascript;base64,' +
    Buffer.from(source).toString('base64'));

const image = [1920, 1080];
// This is the ACTUAL pinned M6.4 manifest, not a hand-written imitation
// of what happens to be selected by the package builder.
const manifest = JSON.parse(await readFile(
    new URL('./pilot-selection.json', import.meta.url), 'utf8'));
assert.equal(manifest.schema, 'mellon-m6-curated-library-v2');
assert.equal(manifest.initial_mode, 'random-on-lock');
assert.equal(manifest.activation_stages, 8);
assert.equal(manifest.pilot_scene_ids.length, 12);
assert.equal(new Set(manifest.pilot_scene_ids).size, 12);

// Exact source-star counts were previously verified from local v9 QA index.
const counts = {
    'blue-gold-nebula/02-Leo': 9,
    'blue-gold-nebula/07-Crt': 9,
    'chromatic-nebula/01-Leo': 9,
    'cosmic-wings/01-Leo': 9,
    'cosmic-wings/03-Vir': 13,
    'cosmic-wings/05-Cep': 10,
    'dust-cloud/03-Crt': 9,
    'dust-cloud/08-And': 17,
    'rosy-rosette/04-Cyg': 9,
    'rosy-rosette/06-Sco': 14,
    'veiled-ring/03-Gem': 12,
    'veiled-ring/08-Peg': 14,
};
assert.deepEqual(new Set(manifest.pilot_scene_ids),new Set(Object.keys(counts)));
const makeScene = (id, n) => {
    const [slug, label] = id.split('/');
    const code = label.split('-')[1];
    return {
        id, background:slug, name:code,
        constellation:code, image_size:image,
        image:`assets/${slug}/background.jpg`,
        image_sha256:'a'.repeat(64),
        star_ids:Array.from({length:n},(_,i)=>`S${String(i+1).padStart(6,'0')}`),
        vertices:Array.from({length:n},(_,i)=>[.2+.5*i/n,.4+.1*i/n]),
        edges:Array.from({length:n-1},(_,i)=>[i,i+1]),
        sprites:Array.from({length:n},(_,i)=>
            `assets/${slug}/${label}/star-${String(i).padStart(2,'0')}.png`),
        sprite_size:[26,26],
    };
};
const lib={schema:'mellon-m6-scene-library-v1',
    scenes:manifest.pilot_scene_ids.map(id=>makeScene(id, counts[id]))};
assert.equal(new Set(lib.scenes.map(s=>s.background)).size,6);
assert.equal(validateLibrary(lib),lib);
for (const scene of lib.scenes) {
    assert.ok(scene.vertices.length>=8);
    assert.equal(activationCount(0,scene.vertices.length),0);
    assert.equal(activationCount(8,scene.vertices.length),scene.vertices.length);
    assert.equal(activationCount(100,scene.vertices.length),scene.vertices.length);
    let last=0;
    for (let length=0;length<=8;length++) {
        const now=activationCount(length,scene.vertices.length);
        assert.ok(now>=last,'activations must never go backwards when typing');
        last=now;
    }
}
assert.equal(activationCount(1,13),2);
assert.equal(activationCount(2,13),4);
assert.equal(activationCount(4,13),7);
assert.equal(activationCount(8,13),13);
assert.equal(activationCount(6,13),10);
assert.equal(activationCount(5,9),6);
// M6.1 deterministic RNG checks: one character randomly lights stars
// #3 and #7 rather than contiguous #0 and #1.
const originalMask = new Uint8Array(9);
const initialChoice = [0.35, 0.76];
const first = updateActiveStars(originalMask, activationCount(1,9),
    () => initialChoice.shift());
assert.deepEqual([...first].map((v,i) => v ? i : -1).filter(i => i >= 0),
    [3,7]);
assert.equal(originalMask.reduce((a,b) => a+b,0),0, 'pure copy, not mutation');

// Next insertion lights an unused real source star, preserving the first two.
const second = updateActiveStars(first, activationCount(2,9), () => 0.2);
assert.deepEqual([...second].map((v,i) => v ? i : -1).filter(i => i >= 0),
    [1,3,7]);

// Backspace removes a randomly selected ACTIVE star (#3) rather than the
// most recently activated star (#1). This checks the key request precisely.
const backspace = updateActiveStars(second, activationCount(1,9), () => 0.5);
assert.deepEqual([...backspace].map((v,i) => v ? i : -1)
    .filter(i => i >= 0), [1,7]);
assert.equal(second[3],1, 'Backspace must not mutate saved previous state');

// Connected edges are shown only while BOTH endpoints are selected.
const lines = [[3,7],[1,7],[0,3],[7,8]];
assert.deepEqual(activeEdges(lines, first), [[3,7]]);
assert.deepEqual(activeEdges(lines, second), [[3,7],[1,7]]);
assert.deepEqual(activeEdges(lines, backspace), [[1,7]]);
assert.deepEqual(activeEdges(lines, new Uint8Array(9)), []);

// Unchanged length must not consume random numbers or silently shuffle.
// Failed auth / field reset must remove every star.
const steady = updateActiveStars(backspace,2,
    () => { throw new Error('Repeated length must not resample'); });
assert.deepEqual([...steady],[...backspace]);
assert.equal(updateActiveStars(second,0,()=>0.99).reduce((a,b)=>a+b,0),0);
assert.throws(()=>updateActiveStars(first,3,()=>1));
assert.throws(()=>updateActiveStars(first,3,()=>-0.1));

// All 8/9/12/13/18 star constellations use exactly the same random
// activation/removal logic, with one-to-one selection and no duplicates.
for (const n of [8,9,12,13,18,24]) {
    let mask = new Uint8Array(n);
    for (let length=1;length<=8;length++) {
        mask = updateActiveStars(mask,activationCount(length,n),()=>0.37);
        assert.equal(mask.reduce((a,b)=>a+b,0),activationCount(length,n));
        assert.ok([...mask].every(x=>x===0||x===1));
    }
    for (let length=7;length>=0;length--) {
        mask = updateActiveStars(mask,activationCount(length,n),()=>0.73);
        assert.equal(mask.reduce((a,b)=>a+b,0),activationCount(length,n));
    }
}

const fixed={mode:'fixed',scene_id:lib.scenes[2].id};
assert.equal(pickScene(lib,fixed).id,fixed.scene_id);
assert.notEqual(pickScene(lib,{mode:'random-on-lock'},lib.scenes[0].id,()=>0).id,
    lib.scenes[0].id);
assert.deepEqual(coverTransform(1920,1080,1920,1080),
    {scale:1,dx:0,dy:0});
assert.deepEqual(coverTransform(1600,1000,1920,1080),
    {scale:1000/1080,dx:(1600-1920*1000/1080)/2,dy:0});
assert.throws(()=>pickScene(lib,{mode:'fixed',scene_id:'bad'}));
assert.throws(()=>pickScene(lib,{mode:'automagic'}));
assert.throws(()=>activationCount(1,7));
const original=lib.scenes[0];
lib.scenes[0]={...original,star_ids:original.star_ids.slice(1)};
assert.throws(()=>validateLibrary(lib),'Must reject invalid star identity counts');
lib.scenes[0]=original;
lib.scenes[0]={...original, image:'assets/../secret'};
assert.throws(()=>validateLibrary(lib),'Must reject path traversal');
lib.scenes[0]=original;
// Scene picker must address all twelve unique variants and cannot
// immediately repeat an identical scene in the same extension lifecycle.
for (let i=0; i<12; i++) {
    const id=lib.scenes[i].id;
    assert.equal(pickScene(lib,{mode:'fixed',scene_id:id}).id,id);
    const next=pickScene(lib,{mode:'random-on-lock'},id,()=>0.25);
    assert.notEqual(next.id,id);
}
assert.throws(()=>validateLibrary({...lib,scenes:lib.scenes.slice(0,6)}));
assert.throws(()=>validateLibrary({...lib,
    scenes:[...lib.scenes.slice(0,11),lib.scenes[0]]}));
console.log('PASS M6.4: 12 pinned 8+-star scenes, six backgrounds, default random-on-lock and no immediate scene repetition');
console.log('PASS M6.4: random star add/remove, two-lit-star connectors, 8-stage mapping and path safety');
