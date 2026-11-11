#!/usr/bin/env node
// G1.3 guarantees the GDM scene HUD uses the exact approved M8.3.2
// visual engine. No greeter auth field, password length or keystrokes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const m8=path=>readFile(new URL('../gnome50-m8/'+path,import.meta.url),'utf8');
const gdm=path=>readFile(new URL('./greeter-extension/'+path,import.meta.url),'utf8');
for(const file of [
  'hud-state.js','hud-progress.js',
  'hud-intro-state.js','observatory-hud.js','observatory-intro.js',
  'stylesheet.css','scene-data.js'
]){
  assert.equal(await gdm(file),await m8(file),'M8 visual-engine drift: '+file);
}
// The GDM-only hud-layout.js intentionally differs from M8's version:
// native GDM has no top-left SHOW LOGIN recovery button to protect.
const gdmLayout=await gdm('hud-layout.js');
const sessionLayout=await m8('hud-layout.js');
assert.notEqual(gdmLayout,sessionLayout);
assert.ok(gdmLayout.includes('recovery = null'));
assert.ok(gdmLayout.includes('topLeft: {x: pad, y: 14,'));
assert.ok(sessionLayout.includes('recovery = {x: 26, y: 22'));
const source=await gdm('extension.js');
const metadata=JSON.parse(await gdm('metadata.json'));
assert.equal(metadata.uuid,'mellon-greeter@local');
assert.deepEqual(metadata['session-modes'],['gdm']);
assert.ok(source.includes('new ObservatoryHUD(container, hudMetadata(scene))'));
assert.ok(source.includes('container.insert_child_below(hud.actor, dialog)'));
assert.ok(source.includes('container.insert_child_below(photo, dialog)'));
assert.ok(source.includes('hud?.destroy()'));
assert.ok(source.includes('this._hud?.destroy()'));
for(const forbidden of [
  '_authPrompt', '_userVerifier', '_passwordEntry', 'get_text()',
  'get_buffer()', 'notify::length', 'key-press-event',
  'get_password', 'prompted', 'getAnswer(', 'PAM',
  'set_child_above_sibling(', 'insert_child_above('
]) assert.ok(!source.includes(forbidden),'No GDM authentication touching: '+forbidden);
console.log('PASS G1.3: unchanged approved M8 HUD + five-second grid; mounted under native GDM login, no auth code');
