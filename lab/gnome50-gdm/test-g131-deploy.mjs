#!/usr/bin/env node
// Host-only static regression for the GDM-only G1.3.1 update procedure.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=n=>readFile(new URL('./'+n,import.meta.url),'utf8');
const [stage,installer,rollback,layout]=await Promise.all([
    read('stage-g131-to-vm.sh'),
    read('install-g131-in-guest.sh'),
    read('rollback-g131-in-guest.sh'),
    read('greeter-extension/hud-layout.js')
]);
assert.ok(stage.includes("VM='mellon-gnome50-lab'"));
assert.ok(stage.includes("g131-incoming-001"));
assert.ok(stage.includes('test-g131-layout.mjs'));
assert.ok(stage.includes('test-g13-hud.mjs'));
assert.ok(stage.includes('node --input-type=module --check < "$SRC"'));
assert.ok(stage.includes("sha256sum -c SHA256SUMS"));
assert.ok(stage.includes('Source manifest differs from BlackPearl'));
assert.ok(stage.includes('Prior G1.3.1 staging exists; verifying without overwriting.'));
assert.ok(!/^\s*sudo\b/m.test(stage));
assert.ok(installer.includes("test \"$(id -u)\" -eq 0"));
assert.ok(installer.includes('systemd-detect-virt'));
assert.ok(installer.includes("test \"$(id -u test1)\" -eq 1000"));
assert.ok(installer.includes('sha256sum -c SHA256SUMS'));
assert.ok(installer.includes('Unexpected GDM dconf profile') ||
    installer.includes('GDM dconf profile was modified'));
assert.ok(installer.includes("grep -Fq '[Mellon Greeter G1.3] enabled in gdm mode'"));
assert.ok(installer.includes('install -m 600 "$EXT/hud-layout.js" "$OLD/hud-layout.js"'));
assert.ok(installer.includes('install -Dm 700 "$DIR/rollback-g131-in-guest.sh" "$RECOVERY"'));
assert.ok(installer.includes('mv -T -- "$TEMP" "$EXT/hud-layout.js"'));
assert.ok(installer.includes('Only hud-layout.js replaced'));
assert.ok(rollback.includes('topLeft: {x: pad, y: 14,'));
assert.ok(rollback.includes('mv -T -- "$TEMP" "$CURRENT"'));
assert.ok(rollback.includes('restored previous G1.3 HUD layout'));
assert.ok(layout.includes('recovery = null'));
assert.ok(layout.includes('topLeft: {x: pad, y: 14,'));
for(const s of [stage,installer,rollback]){
    for(const forbidden of [
        'dconf update', 'gsettings set', 'systemctl restart',
        'virsh -c qemu:///system reboot','mellon-lab@local',
        'node --input-type=module --check < "$DIR', 'node --input-type=module --check < "$OLD'
    ]){
        assert.ok(!s.includes(forbidden),'Unexpected guest-side mutation: '+forbidden);
    }
}
console.log('PASS G1.3.1 deployment: isolated VM, source hash verification, atomic HUD update, rollback, GDM auth untouched');
