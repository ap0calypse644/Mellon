#!/usr/bin/env node
// Structural regression guard: M7 must leave working M6.4 auth intact.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const [m7,m6,effects,tracker,metadata]=await Promise.all([
    read('./extension.js'),
    read('../gnome50-m6/extension.js'),
    read('./stellar-effects.js'),
    read('./failure-tracker.js'),
    read('./metadata.json'),
]);

for(const fragment of [
    `text: 'UNAUTHORIZED ACCESS'`,
    `label: 'SHOW LOGIN'`,
    `this._dialog?._authPrompt?._passwordEntry?.grab_key_focus()`,
    `buffer.connect('notify::length'`,
    `this._view?.onFailed()`,
    `Main.sessionMode.currentMode !== 'unlock-dialog'`,
    `this._failureTracker.observe(prompt._userVerifier)`,
    `const desired = activationCount(length, this._energy.length, this._stages)`,
    `this._active = updateActiveStars(this._active, desired)`,
    `for (const [a, b] of activeEdges(this._scene.edges, this._active))`,
]) {
    assert.ok(m7.includes(fragment),`M7 lost M6.4 invariant: ${fragment}`);
    assert.ok(m6.includes(fragment),`Expected M6.4 invariant no longer exists: ${fragment}`);
}
for(const forbidden of [
    `key-press-event`, `key-release-event`, `get_text()`,
    `get_password`, `set_password`, `PAM`,
    `this._failures >= 2`, `cr.arc(`,
]) {
    assert.ok(!m7.includes(forbidden),`M7 must not handle native input or paint artificial star nodes: ${forbidden}`);
}
assert.ok(!effects.includes('gi://'),'Effects module must be pure JavaScript');
assert.equal(tracker,await read('../gnome50-m6/failure-tracker.js'),
    'Must reuse the fully tested M6.4 authentication failure observer');
const meta=JSON.parse(metadata);
assert.equal(meta.uuid,'mellon-lab@local');
assert.deepEqual(meta['session-modes'],['unlock-dialog']);
console.log('PASS M7: GNOME-native authentication, private buffer observer, manual recovery and source-star geometry preserved');
