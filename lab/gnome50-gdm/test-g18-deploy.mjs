#!/usr/bin/env node
// Mellon G1.8/M8.4: two independent checksum-verified VM-only rollbacks.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const f=p=>readFile(new URL(p,import.meta.url),'utf8');
const [gs,gi,gr,ms,mi,mr,ge,me,gm,mm,ph,lh,gh]=await Promise.all([
 f('stage-g18-to-vm.sh'),f('install-g18-in-guest.sh'),
 f('rollback-g18-in-guest.sh'),
 f('../gnome50-m8/stage-m84-to-vm.sh'),
 f('../gnome50-m8/install-m84-in-guest.sh'),
 f('../gnome50-m8/rollback-m84-in-guest.sh'),
 f('greeter-extension/extension.js'),
 f('../gnome50-m8/extension.js'),
 f('greeter-extension/metadata.json'),
 f('../gnome50-m8/metadata.json'),
 f('greeter-extension/hud-progress.js'),
 f('../gnome50-m8/hud-progress.js'),
 f('greeter-extension/observatory-hud.js'),
]);
assert.deepEqual(JSON.parse(gm)['shell-version'],['50']);
assert.deepEqual(JSON.parse(gm)['session-modes'],['gdm']);
assert.ok(JSON.parse(gm).name.startsWith('Mellon Greeter G1.8'));
assert.deepEqual(JSON.parse(mm)['shell-version'],['50']);
assert.deepEqual(JSON.parse(mm)['session-modes'],['unlock-dialog']);
assert.ok(JSON.parse(mm).name.startsWith('Mellon M8.4'));
assert.ok(ge.includes('[Mellon Greeter G1.8] enabled in gdm mode'));
assert.ok(me.includes('this._bufferSignalId = buffer.connect('));
assert.ok(!me.includes('this._hud?.cancelIntro();'));
assert.equal(ph,lh,'HUD progress must remain byte-for-byte shared');
assert.ok(ph.includes('STAGE_PULSE_SEC = 0.56'));
assert.ok(gh.includes('mappingReadout('));
assert.ok(gh.includes('stagePulseStrength('));

assert.ok(gs.includes("VM='mellon-gnome50-lab'"));
assert.ok(gs.includes('g18-incoming-001'));
assert.ok(gs.includes('test-g18-hud-runtime.mjs'));
assert.ok(gs.includes('test-g18-deploy.mjs'));
assert.ok(gs.includes('sha256sum -c SHA256SUMS'));
assert.ok(gs.includes('Manifest mismatch against BlackPearl'));
assert.ok(gs.includes('[Mellon Greeter G1.7] enabled in gdm mode'));
assert.ok(gs.includes('Existing G1.8 staging found: checking without replacement.'));
assert.ok(!/^\s*sudo\b/m.test(gs));
for(const name of ['extension.js','metadata.json',
 'observatory-hud.js','hud-progress.js']){
    assert.ok(gs.includes(name),'GDM stage omits '+name);
    assert.ok(gi.includes(name),'GDM installer omits '+name);
}
assert.ok(gi.includes('systemd-detect-virt'));
assert.ok(gi.includes('test "$(id -u)" -eq 0'));
assert.ok(gi.includes('sha256sum -c SHA256SUMS'));
assert.ok(gi.includes('GDM dconf profile changed; refusing'));
assert.ok(gi.includes('[Mellon Greeter G1.7] enabled in gdm mode'));
assert.ok(gi.includes('[Mellon Greeter G1.8] enabled in gdm mode'));
assert.ok(gi.includes('install -Dm 700 -- "$DIR/rollback-g18-in-guest.sh" "$ROLLBACK"'));
assert.ok(gi.includes('mv -T -- "$EXT" "$BACKUP"'));
assert.ok(gi.includes('mv -T -- "$NEXT" "$EXT"'));
assert.ok(gi.includes('.mellon-g18-previous-001'));
assert.ok(gi.includes('G1.7 auto-recovery attempted'));
assert.ok(gr.includes('.mellon-g18-previous-001'));
assert.ok(gr.includes('.mellon-g18-failed-001'));
assert.ok(gr.includes('[Mellon Greeter G1.7] enabled in gdm mode'));
assert.ok(gr.includes('[Mellon Greeter G1.8] enabled in gdm mode'));
assert.ok(gr.includes('mv -T -- "$PREVIOUS" "$ACTIVE"'));

assert.ok(ms.includes("VM='mellon-gnome50-lab'"));
assert.ok(ms.includes('m84-incoming-001'));
assert.ok(ms.includes('MELLON-GDM-PREINSTALL-001'));
assert.ok(ms.includes('sha256sum -c SHA256SUMS'));
assert.ok(ms.includes('test-g18-hud-runtime.mjs'));
assert.ok(!/^\s*sudo\b/m.test(ms));
assert.ok(mi.includes("test \"$(id -un)\" = test1"));
assert.ok(mi.includes('test "$(systemd-detect-virt)" != none'));
assert.ok(mi.includes('sha256sum -c SHA256SUMS'));
assert.ok(mi.includes("assert before['name'].startswith('Mellon M8.3.2')"));
assert.ok(mi.includes("assert after['name'].startswith('Mellon M8.4')"));
assert.ok(mi.includes('mv -T -- "$EXT" "$BACKUP"'));
assert.ok(mi.includes('mv -T -- "$NEXT" "$EXT"'));
assert.ok(mi.includes('.mellon-m84-previous-001'));
assert.ok(mi.includes('M8.3.2 lock-screen restore attempted'));
assert.ok(mr.includes('.mellon-m84-previous-001'));
assert.ok(mr.includes('.mellon-m84-failed-001'));
assert.ok(mr.includes('mv -T -- "$PREVIOUS" "$ACTIVE"'));
for(const source of [gs,gi,gr,ms,mi,mr]) {
    for(const forbidden of [
        'dconf update','gsettings set','systemctl restart',
        'virsh -c qemu:///system reboot','mellon-lab@local@host',
        'node --input-type=module --check < "$DIR"',
    ]) assert.ok(!source.includes(forbidden),'VM-only guard: '+forbidden);
}
console.log('PASS G1.8/M8.4: separate staged builds, native auth untouched, 2 full independent VM rollbacks');
