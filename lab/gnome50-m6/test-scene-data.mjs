#!/usr/bin/env node
// Pure M6 schema/activation tests: NO GNOME, no password values, no real search.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('./scene-data.js', import.meta.url), 'utf8');
const {
    validateLibrary, activationCount, pickScene, coverTransform,
} = await import('data:text/javascript;base64,' +
    Buffer.from(source).toString('base64'));

const image = [1920, 1080];
const makeScene = (slug, n) => ({
    id: `${slug}/01-Leo`, background:slug, name:'Leo',
    constellation:'Leo', image_size:image,
    image:`assets/${slug}/background.jpg`,
    image_sha256:'a'.repeat(64),
    star_ids:Array.from({length:n},(_,i)=>`S${String(i+1).padStart(6,'0')}`),
    vertices:Array.from({length:n},(_,i)=>[.2+.5*i/n,.4+.1*i/n]),
    edges:Array.from({length:n-1},(_,i)=>[i,i+1]),
    sprites:Array.from({length:n},(_,i)=>
        `assets/${slug}/01-Leo/star-${String(i).padStart(2,'0')}.png`),
    sprite_size:[26,26],
});
const names=['blue-gold-nebula','chromatic-nebula','cosmic-wings',
    'dust-cloud','rosy-rosette','veiled-ring'];
const lib={schema:'mellon-m6-scene-library-v1',
    scenes:names.map((s,i)=>makeScene(s,[9,9,13,9,9,12][i]))};
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
console.log('PASS M6: 6 distinct valid scenes, >=8 stars, 8-stage mapping, per-lock selection and path safety');
