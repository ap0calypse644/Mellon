#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const [m8,m7,hud,layout,state,css,m8Effects,m7Effects,m8Scene,m7Scene,
    m8Tracker,m7Tracker]=await Promise.all([
    read('./extension.js'),read('../gnome50-m7/extension.js'),
    read('./observatory-hud.js'),read('./hud-layout.js'),
    read('./hud-state.js'),read('./stylesheet.css'),
    read('./stellar-effects.js'),read('../gnome50-m7/stellar-effects.js'),
    read('./scene-data.js'),read('../gnome50-m7/scene-data.js'),
    read('./failure-tracker.js'),read('../gnome50-m7/failure-tracker.js'),
]);
for(const [name,a,b] of [['stellar effects',m8Effects,m7Effects],
    ['scene data',m8Scene,m7Scene], ['failure tracker',m8Tracker,m7Tracker]]) {
    assert.equal(a,b,`M8 must not modify M7.1 ${name}`);
}
function block(src,start,end) {
    const i=src.indexOf(start),j=src.indexOf(end,i+start.length);
    assert.ok(i>=0 && j>i);
    return src.slice(i,j);
}
for(const [start,end] of [
    ['    setLength(length) {','    onFailed() {'],
    ['    onFailed() {','    _startFrames() {'],
    ['    _startFrames() {','    _paint(cr, width, height) {'],
    ['    _paint(cr, width, height) {','    destroy() {'],
]) {
    assert.equal(block(m8,start,end),block(m7,start,end),
        'M7.1 photo illumination/auth-failure behavior must be byte-identical');
}
for(const fragment of [
    `label: 'SHOW LOGIN'`, `text: 'UNAUTHORIZED ACCESS'`,
    `buffer.connect('notify::length'`,
    `this._failureTracker.observe(prompt._userVerifier)`,
    `Main.sessionMode.currentMode !== 'unlock-dialog'`,
    `this._dialog?._authPrompt?._passwordEntry?.grab_key_focus()`,
    `this._hud = new ObservatoryHUD(dialog, hudMetadata(scene))`,
    `dialog.insert_child_above(this._hud.actor, this._recovery)`,
    `dialog.insert_child_above(this._feedback, this._hud.actor)`,
    `this._hud?.hide();`, `this._hud?.destroy();`,
]) assert.ok(m8.includes(fragment),`Missing auth/HUD invariant: ${fragment}`);
for(const forbidden of [
    'key-press-event','key-release-event','get_text()','get_password',
    'set_password','PAM','cr.arc(','ACCESS GRANTED',
]) assert.ok(!m8.includes(forbidden),`Forbidden M8 input/auth behavior: ${forbidden}`);
for(const text of [hud,layout,state]) {
    for(const forbidden of ['get_buffer','notify::length','_failCounter',
        'key-press-event','_userVerifier','get_password','get_text()'])
        assert.ok(!text.includes(forbidden),
            'Presentation layer must not access GNOME authentication');
}
assert.ok(hud.includes('reactive: false'));
assert.ok(hud.includes('allocation-changed'));
assert.ok(hud.includes('GLib.timeout_add_seconds('));
assert.ok(hud.includes('this._stopClock()'));
assert.ok(css.includes('.mellon-m8-panel'));
console.log('PASS M8.1: unchanged M7 visual/auth state, HUD layering, SHOW LOGIN and alert priority, teardown and input isolation');
