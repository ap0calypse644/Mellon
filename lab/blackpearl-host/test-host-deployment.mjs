#!/usr/bin/env node
// BlackPearl host install is intentionally not run by CI.
// Static assertions protect against accidentally shipping a VM-only installer,
// clobbering existing GNOME/dconf settings, or leaving no TTY recovery path.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const f=p=>readFile(new URL(p,import.meta.url),'utf8');
const [preflight,stage,install,rollback,gdmMeta,lockMeta]=
    await Promise.all([
    f('preflight.sh'),f('stage.sh'),f('install.sh'),f('rollback.sh'),
    f('../gnome50-gdm/greeter-extension/metadata.json'),
    f('../gnome50-m8/metadata.json')]);
assert.equal(JSON.parse(gdmMeta)['session-modes'][0],'gdm');
assert.equal(JSON.parse(lockMeta)['session-modes'][0],'unlock-dialog');
for(const source of [preflight,stage,install,rollback]){
    assert.ok(source.includes('blackpearl'),'Wrong host code');
    assert.ok(source.includes('set -euo pipefail'));
    assert.ok(!source.includes('systemctl restart'),
        'Never restart GDM from host deployment');
    assert.ok(!source.includes('systemctl isolate'),
        'Never switch GDM sessions automatically');
    assert.ok(!source.includes('reboot -f'));
}
assert.ok(preflight.includes('READ ONLY'));
assert.ok(preflight.includes("gnome-shell --version"));
assert.ok(preflight.includes('gdm3'));
assert.ok(preflight.includes('enabled-extensions'));
assert.ok(preflight.includes('disabled-extensions'));
assert.ok(preflight.includes('disable-user-extensions'));
assert.ok(preflight.includes('systemd-detect-virt'));
assert.ok(preflight.includes('No live greeter process'));
assert.ok(preflight.includes('Refusing host deployment inside virtualization.'));
assert.ok(preflight.includes('Existing GDM admin database'));
assert.ok(!preflight.includes('dconf update'));
assert.ok(!preflight.includes('gsettings set'));
assert.ok(stage.includes('stage-v1'));
assert.ok(stage.includes("sha256sum -c SHA256SUMS"));
assert.ok(stage.includes('mellon-constellations-venv/bin/python'));
assert.ok(stage.includes('verify-pilot-pack.py'));
assert.ok(stage.includes("VM source") || stage.includes('VM/source'));
assert.ok(stage.includes('Exact approved')||
    stage.includes('exact approved M8.4/G1.8'));
assert.ok(stage.includes('test-g18-hud-runtime.mjs'));
assert.ok(stage.includes('test-g18-deploy.mjs'));
assert.ok(stage.includes('test-intro-runtime.mjs'));
assert.ok(stage.includes('test-mapping.mjs'));
assert.ok(stage.includes('BUNDLE-SHA256SUMS'));
assert.ok(!/^\s*sudo\s/m.test(stage),
    'No privileged command in nonprivileged staging');
const required=[
    'rollback.sh','/usr/local/sbin/mellon-blackpearl-rollback',
    'stage-v1','BUNDLE-SHA256SUMS','SHA256SUMS',
    'mellon-greeter@local','mellon-lab@local','G1.8','M8.4',
    'host-v1','dconf update','if test -e "$path" || test -L "$path";',
    'mv -T -- "$TMP_LOCK" "$USER_EXT"',
    'mv -T -- "$TMP_GDM" "$SYS_EXT"',
];
for(const needle of required)
    assert.ok(install.includes(needle),'Missing essential install guard: '+needle);
assert.ok(install.includes("install -Dm 700 -- \"$HERE/rollback.sh\" \"$ROLLBACK\""),
    'Root-owned rollback must be on disk BEFORE install modifies GNOME');
assert.ok(install.includes('trap on_exit EXIT'),
    'Partial install needs automatic on-disk rollback');
assert.ok(install.includes('trap - EXIT'),
    'Successful install must not accidentally trigger rollback');
assert.ok(install.includes('refusing')||install.includes('Refusing'));
assert.ok(install.includes('systemd-detect-virt'));
assert.ok(!install.includes('gnome-extensions enable'),
    'Installing should not alter live user GNOME before login tests');
assert.ok(!install.includes('systemctl restart display-manager'));
assert.ok(rollback.includes('gdm-quarantined'));
assert.ok(rollback.includes('lock-quarantined'));
assert.ok(rollback.includes("grep -Fq '\"uuid\": \"mellon-greeter@local\"'"));
assert.ok(rollback.includes('Original GNOME/GDM defaults restored on disk.'));
assert.ok(rollback.includes('dconf update'));
assert.ok(rollback.includes('MELLON-BLACKPEARL-HOST-V1'));
assert.ok(!rollback.includes('rm -rf -- /usr/share'));
assert.ok(!rollback.includes('systemctl restart gdm'));
console.log('PASS BlackPearl: GNOME 50 host checks, immutable 12-scene bundles, two scoped extensions, dconf isolation, TTY rollback');
