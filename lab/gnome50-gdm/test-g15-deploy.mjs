#!/usr/bin/env node
// G1.5: deployment safety and source immutability for VM-only lifecycle.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const rd=p=>readFile(new URL('./'+p,import.meta.url),'utf8');
const [stage,install,rollback,entry,metaText,originalHUD,renderer,observer]=
    await Promise.all([
        rd('stage-g15-to-vm.sh'),rd('install-g15-in-guest.sh'),
        rd('rollback-g15-in-guest.sh'),
        rd('greeter-extension/extension.js'),
        rd('greeter-extension/metadata.json'),
        rd('greeter-extension/observatory-hud.js'),
        rd('greeter-extension/greeter-starfield.js'),
        rd('greeter-extension/greeter-length-observer.js'),
    ]);
const meta=JSON.parse(metaText);
assert.equal(meta.uuid,'mellon-greeter@local');
assert.deepEqual(meta['session-modes'],['gdm']);
assert.deepEqual(meta['shell-version'],['50']);
assert.ok(stage.includes("VM='mellon-gnome50-lab'"));
assert.ok(stage.includes('g15-incoming-001'));
assert.ok(stage.includes('node "$HERE/test-g1-runtime.mjs"'));
assert.ok(stage.includes('node "$HERE/test-g14-runtime.mjs"'));
assert.ok(stage.includes('node "$HERE/test-g15-deploy.mjs"'));
assert.ok(stage.includes('sha256sum -c SHA256SUMS'));
assert.ok(stage.includes('Manifest mismatch against BlackPearl'));
assert.ok(stage.includes('Existing G1.5 staging found: checking without replacement.'));
assert.ok(stage.includes('G1.5 staging retired; use the versioned G1.6A cover package.'));
assert.ok(!/^\s*sudo\b/m.test(stage));
assert.ok(install.includes('systemd-detect-virt'));
assert.ok(install.includes("test \"$(id -u)\" -eq 0"));
assert.ok(install.includes('test "$(id -u test1)" -eq 1000'));
assert.ok(install.includes('sha256sum -c SHA256SUMS'));
assert.ok(install.includes("grep -Fq '[Mellon Greeter G1.4] enabled in gdm mode'"));
assert.ok(install.includes('GDM dconf profile changed; refusing'));
assert.ok(install.includes('for rel in [scene[\'image\'],*scene[\'sprites\']]'));
assert.ok(install.includes('install -Dm 700 -- "$DIR/rollback-g15-in-guest.sh" "$ROLLBACK"'));
assert.ok(install.includes('mv -T -- "$EXT" "$BACKUP"'));
assert.ok(install.includes('mv -T -- "$NEXT" "$EXT"'));
assert.ok(install.includes('.mellon-g15-previous-001'));
assert.ok(install.includes('G1.4 auto-recovery attempted following interrupted upgrade.'));
assert.ok(rollback.includes('.mellon-g15-previous-001'));
assert.ok(rollback.includes('.mellon-g15-failed-001'));
assert.ok(rollback.includes("grep -Fq '[Mellon Greeter G1.5] enabled in gdm mode'"));
assert.ok(rollback.includes("grep -Fq '[Mellon Greeter G1.4] enabled in gdm mode'"));
assert.ok(rollback.includes('mv -T -- "$PREVIOUS" "$ACTIVE"'));
assert.ok(entry.includes('GREETER_MAX_REBIND_TICKS = 120'));
assert.ok(entry.includes('this._selectedScene = scene'));
assert.ok(entry.includes('const scene = this._selectedScene ??'));
assert.ok(entry.includes('this._rebindTicks >='));
assert.ok(entry.includes('this._starfield?.clear()'));
assert.ok(entry.includes('this._observer?.destroy()'));
assert.ok(entry.includes('this._syncId = 0'));
assert.ok(entry.includes('container.insert_child_below(photo, dialog)'));
assert.ok(entry.includes('container.insert_child_below(starfield.actor, dialog)'));
assert.ok(entry.includes('container.insert_child_below(hud.actor, dialog)'));
assert.ok(entry.includes("Main.sessionMode.currentMode === 'gdm'"));
assert.ok(!entry.includes('._userVerifier'));
assert.ok(!entry.includes('get_text('));
assert.ok(originalHUD.includes('cancelIntro()'));
assert.ok(renderer.includes('completionWave('));
assert.ok(observer.includes("buffer.connect('notify::length'"));
for(const file of [stage,install,rollback]){
    for(const bad of ['dconf update','gsettings set','systemctl restart',
        'virsh -c qemu:///system reboot','mellon-lab@local',
        'node --input-type=module --check < "$DIR"',
        'node --input-type=module --check < "$OLD"']){
        assert.ok(!file.includes(bad),'G1.5 VM safety violation: '+bad);
    }
}
console.log('PASS G1.5: bounded lifecycle, G1.4 preserved, 4-file guest bundle, full reversible VM-only deployment');
