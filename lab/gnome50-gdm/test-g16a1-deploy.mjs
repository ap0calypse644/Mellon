#!/usr/bin/env node
// G1.6A.1 regression: never check OLD HUD geometry in NEW extension.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const f=p=>readFile(new URL('./'+p,import.meta.url),'utf8');
const [stage,install,rollback,entry,meta,layout,intro,cover]=
    await Promise.all([
    f('stage-g16a1-to-vm.sh'),f('install-g16a1-in-guest.sh'),
    f('rollback-g16a1-in-guest.sh'),f('greeter-extension/extension.js'),
    f('greeter-extension/metadata.json'),f('greeter-extension/hud-layout.js'),
    f('greeter-extension/observatory-intro.js'),
    f('greeter-extension/greeter-password-cover.js')]);
const files=['extension.js','metadata.json','greeter-password-cover.js',
    'observatory-intro.js','observatory-hud.js','hud-layout.js',
    'failure-tracker.js'];
for (const file of files){
    assert.ok(stage.includes(file),'Missing staged file: '+file);
    assert.ok(install.includes(file),'Missing installed file: '+file);
}
assert.ok(stage.includes("VM='mellon-gnome50-lab'"));
assert.ok(stage.includes('g16a1-incoming-001'));
assert.ok(stage.includes('test-g16a-scan.mjs'));
assert.ok(stage.includes('test-g16a-cover.mjs'));
assert.ok(stage.includes('test-g16a1-deploy.mjs'));
assert.ok(stage.includes('Existing G1.6A.1 staging found: checking without replacement.'));
assert.ok(stage.includes('test -f "$CHECKPOINT/SHA256SUMS"'));
assert.ok(stage.includes('sha256sum -c SHA256SUMS'));
assert.ok(stage.includes('Manifest mismatch against BlackPearl'));
assert.ok(!/^\s*sudo\b/m.test(stage));
assert.ok(stage.includes('[Mellon Greeter G1.5] enabled in gdm mode'));
assert.ok(!stage.includes('test -f /usr/local/sbin/mellon-greeter-g16a-rollback'));
assert.ok(install.includes('systemd-detect-virt'));
assert.ok(install.includes('sha256sum -c SHA256SUMS'));
assert.ok(install.includes('GDM dconf profile changed; refusing'));
assert.ok(install.includes("grep -Fq '[Mellon Greeter G1.5] enabled in gdm mode' \"$EXT/extension.js\""));
assert.ok(install.includes('install -Dm 700 -- "$DIR/rollback-g16a1-in-guest.sh" "$ROLLBACK"'));
assert.ok(install.includes('mv -T -- "$EXT" "$BACKUP"'));
assert.ok(install.includes('mv -T -- "$NEXT" "$EXT"'));
assert.ok(install.includes('.mellon-g16a1-previous-001'));
assert.ok(install.includes('G1.5 auto-recovery attempted'));
assert.ok(install.includes("grep -Fq '[Mellon Greeter G1.6A.1] enabled in gdm mode'"));
assert.ok(intro.includes('this._everStarted = true'));
assert.ok(intro.includes('this._finishSweep(false)'));
assert.ok(!intro.includes('this.stop(); // No distorted grid'));
assert.ok(!cover.includes('this._hud.cancelIntro();'));
assert.ok(cover.includes("label: 'SHOW LOGIN'"));
assert.ok(cover.includes("text: 'UNAUTHORIZED ACCESS'"));
assert.ok(layout.includes('Math.max(78, recovery.y + recovery.height + 12)'));
// This was the exact G1.6A installer defect (guard rejected its own new HUD).
const newGuard=`grep -Fq 'Math.max(78, recovery.y + recovery.height + 12)' "$NEXT/hud-layout.js"`;
const brokenGuard=`grep -Fq 'topLeft: {x: pad, y: 14,' "$NEXT/hud-layout.js"`;
assert.ok(install.includes(newGuard),'NEW HUD guard missing in assembled tree');
assert.ok(!install.includes(brokenGuard),'Cannot check old HUD in new tree');
assert.ok(install.includes(`grep -Fq 'topLeft: {x: pad, y: 14,' "$EXT/hud-layout.js"`),
    'OLD G1.5 installation guard must remain');
assert.ok(entry.includes('[Mellon Greeter G1.7] enabled in gdm mode'));
assert.ok(stage.includes('test-g16a1-deploy.mjs'));
const metadata=JSON.parse(meta);
assert.equal(metadata.uuid,'mellon-greeter@local');
assert.deepEqual(metadata['session-modes'],['gdm']);
assert.deepEqual(metadata['shell-version'],['50']);
assert.ok(rollback.includes('[Mellon Greeter G1.5] enabled in gdm mode'));
assert.ok(rollback.includes('[Mellon Greeter G1.6A.1] enabled in gdm mode'));
assert.ok(rollback.includes('.mellon-g16a1-previous-001'));
assert.ok(rollback.includes('.mellon-g16a1-failed-001'));
assert.ok(rollback.includes('mv -T -- "$PREVIOUS" "$ACTIVE"'));
for(const src of [stage,install,rollback]){
    for(const prohibited of ['dconf update','gsettings set','systemctl restart',
        'virsh -c qemu:///system reboot','mellon-lab@local']){
        assert.ok(!src.includes(prohibited),'VM-only guard: '+prohibited);
    }
}
console.log('PASS G1.6A.1: fixed assembled HUD check, 7 source files, G1.5 rollback, VM-only staging');
