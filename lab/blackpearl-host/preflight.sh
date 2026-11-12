#!/usr/bin/env bash
# BLACKPEARL-ONLY. Read-only inventory. No writes or GDM restart.
(
    set -euo pipefail
    echo '========== MELLON HOST PREFLIGHT (READ ONLY) =========='
    test "$(id -un)" = ap0calypse
    test "$(id -u)" -eq 1000
    test "${HOSTNAME,,}" = blackpearl || test "$(hostname -s | tr '[:upper:]' '[:lower:]')" = blackpearl
    test "$(systemd-detect-virt)" = none || {
        echo 'Refusing host deployment inside virtualization.' >&2
        exit 1
    }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    GDM_VERSION="$(dpkg-query -W -f='${Version}' gdm3)"
    case "$GDM_VERSION" in 50.1*) ;; *) echo "Unvalidated GDM version: $GDM_VERSION" >&2; exit 1 ;; esac
    test "$(systemctl is-active display-manager.service)" = active
    test "$(stat -c %U /usr/share/gnome-shell/extensions)" = root
    test -r /usr/share/dconf/profile/gdm
    test -r /var/lib/gdm3/greeter-dconf-defaults
    test ! -e /etc/dconf/profile/gdm && test ! -L /etc/dconf/profile/gdm || {
        echo 'Existing /etc/dconf/profile/gdm: installation must be designed around it.' >&2
        exit 1
    }
    test ! -e /etc/dconf/db/gdm.d && test ! -L /etc/dconf/db/gdm.d &&
        test ! -e /etc/dconf/db/gdm && test ! -L /etc/dconf/db/gdm || {
        echo 'Existing GDM admin database: refusing to overwrite it.' >&2
        exit 1
    }
    test ! -e /usr/share/gnome-shell/extensions/mellon-greeter@local &&
        test ! -L /usr/share/gnome-shell/extensions/mellon-greeter@local
    test ! -e "$HOME/.local/share/gnome-shell/extensions/mellon-lab@local" &&
        test ! -L "$HOME/.local/share/gnome-shell/extensions/mellon-lab@local"
    test ! -e /usr/local/sbin/mellon-blackpearl-rollback
    test ! -e /var/backups/mellon-blackpearl/host-v1
    test -d "$HOME/VMs/Mellon/m6-curated-12-v1"
    test -f "$HOME/VMs/Mellon/m6-curated-12-v1/library.json"
    test -f "$HOME/VMs/Mellon/checkpoints/MELLON-GDM-PREINSTALL-001/SHA256SUMS"
    echo "PASS: physical BlackPearl, $(gnome-shell --version), gdm3 $GDM_VERSION"
    echo 'PASS: no conflicting GDM admin profile or Mellon installation'
    echo 'PASS: original tested photo pack and offline VM checkpoint present'
    echo
    echo '========== EXISTING USER EXTENSIONS (DO NOT CHANGE) =========='
    gsettings get org.gnome.shell enabled-extensions
    echo
    echo '========== SYSTEM PARTITIONS =========='
    df -h / /home
    echo
    echo '========== LIVE GDM GREETER DEFAULTS (SUDO READ ONLY) =========='
    sudo python3 - <<'PY'
import os, pathlib, pwd, subprocess, sys
vendor=pathlib.Path('/usr/share/dconf/profile/gdm')
lines=[x.strip() for x in vendor.read_text().splitlines()
       if x.strip() and not x.lstrip().startswith('#')]
expected=['user-db:user','file-db:/var/lib/gdm3/greeter-dconf-defaults']
if lines!=expected:
    raise SystemExit('Unexpected GDM vendor profile: '+repr(lines))
pids=[]
for p in pathlib.Path('/proc').iterdir():
    if not p.name.isdigit(): continue
    try:
        args=(p/'cmdline').read_bytes().split(b'\0')
        if b'--mode=gdm' in args and any(a.endswith(b'/gnome-shell') for a in args):
            pids.append(p)
    except (OSError,PermissionError): pass
if len(pids)>1:
    raise SystemExit('Expected at most one GNOME 50 greeter; saw '+str(len(pids)))
variables={}
if pids:
    proc=pids[0]
    uid=proc.stat().st_uid
    pw=pwd.getpwuid(uid)
    if not pw.pw_name.startswith('gdm'):
        raise SystemExit('Unexpected live greeter identity: '+pw.pw_name)
    for part in (proc/'environ').read_bytes().split(b'\0'):
        if b'=' not in part: continue
        k,v=part.split(b'=',1)
        if k in (b'DCONF_PROFILE',b'XDG_CONFIG_HOME',b'HOME',b'XDG_RUNTIME_DIR'):
            variables[k.decode()]=v.decode('utf-8','replace')
    if variables.get('DCONF_PROFILE')!='gdm':
        raise SystemExit('Live greeter DCONF_PROFILE is not gdm')
    print('Live greeter is present: validating its real dconf profile')
else:
    # GDM normally releases the greeter once this desktop session starts.
    # No fabricated /proc state: test the vendor profile and GDM account
    # defaults, then report that the live process was unavailable.
    pw=next((p for p in pwd.getpwall() if p.pw_name in
        ('gdm-greeter','gdm')),None)
    if pw is None:
        raise SystemExit('No GDM account found for offline defaults check')
    uid=pw.pw_uid
    print('No live greeter process (normal after login); testing account defaults')
    variables={'DCONF_PROFILE':'gdm','HOME':pw.pw_dir}
config=variables.get('XDG_CONFIG_HOME') or variables.get('HOME',pw.pw_dir)+'/.config'
if not config.startswith('/'):
    raise SystemExit('Untrusted live greeter configuration path')
env={
    'DCONF_PROFILE':'gdm',
    'XDG_CONFIG_HOME':config,
    'XDG_RUNTIME_DIR':variables.get('XDG_RUNTIME_DIR','/run/user/'+str(uid)),
    'HOME':variables.get('HOME',pw.pw_dir),
    'LANG':'C.UTF-8','PATH':'/usr/bin:/bin',
}
def read(key):
    p=subprocess.run(['/usr/bin/gsettings','get','org.gnome.shell',key],
        env=env,capture_output=True,text=True,timeout=10,user=uid,group=pw.pw_gid)
    if p.returncode:
        raise SystemExit('Cannot read live greeter '+key+': '+p.stderr.strip())
    return p.stdout.strip()
values={key:read(key) for key in
    ('enabled-extensions','disabled-extensions','disable-user-extensions')}
print('GDM user:',pw.pw_name)
for k,v in values.items(): print('GDM '+k+': '+v)
if values['enabled-extensions'] not in ('@as []','[]') or (
    values['disabled-extensions'] not in ('@as []','[]')) or (
    values['disable-user-extensions']!='false'):
    raise SystemExit('GDM has nondefault live extension settings; refusing generic install')
print('PASS: effective GDM account settings compatible with VM activation')
print('NOTE: live greeter environ ' + ('verified' if pids else 'not available while logged in'))
PY
    echo
    echo 'PASS: BLACKPEARL HOST PREFLIGHT. No files or services modified.'
)
