#!/usr/bin/env node
// G1.6A: immutable, checksum-verified VM-only password-cover deployment.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('./'+path,import.meta.url),'utf8');
const [stage,install,rollback,entry,cover,hud,layout,metaText]=
    await Promise.all([
        read('stage-g16a-to-vm.sh'),
        read('install-g16a-in-guest.sh'),
        read('rollback-g16a-in-guest.sh'),
        read('greeter-extension/extension.js'),
        read('greeter-extension/greeter-password-cover.js'),
        read('greeter-extension/observatory-hud.js'),
        read('greeter-extension/hud-layout.js'),
        read('greeter-extension/metadata.json'),
    ]);
const meta=JSON.parse(metaText);
assert.equal(meta.uuid,'mellon-greeter@local');
assert.deepEqual(meta['session-modes'],['gdm']);
assert.deepEqual(meta['shell-version'],['50']);
assert.ok(stage.includes("VM='mellon-gnome50-lab'"));
assert.ok(stage.includes('g16a-incoming-001'));
assert.ok(stage.includes('greeter-password-cover.js'));
assert.ok(stage.includes('failure-tracker.js'));
assert.ok(stage.includes('test-g16a-cover.mjs'));
assert.ok(stage.includes('test-g16a-deploy.mjs'));
assert.ok(stage.includes('sha256sum -c SHA256SUMS'));
assert.ok(stage.includes('Manifest mismatch against BlackPearl'));
assert.ok(stage.includes('Existing G1.6A staging found: checking without replacement.'));
assert.ok(!/^\s*sudo\b/m.test(stage),'Host-only staging must never use sudo');
assert.ok(install.includes('systemd-detect-virt'));
assert.ok(install.includes("test \"$(id -u)\" -eq 0"));
assert.ok(install.includes('sha256sum -c SHA256SUMS'));
assert.ok(install.includes("grep -Fq '[Mellon Greeter G1.5] enabled in gdm mode'"));
assert.ok(install.includes("grep -Fq '[Mellon Greeter G1.6A] enabled in gdm mode'"));
assert.ok(install.includes('GDM dconf profile changed; refusing'));
assert.ok(install.includes("grep -Fq \"SHOW LOGIN\""));
assert.ok(install.includes('greeter-password-cover.js'));
assert.ok(install.includes('failure-tracker.js'));
assert.ok(install.includes('observatory-hud.js'));
assert.ok(install.includes('hud-layout.js'));
assert.ok(install.includes('install -Dm 700 -- "$DIR/rollback-g16a-in-guest.sh" "$ROLLBACK"'));
assert.ok(install.includes('mv -T -- "$EXT" "$BACKUP"'));
assert.ok(install.includes('mv -T -- "$NEXT" "$EXT"'));
assert.ok(install.includes('.mellon-g16a-previous-001'));
assert.ok(rollback.includes('.mellon-g16a-previous-001'));
assert.ok(rollback.includes('.mellon-g16a-failed-001'));
assert.ok(rollback.includes('mv -T -- "$PREVIOUS" "$ACTIVE"'));
assert.ok(rollback.includes("grep -Fq '[Mellon Greeter G1.6A] enabled in gdm mode'"));
assert.ok(rollback.includes("grep -Fq '[Mellon Greeter G1.5] enabled in gdm mode'"));
assert.ok(entry.includes("import {GreeterPasswordCover} from './greeter-password-cover.js'"));
assert.ok(entry.includes('new GreeterPasswordCover('));
assert.ok(entry.includes('this._cover?.sync()'));
assert.ok(entry.includes('this._cover?.destroy()'));
assert.ok(cover.includes('set_child_above_sibling(this._photo, this._dialog)'));
assert.ok(cover.includes('set_child_below_sibling(this._photo, this._dialog)'));
assert.ok(cover.includes("label: 'SHOW LOGIN'"));
assert.ok(cover.includes('prompt._entry === prompt._passwordEntry'));
assert.ok(cover.includes('this._dialog?._userSelectionBox?.visible === false'));
assert.ok(cover.includes('this._revealed = true'));
assert.ok(cover.includes("import {FailureTracker} from './failure-tracker.js'"));
assert.ok(cover.includes('UNAUTHORIZED ACCESS'));
assert.ok(hud.includes('setRecoveryLayout(enabled)'));
assert.ok(layout.includes('Math.max(78, recovery.y + recovery.height + 12)'));
assert.ok(!entry.includes('get_text('));
for(const s of [stage,install,rollback]){
    for(const forbidden of ['dconf update','gsettings set','systemctl restart',
        'virsh -c qemu:///system reboot','mellon-lab@local',
        'node --input-type=module --check < "$DIR"',
        'node --input-type=module --check < "$OLD"']){
        assert.ok(!s.includes(forbidden),'VM-only greeter guard: '+forbidden);
    }
}
console.log('PASS G1.6A: native password overlay only, protected user selection, verified 7-file stage, full G1.5 rollback');
