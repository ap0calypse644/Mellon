#!/usr/bin/env node
// G1.7 — first-frame astronomical GDM curtain + bounded native fallback.
// Regression: old G1.6B roster checks exposed the Ubuntu logo until load.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const f=p=>readFile(new URL('./'+p,import.meta.url),'utf8');
const [stage,install,rollback,entry,chooser,metadata,oldStage]=
    await Promise.all([
        f('stage-g17-to-vm.sh'),
        f('install-g17-in-guest.sh'),
        f('rollback-g17-in-guest.sh'),
        f('greeter-extension/extension.js'),
        f('greeter-extension/greeter-account-chooser.js'),
        f('greeter-extension/metadata.json'),
        f('stage-g16b-to-vm.sh'),
    ]);
const meta=JSON.parse(metadata);
assert.equal(meta.uuid,'mellon-greeter@local');
assert.deepEqual(meta['shell-version'],['50']);
assert.deepEqual(meta['session-modes'],['gdm']);
assert.ok(stage.includes("VM='mellon-gnome50-lab'"));
assert.ok(stage.includes("g17-incoming-001"));
assert.ok(stage.includes('MELLON-GDM-PREINSTALL-001'));
assert.ok(stage.includes('test-g16b-chooser.mjs'));
assert.ok(stage.includes('test-g17-deploy.mjs'));
assert.ok(stage.includes('Existing G1.7 staging found: checking without replacement.'));
assert.ok(stage.includes('sha256sum -c SHA256SUMS'));
assert.ok(stage.includes('Manifest mismatch against BlackPearl'));
assert.ok(stage.includes('[Mellon Greeter G1.6B] enabled in gdm mode'));
assert.ok(!/^\s*sudo\b/m.test(stage));
const files=['extension.js','metadata.json','greeter-account-chooser.js'];
for(const file of files){
    assert.ok(stage.includes(file),'Missing staged source: '+file);
    assert.ok(install.includes(file),'Missing installed source: '+file);
}
assert.ok(install.includes('systemd-detect-virt'));
assert.ok(install.includes("test \"$(id -u test1)\" -eq 1000"));
assert.ok(install.includes('sha256sum -c SHA256SUMS'));
assert.ok(install.includes('GDM dconf profile changed; refusing'));
assert.ok(install.includes(
    "grep -Fq '[Mellon Greeter G1.6B] enabled in gdm mode' \"$EXT/extension.js\""));
assert.ok(install.includes('install -Dm 700 -- "$DIR/rollback-g17-in-guest.sh" "$ROLLBACK"'));
assert.ok(install.includes('mv -T -- "$EXT" "$BACKUP"'));
assert.ok(install.includes('mv -T -- "$NEXT" "$EXT"'));
assert.ok(install.includes('.mellon-g17-previous-001'));
assert.ok(install.includes('G1.6B auto-recovery attempted'));
assert.ok(install.includes('STARTUP_MAX_TICKS = 32'));
assert.ok(install.includes('mayBeLoadingRoster('));
assert.ok(install.includes('ESTABLISHING UPLINK'));
assert.ok(install.includes('GREETER_MAX_REBIND_TICKS = 120'));
assert.ok(install.includes('Math.max(78, recovery.y + recovery.height + 12)'));
assert.ok(!install.includes('topLeft: {x: pad, y: 14,'));
assert.ok(rollback.includes('.mellon-g17-previous-001'));
assert.ok(rollback.includes('.mellon-g17-failed-001'));
assert.ok(rollback.includes('[Mellon Greeter G1.6B] enabled in gdm mode'));
assert.ok(rollback.includes('[Mellon Greeter G1.7] enabled in gdm mode'));
assert.ok(rollback.includes('Math.max(78, recovery.y + recovery.height + 12)'),
    'Rollback MUST check G1.6B actual dynamic HUD layout, not old static layout');
assert.ok(!rollback.includes('topLeft: {x: pad, y: 14,'));
assert.ok(rollback.includes('mv -T -- "$PREVIOUS" "$ACTIVE"'));
assert.ok(entry.includes('[Mellon Greeter G1.7] enabled in gdm mode'));
assert.ok(entry.includes('this._accounts?.sync()'));
assert.ok(entry.includes('this._accounts?.revealNative()'),
    'Unhealthy observer must also release any startup curtain');
assert.ok(entry.includes('this._cover?.revealNative()'));
assert.ok(chooser.includes('STARTUP_MAX_TICKS = 32'));
assert.ok(chooser.includes('mayBeLoadingRoster(dialog, container)'));
assert.ok(chooser.includes("this._show(null, 'startup', true)"));
assert.ok(chooser.includes('this.revealNative()'));
assert.ok(chooser.includes('ESTABLISHING UPLINK'));
assert.ok(chooser.includes("label: 'SHOW LOGIN'"));
assert.ok(chooser.includes("item.emit('activate')"));
assert.ok(chooser.includes('this._autoAttempted = true'));
assert.ok(chooser.includes('this._startupTicks <= STARTUP_MAX_TICKS'));
assert.ok(chooser.includes('typeof panel.ease'));
assert.ok(oldStage.includes('G1.6B stage retired: use the G1.7 package.'));
const executable=chooser.replace(/\/\*[\s\S]*?\*\//g,'')
    .replace(/^\s*\/\/.*$/gm,'');
for(const forbidden of ['get_text(','getAnswer(','get_buffer(',
    '_userVerifier', '_passwordEntry.get_text(',
    'PAM', 'set_text(', 'systemctl restart']){
    assert.ok(!executable.includes(forbidden),
        'Visual-only startup must never access credentials: '+forbidden);
}
assert.ok(!executable.includes('GLib.timeout_add'),
    'G1.7 must reuse G1.6B polling, never add independent timers');
for(const script of [stage,install,rollback]){
    for(const bad of ['dconf update','gsettings set','systemctl restart',
        'virsh -c qemu:///system reboot','mellon-lab@local',
        'node --input-type=module --check < "$DIR"']){
        assert.ok(!script.includes(bad),'VM-only install guard: '+bad);
    }
}
console.log('PASS G1.7: early user-loading cover, 8s native escape, zero new timers, G1.6B snapshot and tested dynamic-layout rollback');
