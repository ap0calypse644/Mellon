#!/usr/bin/env bash
# G1.0.1: inspect effective GDM Shell dconf settings as the REAL greeter.
# The guest VM only. No filesystem or settings mutation; sudo -n fails closed.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    virsh -c qemu:///system dominfo "$VM" >/dev/null
    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    test "$(id -un)" = 'test1'
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    echo '========== GREETER DCONF EFFECTIVE SETTINGS =========='
    if ! sudo -n true; then
        echo 'NEEDS GUEST SUDO: test1 cannot run noninteractive sudo.' >&2
        echo 'No changes attempted; request interactive guest privilege setup.' >&2
        exit 4
    fi
    sudo -n python3 - <<'PY'
import os, pathlib, pwd, subprocess, sys
pids = []
for proc in pathlib.Path('/proc').iterdir():
    if not proc.name.isdigit():
        continue
    try:
        data=(proc/'cmdline').read_bytes().split(b'\0')
        args=[x.decode('utf-8','replace') for x in data if x]
        if args and args[0].endswith('/gnome-shell') and '--mode=gdm' in args:
            pids.append((int(proc.name), proc, args))
    except (OSError, PermissionError):
        pass
if len(pids) != 1:
    raise SystemExit('Expected one live GNOME --mode=gdm process, found '+str(len(pids)))
pid,proc,_ = pids[0]
uid=proc.stat().st_uid
greeter=pwd.getpwuid(uid)
if greeter.pw_name != 'gdm-greeter':
    raise SystemExit('Unexpected greeter username: '+greeter.pw_name)
raw=(proc/'environ').read_bytes().split(b'\0')
values={}
keys={'DCONF_PROFILE','XDG_CONFIG_HOME','XDG_RUNTIME_DIR','HOME','GSETTINGS_BACKEND'}
for field in raw:
    if b'=' not in field:continue
    key,value=field.split(b'=',1)
    k=key.decode('utf-8','replace')
    if k in keys:
        values[k]=value.decode('utf-8','replace')
print('GNOME greeter UID:',uid)
print('Greeter account:',greeter.pw_name)
print('Whitelisted GNOME profile paths (not arbitrary environment):')
for key in sorted(keys):
    print(' ',key,'=',values.get(key,'<unset>'))

profile=values.get('DCONF_PROFILE','')
if profile != 'gdm':
    raise SystemExit('Greeter is NOT using DCONF_PROFILE=gdm; do not install yet')
confighome=values.get('XDG_CONFIG_HOME') or (
    os.path.join(values.get('HOME',greeter.pw_dir),'.config'))
if not os.path.isabs(confighome):
    raise SystemExit('Greeter XDG_CONFIG_HOME is not absolute')
userdb=pathlib.Path(confighome)/'dconf/user'
print('Effective profile:',profile)
print('Greeter dconf user-db:',userdb)
print('User-db exists:',userdb.is_file())
print('User-db is symlink:',userdb.is_symlink())

env={
    'DCONF_PROFILE':profile,
    'HOME':values.get('HOME',greeter.pw_dir),
    'XDG_CONFIG_HOME':confighome,
    'XDG_RUNTIME_DIR':values.get('XDG_RUNTIME_DIR','/run/user/'+str(uid)),
    'PATH':'/usr/bin:/bin',
    'LANG':'C.UTF-8',
}
for key in ['enabled-extensions','disabled-extensions',
            'disable-user-extensions']:
    cmd=['/usr/bin/gsettings','get','org.gnome.shell',key]
    result=subprocess.run(cmd,env=env,capture_output=True,text=True,
        timeout=6,
        user=uid,
        group=greeter.pw_gid)
    print(key+':',result.stdout.strip() if result.returncode==0
        else '<READ FAILED: '+result.stderr.strip()[:180]+'>')
    if result.returncode!=0:
        raise SystemExit('Unable to verify actual greeter setting '+key)
PY

    echo
    echo '========== VENDOR PROFILE MUST MATCH THE AUDITED BASELINE =========='
    if ! cmp -s /usr/share/dconf/profile/gdm /dev/null; then
        echo 'Vendor gdm profile is present (expected).'
        sed -n '1,12p' /usr/share/dconf/profile/gdm
    else
        echo 'Vendor gdm profile missing or empty. Stop.' >&2
        exit 1
    fi
    echo
    echo 'PASS: read-only greeter dconf settings audit completed.'
)
GUEST
)
