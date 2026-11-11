#!/usr/bin/env node
// G1.4 regression for the VM-only installation and full rollback path.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL('./'+name,import.meta.url),'utf8');
const [stage,install,rollback,source,metaText]=await Promise.all([
    read('stage-g14-to-vm.sh'),read('install-g14-in-guest.sh'),
    read('rollback-g14-in-guest.sh'),
    read('greeter-extension/extension.js'),
    read('greeter-extension/metadata.json'),
]);
const meta=JSON.parse(metaText);
assert.equal(meta.uuid,'mellon-greeter@local');
assert.deepEqual(meta['session-modes'],['gdm']);
assert.deepEqual(meta['shell-version'],['50']);
assert.ok(stage.includes("VM='mellon-gnome50-lab'"));
assert.ok(stage.includes('g14-incoming-001'));
assert.ok(stage.includes('sha256sum -c SHA256SUMS'));
assert.ok(stage.includes('Host manifest differs from guest'));
assert.ok(stage.includes('Existing G1.4 stage found: verifying without replacing it.'));
assert.ok(stage.includes('node "$HERE/test-g14-runtime.mjs"'));
assert.ok(stage.includes('node "$HERE/test-g14-length.mjs"'));
assert.ok(stage.includes('node --input-type=module --check < "$SRC/$file"'));
assert.ok(!/^\s*sudo\b/m.test(stage));
assert.ok(install.includes('systemd-detect-virt'));
assert.ok(install.includes("test \"$(id -u)\" -eq 0"));
assert.ok(install.includes('test "$(id -u test1)" -eq 1000'));
assert.ok(install.includes('sha256sum -c SHA256SUMS'));
assert.ok(install.includes('GDM admin profile changed: refusing upgrade'));
assert.ok(install.includes("grep -Fq '[Mellon Greeter G1.3] enabled in gdm mode'"));
assert.ok(install.includes("grep -Fq 'topLeft: {x: pad, y: 14,'"));
assert.ok(install.includes('.mellon-g14-previous-001'));
assert.ok(install.includes('install -Dm 700 -- "$DIR/rollback-g14-in-guest.sh" "$ROLLBACK"'));
assert.ok(install.includes('mv -T -- "$EXT" "$BACKUP"'));
assert.ok(install.includes('mv -T -- "$NEXT" "$EXT"'));
assert.ok(install.includes('Recovery attempted: original G1.3.1 restored.'));
assert.ok(install.includes('No service restart') || install.includes('NO service restart.'));
assert.ok(rollback.includes('.mellon-g14-previous-001'));
assert.ok(rollback.includes('.mellon-g14-failed-001'));
assert.ok(rollback.includes('mv -T -- "$OLD" "$ACTIVE"'));
assert.ok(rollback.includes("grep -Fq '[Mellon Greeter G1.4] enabled in gdm mode'"));
assert.ok(rollback.includes("grep -Fq '[Mellon Greeter G1.3] enabled in gdm mode'"));
assert.ok(source.includes("import {GreeterStarfield} from './greeter-starfield.js'"));
assert.ok(source.includes("import {GreeterLengthObserver} from './greeter-length-observer.js'"));
assert.ok(source.includes('container.insert_child_below(photo, dialog)'));
assert.ok(source.includes('container.insert_child_below(starfield.actor, dialog)'));
assert.ok(source.includes('container.insert_child_below(hud.actor, dialog)'));
assert.ok(source.includes('this._observer?.destroy()'));
assert.ok(source.includes('this._starfield?.destroy()'));
assert.ok(source.includes('GREETER_LENGTH_SYNC_MS = 250'));
assert.ok(!source.includes('._userVerifier'));
for(const s of [stage,install,rollback]){
    for(const forbidden of ['dconf update','gsettings set','systemctl restart',
        'virsh -c qemu:///system reboot','mellon-lab@local',
        'node --input-type=module --check < "$DIR"',
        'node --input-type=module --check < "$OLD"']){
        assert.ok(!s.includes(forbidden),'GDM and host safety: '+forbidden);
    }
}
console.log('PASS G1.4 deployment: VM guard, checksum 7-file stage, whole G1.3.1 backup, atomic swap and rollback');
