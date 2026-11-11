#!/usr/bin/env node
// G1 install integration guards: intentionally no root operations in CI.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=n=>readFile(new URL(n,import.meta.url),'utf8');
const [i,r,s,a]=await Promise.all([
    read('./install-g1-in-guest.sh'),
    read('./rollback-g1-in-guest.sh'),
    read('./stage-g1-to-vm.sh'),
    read('./audit-effective-greeter-settings.sh'),
]);
for(const file of [i,r]) {
    assert.ok(file.includes("test \"$(id -u)\" -eq 0"));
    assert.ok(file.includes('systemd-detect-virt'));
    assert.ok(file.includes('mellon-greeter@local'));
    assert.ok(!file.includes('mellon-lab@local'),
        'Greeter installer/rollback must never change user extension');
}
assert.ok(i.includes('file-db:/var/lib/gdm3/greeter-dconf-defaults'));
assert.ok(i.includes("test ! -e /etc/dconf/db/gdm"));
assert.ok(i.includes('enabled-extensions=[\'mellon-greeter@local\']'));
assert.ok(i.includes('subprocess.run('));
assert.ok(i.includes('user=uid,group=pw.pw_gid'));
assert.ok(i.includes('sha256sum -c SHA256SUMS'));
assert.ok(i.includes('find "$EXT"')===false,
    'Install must copy to temp system dir and atomically publish');
assert.ok(i.includes('mv -T -- "$STAGE" "$EXT"'));
assert.ok(i.includes('dconf update'));
assert.ok(i.includes('No GDM restart performed'));
assert.ok(r.includes('GDM admin profile changed; refusing automatic removal'));
assert.ok(r.includes('GDM admin keyfile changed; refusing automatic removal'));
assert.ok(r.includes("json.loads(p.read_text()).get('uuid')"));
assert.ok(r.includes('dconf update'));
assert.ok(s.includes("VM='mellon-gnome50-lab'"));
assert.ok(s.includes('test ! -e /etc/dconf/profile/gdm'));
assert.ok(s.includes('scp -q -r'));
assert.ok(s.includes('sha256sum -c SHA256SUMS'));
for(const forbidden of ['systemctl restart','virsh reboot','virsh destroy',
    'gsettings set','dconf write']) {
    assert.ok(![i,r,s,a].some(f=>f.includes(forbidden)),
        'Unsafe system-changing command in G1 scripts: '+forbidden);
}
assert.ok(a.includes("ssh -tt -o BatchMode=yes mellon"));
assert.ok(a.includes("sudo python3 -c"));
assert.ok(!a.includes("sudo -n"));
assert.ok(a.includes("VM='mellon-gnome50-lab'"));
const py=await read('./read-effective-greeter-settings.py');
assert.ok(py.includes('greeter.pw_name != "gdm-greeter"'));
assert.ok(py.includes('"DCONF_PROFILE": profile'));
assert.ok(py.includes('user=uid,'));
assert.ok(py.includes('group=greeter.pw_gid,'));
assert.ok(py.includes('extra_groups=[]'));
assert.ok(py.includes('No GDM changes made.'));
for (const forbidden of ['os.system(', 'os.chmod(', 'os.chown(',
    'write_text(', 'write_bytes(', 'unlink(', 'sudo -S']) {
    assert.ok(!py.includes(forbidden), 'Read-only greeter Python restriction: '+forbidden);
}
assert.ok(py.includes('getpwuid(uid)'));
console.log('PASS G1 VM install safety: vendor profile preserved, atomic copy, reversible dconf, no user extension changes');
