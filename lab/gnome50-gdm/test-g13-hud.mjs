#!/usr/bin/env node
// G1.3 guarantees the GDM scene HUD uses the exact approved M8.3.2
// visual engine. No greeter auth field, password length or keystrokes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const m8=path=>readFile(new URL('../gnome50-m8/'+path,import.meta.url),'utf8');
const gdm=path=>readFile(new URL('./greeter-extension/'+path,import.meta.url),'utf8');
for(const file of [
  'hud-state.js','hud-progress.js',
  'hud-intro-state.js','observatory-intro.js',
  'stylesheet.css','scene-data.js'
]){
  assert.equal(await gdm(file),await m8(file),'M8 visual-engine drift: '+file);
}
// Only GDM's HUD geometry and recovery-layout switch intentionally differ
// from approved M8.3.2; all cosmetic panels and effects stay unchanged.
const gdmLayout=await gdm('hud-layout.js');
const sessionLayout=await m8('hud-layout.js');
assert.notEqual(gdmLayout,sessionLayout);
assert.ok(gdmLayout.includes('recovery = null'));
assert.ok(gdmLayout.includes('Math.max(78, recovery.y + recovery.height + 12)'));
const gdmHud=await gdm('observatory-hud.js');
assert.ok(gdmHud.includes('setRecoveryLayout(enabled)'));
assert.ok(gdmHud.includes('hudLayout(width, height, recovery)'));
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
const executable=source.replace(/\/\*[\s\S]*?\*\//g,'')
    .replace(/^\s*\/\/.*$/gm,'');
for(const forbidden of [
  '_authPrompt', '_userVerifier', '_passwordEntry', 'get_text()',
  'get_buffer()', 'notify::length', 'key-press-event',
  'get_password', 'prompted', 'getAnswer(', 'PAM',
  'set_child_above_sibling(', 'insert_child_above('
]) assert.ok(!executable.includes(forbidden),'No GDM authentication touching: '+forbidden);
console.log('PASS G1.6A: M8 HUD visual parity with dynamic SHOW LOGIN-safe GDM geometry');
