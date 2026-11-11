#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=async file=>import('data:text/javascript;base64,'+
    Buffer.from(await readFile(new URL(file,import.meta.url),'utf8'))
        .toString('base64'));
const {mappingStage,mappingStatus,segmentWaveStrength,MAPPING_STAGES} =
    await load('./hud-progress.js');
const {activationCount}=await load('./scene-data.js');
assert.equal(MAPPING_STAGES,8);
for (let n=8;n<=24;n++) {
    for (let stage=0;stage<=8;stage++) {
        const lit=stage===0?0:activationCount(stage,n,8);
        const mask=new Uint8Array(n);
        // Scrambled indices demonstrate that stages depend on COUNT alone,
        // and not on original star order, raw password length or key types.
        for (let i=0;i<lit;i++)
            mask[(i*7)%n] = 1;
        // n=14/21 are not coprime with 7: use exact shuffled mask instead.
        mask.fill(0);
        const perm=Array.from({length:n},(_,i)=>i).sort((a,b)=>
            ((a*11)%n)-((b*11)%n));
        for (let i=0;i<lit;i++) mask[perm[i]]=1;
        assert.equal(mappingStage(mask),stage,`n=${n} stage=${stage}`);
        assert.equal([...mask].reduce((a,b)=>a+b,0),lit);
    }
}
assert.equal(mappingStatus(0),'AWAITING INPUT');
for(let i=1;i<8;i++)
    assert.equal(mappingStatus(i),'MAPPING CONSTELLATION');
assert.equal(mappingStatus(8),'CONSTELLATION MAPPED');
for(const input of [-1,9,2.5,Infinity])
    assert.throws(()=>mappingStatus(input));
assert.throws(()=>mappingStage(new Uint8Array(7)));
assert.throws(()=>mappingStage(new Uint8Array(25)));
const invalid=new Uint8Array(9);invalid[4]=2;
assert.throws(()=>mappingStage(invalid));
assert.throws(()=>mappingStage([]));
assert.throws(()=>mappingStage(new Uint8Array(9),7));
for(let i=0;i<8;i++) {
    for(let t=0;t<1;t+=.025) {
        const strength=segmentWaveStrength(t,i);
        assert.ok(strength>=0 && strength<=1);
    }
}
assert.throws(()=>segmentWaveStrength(1,0));
assert.throws(()=>segmentWaveStrength(-.1,0));
assert.throws(()=>segmentWaveStrength(.5,8));
console.log('PASS M8.2: visual-only 8 stages for all 8–24 real-star scenes, Backspace/reset status and bounded completion envelope');
