#!/usr/bin/env node
// G1.8/M8.4 shared 8-stage HUD behavior. Synthetic GNOME objects only.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const pure=await read('../gnome50-m8/hud-progress.js');
const pg=await import('data:text/javascript;base64,'+
    Buffer.from(pure).toString('base64'));
let now=10_000_000;
const GLib={get_monotonic_time:()=>now};
let currentProgress=null;
const initHud=async path=>{
    let src=await read(path);
    src=src.replace("import Clutter from 'gi://Clutter';",'')
        .replace("import GLib from 'gi://GLib';",'')
        .replace("import St from 'gi://St';",'')
        .replace("import {hudLayout} from './hud-layout.js';",'')
        .replace("import {ObservatoryIntro} from './observatory-intro.js';",'')
        .replace("import {mappingStage, mappingReadout, segmentWaveStrength,\n"+
            "    stagePulseStrength, STAGE_PULSE_SEC}\n"+
            "    from './hud-progress.js';",'')
        .replace("export class ObservatoryHUD","class ObservatoryHUD");
    assert.ok(!/^import /m.test(src),'Unknown HUD imports');
    const HUD=new Function('GLib','mappingStage','mappingReadout',
        'segmentWaveStrength','stagePulseStrength','STAGE_PULSE_SEC',
        src+'\nreturn ObservatoryHUD;')(GLib,pg.mappingStage,
        pg.mappingReadout,pg.segmentWaveStrength,pg.stagePulseStrength,
        pg.STAGE_PULSE_SEC);
    const hud=Object.create(HUD.prototype);
    hud._destroyed=false;
    hud._totalStars=14;
    hud._stageCapacity=8;
    hud._mappedStage=0;
    hud._settled=false;
    hud._pulseFrom=0;
    hud._pulseTo=0;
    hud._pulseStartedAt=0;
    hud._segmentModes=[];
    hud._mappingLabel={value:'',set_text(s){this.value=s;}};
    hud._segments=Array.from({length:8},()=>({
        mode:null,scale:[1,1],opacity:255,
        set_style_class_name(mode){this.mode=mode;},
        set_scale(x,y){this.scale=[x,y];},
    }));
    return hud;
};
for(const path of ['./../gnome50-m8/observatory-hud.js',
                   './greeter-extension/observatory-hud.js']){
    const hud=await initHud(path);
    const makeMask=n=>Uint8Array.from({length:14},(_,i)=>+(i<n));
    const progress=async (n,stage,delta)=>{
        now+=delta;
        hud.setMapping(makeMask(n));
        assert.equal(hud._mappedStage,stage);
    };
    await progress(2,1,0);
    assert.equal(hud._mappingLabel.value,'MAPPING 01 / 08');
    assert.equal(hud._pulseFrom,0);
    assert.equal(hud._pulseTo,1);
    now+=280_000;
    hud.setCompletion({completion:null,settled:false});
    assert.ok(hud._segments[0].scale[0]>1.7,
        'Newly reached stage should show a prominent short pulse');
    assert.deepEqual(hud._segments[1].scale,[1,1]);
    now+=360_000;
    hud.setCompletion({completion:null,settled:false});
    assert.deepEqual(hud._segments[0].scale,[1,1],
        'No permanent HUD transforms or animation after 560ms');
    assert.equal(hud._pulseTo,0);

    await progress(6,3,2_000);
    assert.equal(hud._mappingLabel.value,'MAPPING 03 / 08');
    assert.deepEqual(hud._segments[0].scale,[1,1]);
    now+=280_000;
    hud.setCompletion({completion:null,settled:false});
    assert.ok(hud._segments[1].scale[0]>1.7 &&
        hud._segments[2].scale[0]>1.7,
        'A stage jump highlights each newly reached segment');
    // Backspace: no pulse, and the trailing segments turn off.
    await progress(2,1,1_000);
    assert.equal(hud._pulseTo,0);
    assert.deepEqual(hud._segments[1].scale,[1,1]);
    assert.ok(hud._segments[2].mode.includes('unlit-segment'));
    await progress(14,8,1_000);
    assert.equal(hud._mappingLabel.value,'CONSTELLATION MAPPED');
    hud.setCompletion({completion:.5,settled:false});
    assert.ok(hud._segments.some(segment=>segment.scale[0]>1),
        'Strong existing completion glint remains working');
    hud.setCompletion({completion:null,settled:true});
    assert.ok(hud._segments.every(segment=>
        segment.mode.includes('mapped-segment')));
    await progress(0,0,2_000);
    assert.equal(hud._mappingLabel.value,'AWAITING INPUT');
    assert.ok(hud._segments.every(segment=>
        segment.mode.includes('unlit-segment') &&
        segment.scale[0]===1 && segment.opacity===255));
}
console.log('PASS G1.8/M8.4: numeric eight-stage pulses, jump/backspace, settled completion and reset identical on both screens');
