#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = name => readFile(new URL('./'+name,import.meta.url), 'utf8');
const [bash,python] = await Promise.all([
  read('diagnose-g1-greeter.sh'),read('diagnose-g1-greeter.py')
]);
assert.ok(bash.includes("VM='mellon-gnome50-lab'"));
assert.ok(bash.includes('ssh -tt -o BatchMode=yes mellon'));
assert.ok(bash.includes('sudo python3 -c'));
assert.ok(!bash.includes('sudo -n'));
assert.ok(bash.includes('test "$(id -un)" = "test1"'));
assert.ok(python.includes('account.pw_name != "gdm-greeter"'));
assert.ok(python.includes('DCONF_PROFILE'));
assert.ok(python.includes('enabled-extensions'));
assert.ok(python.includes('disabled-extensions'));
assert.ok(python.includes('disable-user-extensions'));
assert.ok(python.includes('journalctl'));
assert.ok(python.includes('gsettings'));
assert.ok(python.includes('dconf'));
assert.ok(python.includes('user=uid, group=gid'));
assert.ok(python.includes('extra_groups=[]'));
assert.ok(python.includes('G1 diagnosis complete; no settings, files or sessions changed.'));
assert.ok(python.includes("NO ACTIVE GREETER:"));
assert.ok(python.includes("PARTIAL: Static inventory done."));
assert.ok(python.includes("Log out of the test VM's graphical test1 desktop"));
assert.ok(python.includes('sys.exit(0)'));
assert.ok(python.includes('if len(pids) > 1:'));
assert.ok(python.includes('"_COMM=gnome-shell"'));
assert.ok(python.includes('read_expected(KEYFILE)'));

for(const forbidden of [
  'os.system(', 'os.chmod(', 'os.chown(', 'write_text(', 'write_bytes(',
  '.unlink(', '.mkdir(', 'shutil.', 'gsettings", "set"', 'dconf", "write"',
  'systemctl", "restart"', 'subprocess.Popen(', 'stdin=subprocess.PIPE'
]){
  assert.ok(!python.includes(forbidden), 'mutating Python fragment: '+forbidden);
}
for(const forbidden of ['virsh -c qemu:///system reboot','systemctl restart',
  'dconf update','gsettings set', 'ssh -tt mellon sudo']){
  assert.ok(!bash.includes(forbidden), 'mutating Bash fragment: '+forbidden);
}
console.log('PASS G1 diagnosis: guest-only interactive sudo, read-only logging and effective GDM profile checks');
