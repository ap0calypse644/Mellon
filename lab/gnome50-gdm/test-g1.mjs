#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const from = name => readFile(new URL('./'+name,import.meta.url),'utf8');
const [source,metadata,scene,lock] = await Promise.all([
    from('greeter-extension/extension.js'),
    from('greeter-extension/metadata.json'),
    from('greeter-extension/scene-data.js'),
    readFile(new URL('../gnome50-m8/extension.js',import.meta.url),'utf8'),
]);
const m=JSON.parse(metadata);
assert.equal(m.uuid,'mellon-greeter@local');
assert.deepEqual(m['session-modes'],['gdm']);
assert.deepEqual(m['shell-version'],['50']);
assert.ok(source.includes("Main.sessionMode.currentMode !== 'gdm'"));
assert.ok(source.includes('Main.screenShield?._lockDialogGroup'));
assert.ok(source.includes('dialog.get_parent() !== container'));
assert.ok(!source.includes('dialog?._backgroundGroup'));
assert.ok(source.includes('container.insert_child_below(photo, dialog)'));
assert.ok(source.includes('source: container, coordinate: Clutter.BindCoordinate.SIZE'));
assert.ok(source.includes('reactive: false, can_focus: false'));
assert.ok(source.includes('Clutter.BindCoordinate.SIZE'));
assert.ok(source.includes('photo?.destroy()'));
assert.ok(source.includes('this._background?.destroy()'));
assert.ok(source.includes('GLib.source_remove(this._pollId)'));
assert.ok(source.includes('GREETER_MAX_ATTEMPTS = 90'));
assert.ok(source.includes('GLib.timeout_add('));
assert.ok(source.includes("pickScene(this._library, {mode: 'random-on-lock'})"));
for(const forbidden of [
    '_authPrompt', '_passwordEntry', 'get_buffer', 'get_text()',
    'get_password', 'notify::length', 'key-press-event',
    '_userVerifier', 'PAM', 'insert_child_above(', 'set_child_above_sibling',
    'gnome-extensions enable', 'getenv(', '/home/test1',
]) assert.ok(!source.includes(forbidden),'GDM visual-only restriction: '+forbidden);
// The curated library validation must be byte-identical to the accepted
// M8 source. This also prevents introducing a new scene selection backend.
assert.equal(scene,await readFile(
    new URL('../gnome50-m8/scene-data.js',import.meta.url),'utf8'));
// The existing user lock extension is a separate module and need not be
// adapted to accept the gdm mode.
assert.ok(lock.includes("Main.sessionMode.currentMode !== 'unlock-dialog'"));
console.log('PASS G1.2.1: GDM-only extension, photo sibling below native LoginDialog, no authentication interception, bounded cleanup');
