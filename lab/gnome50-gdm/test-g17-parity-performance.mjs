#!/usr/bin/env node
// G1.7/M8.3.2 source parity and idle-work audit; no GNOME is started.
// Visual effects must stay byte-identical while the two authentication
// containers preserve their intentionally different GNOME lifecycle.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const same=[
  'scene-data.js','stellar-effects.js','failure-tracker.js',
  'hud-state.js','hud-progress.js','hud-intro-state.js',
];
for (const path of same) {
  const [lock,gdm]=await Promise.all([
    read('gnome50-m8/'+path),
    read('gnome50-gdm/greeter-extension/'+path),
  ]);
  assert.equal(lock,gdm,'M8 and GDM engine drift: '+path);
}
const [lock,gdm,lockIntro,gdmIntro,lockHud,gdmHud,gdmStars,gdmCover,
  gdmChooser,lockLayout,gdmLayout,lockCss,gdmCss]=await Promise.all([
  read('gnome50-m8/extension.js'),
  read('gnome50-gdm/greeter-extension/extension.js'),
  read('gnome50-m8/observatory-intro.js'),
  read('gnome50-gdm/greeter-extension/observatory-intro.js'),
  read('gnome50-m8/observatory-hud.js'),
  read('gnome50-gdm/greeter-extension/observatory-hud.js'),
  read('gnome50-gdm/greeter-extension/greeter-starfield.js'),
  read('gnome50-gdm/greeter-extension/greeter-password-cover.js'),
  read('gnome50-gdm/greeter-extension/greeter-account-chooser.js'),
  read('gnome50-m8/hud-layout.js'),
  read('gnome50-gdm/greeter-extension/hud-layout.js'),
  read('gnome50-m8/stylesheet.css'),
  read('gnome50-gdm/greeter-extension/stylesheet.css'),
]);
assert.ok(gdmCss.startsWith(lockCss),
  'GDM original M8 styles drifted: GDM may only add account styles');
for (const src of [lockIntro,gdmIntro]) {
  assert.ok(src.includes('INTRO_TICK_MS'));
  assert.ok(src.includes('INTRO_REPEAT_MS'));
  assert.ok(src.includes('this._repeatTimerId = GLib.timeout_add('));
  assert.ok(src.includes('this._finishSweep(false)'));
  assert.ok(src.includes('GLib.source_remove(this._repeatTimerId)'));
  assert.ok(src.includes('this._grid?.destroy()'));
}
assert.ok(gdmIntro.includes('this._everStarted = true'),
  'GDM resize must not permanently disable 5-second scans');
assert.ok(!gdmIntro.includes('this.stop(); // No distorted grid'));
assert.ok(gdmLayout.includes('recovery = null'),
  'GDM must preserve four-panel native account selection');
assert.ok(gdmLayout.includes(
  'Math.max(78, recovery.y + recovery.height + 12)'));
assert.ok(lockLayout.includes(
  'recovery = {x: 26, y: 22, width: 145, height: 46}'));
assert.ok(gdmHud.includes('setRecoveryLayout(enabled)'));
assert.ok(gdmHud.includes('hudLayout(width, height, recovery)'));
assert.ok(lockHud.includes('this._intro?.destroy()'));
assert.ok(gdmHud.includes('this._intro?.destroy()'));
for (const src of [lock,gdmStars]) {
  assert.ok(src.includes('FRAME_MS = 62'),
    'Constellation frame cadence must match');
  assert.ok(src.includes('return GLib.SOURCE_REMOVE'),
    'Animated sprite timer must stop after the effect settles');
  assert.ok(src.includes('queue_repaint()'),
    'Constellation redraw must remain event/frame driven');
}
assert.ok(lock.includes('const POLL_MS = 250;'));
assert.ok(gdm.includes('const GREETER_LENGTH_SYNC_MS = 250;'));
assert.ok(gdm.includes('const GREETER_MAX_REBIND_TICKS = 120;'));
assert.ok(gdm.includes('const GREETER_MAX_ATTEMPTS = 90;'));
assert.ok(gdm.includes('this._accounts?.destroy()'));
assert.ok(gdm.includes('this._cover?.destroy()'));
assert.ok(gdm.includes('this._observer?.destroy()'));
assert.ok(gdm.includes('this._starfield?.destroy()'));
assert.ok(gdm.includes('this._hud?.destroy()'));
assert.ok(gdmHud.includes('GLib.timeout_add_seconds('));
assert.ok(gdmHud.includes('GLib.source_remove(this._clockTimer)'));
assert.ok(gdmCover.includes('GLib.source_remove(this._deniedTimer)'));
assert.ok(gdmCover.includes('this._stopFeedback()'));
assert.ok(gdmChooser.includes('STARTUP_MAX_TICKS = 32'));
assert.ok(!gdmChooser.includes('GLib.timeout_add('),
  'Account chooser must reuse existing GDM observer tick');
// A single persistent 250ms lifecycle poll and one 5s scan-wakeup
// are expected. No active-frame timer may run endlessly while settled.
// This is a source-level budget; CPU/RAM must still be profiled in VM.
assert.ok(gdmStars.includes('if (!busy)'));
assert.ok(gdmStars.includes('this._timer = 0;'));
assert.ok(gdmIntro.includes('INTRO_REPEAT_MS, () =>'));
assert.ok(gdmHud.includes('GLib.PRIORITY_DEFAULT, 60, () =>'));

// Concrete lock-screen memory retention: each password buffer signal
// must disconnect as soon as GNOME swaps it or the lock is dismantled.
assert.ok(lock.includes('this._bufferSignalId = buffer.connect('));
const start=lock.indexOf('    _invalidateSignals() {');
const end=lock.indexOf('    _unmount() {',start);
assert.ok(start>=0&&end>start);
const method=lock.slice(start,end);
const Probe=new Function('return class Probe {\n'+method+'\n}')();
const events=[];
const first=new Probe();
first._epoch=8;
first._prompt={};
first._bufferSignalId=51;
first._buffer={disconnect:id=>events.push(id)};
first._invalidateSignals();
assert.deepEqual(events,[51],'Must disconnect replaced password buffer');
assert.equal(first._epoch,9,'Must invalidate stale observer epoch');
assert.equal(first._bufferSignalId,0);
assert.equal(first._buffer,null);
assert.equal(first._prompt,null);
first._invalidateSignals();
assert.deepEqual(events,[51],'Teardown is idempotent');
assert.equal(first._epoch,10);
const disposed=new Probe();
disposed._epoch=0;
disposed._bufferSignalId=42;
disposed._buffer={disconnect(){throw new Error('GObject disposed');}};
disposed._prompt={};
assert.doesNotThrow(()=>disposed._invalidateSignals(),
  'Disposed GNOME buffers must not crash the shell');
assert.equal(disposed._buffer,null);
assert.equal(disposed._bufferSignalId,0);
console.log('PASS Mellon parity: 6 identical core engines, matching 62ms stars / 5s grid, bounded GDM timers, no idle sprite spin');
console.log('PASS M8 observer teardown: disconnected buffer, epoch invalidation, idempotent and disposed-GObject-safe');
