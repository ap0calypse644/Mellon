#!/usr/bin/env node
// G1.6B — compile/runtime policy and VM-only reversible upgrade checks.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('./'+p,import.meta.url),'utf8');
const [stage,install,rollback,entry,chooser,css,metaText]=
    await Promise.all([
    read('stage-g16b-to-vm.sh'),read('install-g16b-in-guest.sh'),
    read('rollback-g16b-in-guest.sh'),
    read('greeter-extension/extension.js'),
    read('greeter-extension/greeter-account-chooser.js'),
    read('greeter-extension/stylesheet.css'),
    read('greeter-extension/metadata.json')]);
const meta=JSON.parse(metaText);
assert.equal(meta.uuid,'mellon-greeter@local');
assert.deepEqual(meta['session-modes'],['gdm']);
assert.deepEqual(meta['shell-version'],['50']);
assert.ok(stage.includes("VM='mellon-gnome50-lab'"));
assert.ok(stage.includes('g16b-incoming-001'));
assert.ok(stage.includes('Existing G1.6B staging found: checking without replacement.'));
assert.ok(stage.includes('test-g16b-chooser.mjs'));
assert.ok(stage.includes('test-g16b-deploy.mjs'));
assert.ok(stage.includes('sha256sum -c SHA256SUMS'));
assert.ok(stage.includes('Manifest mismatch against BlackPearl'));
assert.ok(stage.includes('MELLON-GDM-PREINSTALL-001'));
assert.ok(!/^\s*sudo\b/m.test(stage));
assert.ok(stage.includes("[Mellon Greeter G1.6A.1] enabled in gdm mode"));
assert.ok(install.includes('systemd-detect-virt'));
assert.ok(install.includes('test "$(id -u test1)" -eq 1000'));
assert.ok(install.includes('sha256sum -c SHA256SUMS'));
assert.ok(install.includes('GDM dconf profile changed; refusing'));
assert.ok(install.includes("grep -Fq '[Mellon Greeter G1.6A.1] enabled in gdm mode' \"$EXT/extension.js\""));
assert.ok(install.includes('install -Dm 700 -- "$DIR/rollback-g16b-in-guest.sh" "$ROLLBACK"'));
assert.ok(install.includes('mv -T -- "$EXT" "$BACKUP"'));
assert.ok(install.includes('mv -T -- "$NEXT" "$EXT"'));
assert.ok(install.includes('.mellon-g16b-previous-001'));
assert.ok(install.includes('G1.6A.1 auto-recovery attempted'));
assert.ok(install.includes("grep -Fq '[Mellon Greeter G1.6B] enabled in gdm mode'"));
assert.ok(install.includes("grep -Fq 'new GreeterAccountChooser(' \"$NEXT/extension.js\""));
assert.ok(install.includes("grep -Fq '.mellon-gdm-account-option' \"$NEXT/stylesheet.css\""));
assert.ok(install.includes("grep -Fq 'Math.max(78, recovery.y + recovery.height + 12)' \"$NEXT/hud-layout.js\""));
const files=['extension.js','metadata.json','greeter-account-chooser.js','stylesheet.css'];
for(const name of files){
    assert.ok(stage.includes(name),'Staging excludes '+name);
    assert.ok(install.includes(name),'Installer excludes '+name);
}
assert.ok(rollback.includes("[Mellon Greeter G1.6A.1] enabled in gdm mode"));
assert.ok(rollback.includes("[Mellon Greeter G1.6B] enabled in gdm mode"));
assert.ok(rollback.includes('.mellon-g16b-previous-001'));
assert.ok(rollback.includes('.mellon-g16b-failed-001'));
assert.ok(rollback.includes('mv -T -- "$PREVIOUS" "$ACTIVE"'));
assert.ok(entry.includes("import {GreeterAccountChooser} from './greeter-account-chooser.js'"));
assert.ok(entry.includes('new GreeterAccountChooser('));
assert.ok(entry.includes('this._accounts?.sync()'));
assert.ok(entry.includes('this._accounts?.destroy()'));
assert.ok(entry.includes("this._cover?.sync()"));
assert.ok(entry.includes("[Mellon Greeter G1.6B] enabled in gdm mode"));
assert.ok(chooser.includes("item.emit('activate')"));
assert.ok(chooser.includes("list?._items instanceof Map"));
assert.ok(chooser.includes("MAX_CUSTOM_ACCOUNTS = 8"));
assert.ok(chooser.includes("AUTO_STABLE_TICKS = 5"));
assert.ok(chooser.includes('this._autoAttempted = true'));
assert.ok(chooser.includes('this._dialog?._userSelectionBox?.visible !== true'));
assert.ok(chooser.includes("label: 'SHOW LOGIN'"));
assert.ok(css.includes('.mellon-gdm-account-option'));
const executable=chooser.replace(/\/\*[\s\S]*?\*\//g,'')
    .replace(/^\s*\/\/.*$/gm,'');
for(const forbidden of [
  '_userVerifier','_passwordEntry','get_text(', 'get_buffer(',
  'getAnswer(', 'get_password(', 'get_passphrase(', 'set_text(',
  'key-press-event','PAM','_beginVerificationForItem(',
]){
  assert.ok(!executable.includes(forbidden),'No auth implementation: '+forbidden);
}
for(const source of [stage,install,rollback]){
    for(const forbidden of ['dconf update','gsettings set','systemctl restart',
       'virsh -c qemu:///system reboot','mellon-lab@local',
       'node --input-type=module --check < "$DIR"']){
      assert.ok(!source.includes(forbidden),'VM-only guard violated: '+forbidden);
    }
}
console.log('PASS G1.6B: native account activation, no credential logic, 4-file atomic VM update, G1.6A.1 full rollback');
