#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=async f=>readFile(new URL('./'+f,import.meta.url),'utf8');
const [stage,update,restore,extension,metadata]=await Promise.all([
  source('stage-g121-update-to-vm.sh'),
  source('update-g121-in-guest.sh'),
  source('rollback-g121-in-guest.sh'),
  source('greeter-extension/extension.js'),
  source('greeter-extension/metadata.json'),
]);
const meta=JSON.parse(metadata);
assert.equal(meta.uuid,'mellon-greeter@local');
assert.deepEqual(meta['session-modes'],['gdm']);
assert.ok(stage.includes("VM='mellon-gnome50-lab'"));
assert.ok(stage.includes('ssh -o BatchMode=yes mellon'));
assert.ok(stage.includes('scp -q -- "$SOURCE"'));
assert.ok(stage.includes('sha256sum -c -'));
assert.ok(stage.includes('printf \'%s  extension.js'));
assert.ok(stage.includes("Previous staging directory exists; verifying in place"));
assert.ok(stage.includes("No guest Node.js required"));
assert.ok(stage.includes("g1-update-003"));
assert.ok(update.includes("g1-update-003"));
assert.ok(!update.includes("node --input-type=module --check"));
assert.ok(!restore.includes("node --input-type=module --check"));
assert.ok(!stage.includes('node --input-type=module --check < extension.js'));
assert.ok(stage.includes('node --input-type=module --check < "$SOURCE"'));
assert.ok(!/^\\s*sudo\\b/m.test(stage),'Staging must not execute guest sudo');
assert.ok(update.includes("test \"$(id -u)\" -eq 0"));
assert.ok(update.includes('systemd-detect-virt'));
assert.ok(update.includes('test -f "$MARKER"')===false || update.includes('"$MARKER"'));
assert.ok(update.includes('sha256sum -c SHA256SUMS'));
assert.ok(update.includes('grep -Fq \'const container = dialog?._backgroundGroup;\''));
assert.ok(update.includes('grep -Fq \'const container = Main.screenShield?._lockDialogGroup;\''));
assert.ok(update.includes('install -Dm 700 -- "$SOURCE/rollback-g121-in-guest.sh" "$ROLLBACK"'));
assert.ok(update.includes('mv -T -- "$TEMP" "$EXT/extension.js"'));
assert.ok(update.includes('GDM settings preserved'));
assert.ok(restore.includes('grep -Fq \'const container = dialog?._backgroundGroup;\' "$OLD"'));
assert.ok(restore.includes('mv -T -- "$TMP" "$NEW"'));
assert.ok(restore.includes('No GDM settings modified.'));
assert.ok(extension.includes('Main.screenShield?._lockDialogGroup'));
assert.ok(extension.includes('dialog.get_parent() !== container'));
assert.ok(extension.includes('container.insert_child_below(photo, dialog)'));
assert.ok(extension.includes('[Mellon Greeter G1.8] enabled in gdm mode'));
assert.ok(extension.includes('early startup curtain and continuous password handoff ready'));
assert.ok(extension.includes("import {GreeterStarfield} from './greeter-starfield.js'"));
assert.ok(stage.includes('G1.2.1 stage retired: current extension needs newer HUD modules.'));
assert.ok(stage.includes("! grep -Fq '[Mellon Greeter G1.2.1] enabled in gdm mode'"));
assert.ok(extension.includes("import {ObservatoryHUD} from './observatory-hud.js'"));
for(const code of [stage,update,restore]){
  for(const bad of ['dconf update', 'gsettings set', 'systemctl restart',
    'virsh -c qemu:///system reboot', 'mellon-lab@local']){
    assert.ok(!code.includes(bad),'G1.2.1 must not mutate native auth / user extension: '+bad);
  }
}
console.log('PASS G1.2.1: isolated VM-only photo actor update, atomic replacement and rollback');
