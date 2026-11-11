#!/usr/bin/env node
// G1.3 safe VM-only deployment policy. Pure file inspection, no guest ops.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const file=name=>readFile(new URL('./'+name,import.meta.url),'utf8');
const [stage,install,rollback,extension,hud,metaText]=await Promise.all([
    file('stage-g13-to-vm.sh'),
    file('install-g13-in-guest.sh'),
    file('rollback-g13-in-guest.sh'),
    file('greeter-extension/extension.js'),
    file('greeter-extension/observatory-hud.js'),
    file('greeter-extension/metadata.json'),
]);
const meta=JSON.parse(metaText);
assert.equal(meta.uuid,'mellon-greeter@local');
assert.deepEqual(meta['session-modes'],['gdm']);
assert.deepEqual(meta['shell-version'],['50']);

assert.ok(stage.includes("VM='mellon-gnome50-lab'"));
assert.ok(stage.includes("g13-incoming-001"));
assert.ok(stage.includes('node --input-type=module --check < "$SRC/$file"'));
assert.ok(stage.includes('node "$HERE/test-g13-hud.mjs"'));
assert.ok(stage.includes('sha256sum -c SHA256SUMS'));
assert.ok(stage.includes('Host and VM manifest hashes differ'));
assert.ok(stage.includes('Existing G1.3 staging detected; verifying in place.'));
assert.ok(!stage.includes('node --input-type=module --check < extension.js'));
assert.ok(!/^\s*sudo\b/m.test(stage), 'Host stage must not use sudo');

assert.ok(install.includes("test \"$(id -u)\" -eq 0"));
assert.ok(install.includes('systemd-detect-virt'));
assert.ok(install.includes("g13-incoming-001"));
assert.ok(install.includes('.mellon-g13-previous-001'));
assert.ok(install.includes('sha256sum -c SHA256SUMS'));
assert.ok(install.includes("grep -Fq '[Mellon Greeter G1.2.1] enabled in gdm mode'"));
assert.ok(install.includes('install -Dm 700 -- "$DIR/rollback-g13-in-guest.sh" "$ROLLBACK"'));
assert.ok(install.includes('mv -T -- "$EXT" "$OLD"'));
assert.ok(install.includes('mv -T -- "$NEXT" "$EXT"'));
assert.ok(install.includes('chmod 755 "$EXT"'));
assert.ok(install.includes('Attempted automatic recovery of G1.2.1'));
assert.ok(install.includes('No GDM settings or user extension changed.') ||
    install.includes('system dconf and M8.3.2 lock screen untouched.'));
assert.ok(!install.includes('node --input-type'));
assert.ok(!rollback.includes('node --input-type'));

assert.ok(rollback.includes('.mellon-g13-previous-001'));
assert.ok(rollback.includes('.mellon-g13-failed-001'));
assert.ok(rollback.includes("grep -Fq '[Mellon Greeter G1.3] enabled in gdm mode'"));
assert.ok(rollback.includes("grep -Fq '[Mellon Greeter G1.2.1] enabled in gdm mode'"));
assert.ok(rollback.includes('mv -T -- "$OLD" "$EXT"'));
assert.ok(rollback.includes('chmod 755 "$EXT"'));

assert.ok(extension.includes('new ObservatoryHUD(container, hudMetadata(scene))'));
assert.ok(extension.includes('container.insert_child_below(hud.actor, dialog)'));
assert.ok(extension.includes('container.insert_child_below(photo, dialog)'));
assert.ok(extension.includes('hud?.destroy()'));
assert.ok(extension.includes('this._hud?.destroy()'));
assert.ok(hud.includes("import {ObservatoryIntro} from './observatory-intro.js'"));

for(const value of [stage,install,rollback]){
    for(const forbidden of [
        'dconf update','gsettings set', 'systemctl restart',
        'virsh -c qemu:///system reboot','/home/ap0calypse/.local/share/gnome-shell',
        'mellon-lab@local'
    ]){
        assert.ok(!value.includes(forbidden),
            'Guest and host OS separation restriction: '+forbidden);
    }
}
console.log('PASS G1.3 installer: VM gate, full G1.2.1 backup, checked 11-file stage, atomic deployment, emergency rollback');
