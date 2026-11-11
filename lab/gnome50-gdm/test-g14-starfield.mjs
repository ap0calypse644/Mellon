#!/usr/bin/env node
// Validate G1.4 photo-source parity and static GNOME greeter isolation.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const m8=path=>readFile(new URL('../gnome50-m8/'+path,import.meta.url),'utf8');
const gdm=path=>readFile(new URL('./greeter-extension/'+path,import.meta.url),'utf8');
assert.equal(await gdm('stellar-effects.js'),await m8('stellar-effects.js'));
assert.equal(await gdm('scene-data.js'),await m8('scene-data.js'));
const star=await gdm('greeter-starfield.js');
assert.ok(star.includes('reactive: false, can_focus: false'));
assert.ok(star.includes('new Clutter.FixedLayout()'));
assert.ok(star.includes('new Clutter.BindConstraint('));
assert.ok(star.includes('StellarEffects('));
assert.ok(star.includes('new Uint8Array(this._count)'));
assert.ok(star.includes('updateActiveStars('));
assert.ok(star.includes('activeEdges('));
assert.ok(star.includes('coverTransform('));
assert.ok(star.includes('completionWave('));
assert.ok(star.includes('completionLevel('));
assert.ok(star.includes('starLightProfile('));
assert.ok(star.includes('connectionLightProfile('));
assert.ok(star.includes("source: parent, coordinate: Clutter.BindCoordinate.SIZE"));
assert.ok(star.includes('this._fx?.reset()'));
assert.ok(star.includes('GLib.source_remove(this._timer)'));
assert.ok(star.includes('this.actor?.destroy()'));
assert.ok(star.includes('FRAME_MS = 62'));
const extra=await gdm('greeter-length-observer.js');
assert.ok(extra.includes("prompt._entry !== prompt._passwordEntry"));
assert.ok(extra.includes("buffer.connect('notify::length'"));
assert.ok(extra.includes('buffer.get_length()'));
assert.ok(extra.includes('this._onLength(amount)'));
assert.ok(extra.includes('this._onLength(0)'));
const activeGDM=await gdm('extension.js');
assert.ok(activeGDM.includes("from './greeter-starfield.js'"));
assert.ok(activeGDM.includes("from './greeter-length-observer.js'"));
assert.ok(activeGDM.includes('new GreeterStarfield('));
assert.ok(activeGDM.includes('new GreeterLengthObserver('));
assert.ok(activeGDM.includes('GREETER_LENGTH_SYNC_MS = 250'));
for(const source of [star,extra]){
    for(const forbidden of [
        'get_text()', 'get_text(', 'getAnswer(', 'get_password(',
        'PAM', '._userVerifier', 'key-press-event', 'passwordEntry.text',
        'clutter_text.get_text', 'Main.screenShield',
        'console.log(', 'console.warn('
    ]) assert.ok(!source.includes(forbidden),
        'G1.4 modules must not read auth data: '+forbidden);
}
console.log('PASS G1.4: source-only photo-derived stars, M8 effects parity, no GDM auth data, G1.4 integration limited to visual adapters');
