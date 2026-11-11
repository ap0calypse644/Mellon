#!/usr/bin/env bash
# G1: system extension install in mellon-gnome50-lab ONLY.
# Run with sudo inside test1's VM AFTER staging/checkpoint verification.
# NEVER run on BlackPearl. DOES NOT RESTART GDM.
(
    set -euo pipefail
    echo '========== G1 GREETER: GUARDED VM INSTALL =========='
    test "$(id -u)" -eq 0 || { echo 'Requires guest root' >&2; exit 1; }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1' || exit 1
    test "$(dpkg-query -W -f='${Version}' gdm3)" = '50.1-0ubuntu0.1' || exit 1
    test "$(id -u test1)" -eq 1000 || exit 1
    test -n "$(getent passwd gdm-greeter)" || {
        echo 'Unexpected live greeter identity' >&2; exit 1;
    }
    test "$(systemd-detect-virt)" != none || {
        echo 'Not in a VM; refusing system extension install' >&2; exit 1;
    }

    BUNDLE='/home/test1/.local/state/mellon-gdm/g1-incoming/bundle'
    ROLLBACK_SRC='/home/test1/.local/state/mellon-gdm/g1-incoming/rollback-g1-in-guest.sh'
    EXT='/usr/share/gnome-shell/extensions/mellon-greeter@local'
    PROFILE='/etc/dconf/profile/gdm'
    DEFAULT_PROFILE='/usr/share/dconf/profile/gdm'
    DB='/etc/dconf/db/gdm.d'
    KEYFILE="$DB/95-mellon-greeter"
    ROLLBACK='/usr/local/sbin/mellon-greeter-g1-rollback'
    MARKER='/var/lib/mellon-greeter-g1-installed'

    test -d "$BUNDLE" && test ! -L "$BUNDLE"
    test -f "$ROLLBACK_SRC" && test ! -L "$ROLLBACK_SRC"
    for path in "$EXT" "$PROFILE" "$KEYFILE" "$MARKER" "$ROLLBACK"; do
        if test -e "$path" || test -L "$path"; then
            echo "Preexisting GDM override or Mellon install: $path" >&2
            exit 1
        fi
    done
    test ! -e /etc/dconf/db/gdm || {
        echo 'Compiled GDM admin database already exists; refusing.' >&2
        exit 1
    }
    test ! -e "$DB" || {
        echo 'GDM admin keyfile directory already exists; refusing.' >&2
        exit 1
    }
    test -r "$DEFAULT_PROFILE" && test ! -L "$DEFAULT_PROFILE"
    test -r /var/lib/gdm3/greeter-dconf-defaults ||
        { echo 'Missing mandatory GDM vendor settings' >&2; exit 1; }

    # GDM 50 vendor profile is mandatory: preserve its runtime file-db.
    python3 - "$DEFAULT_PROFILE" <<'PY'
import sys
from pathlib import Path
lines=[x.strip() for x in Path(sys.argv[1]).read_text().splitlines()
       if x.strip() and not x.lstrip().startswith('#')]
expected=['user-db:user',
          'file-db:/var/lib/gdm3/greeter-dconf-defaults']
if lines!=expected:
    raise SystemExit(f'Unexpected GDM 50 vendor profile: {lines}')
print('PASS: correct Ubuntu 26.04 GDM vendor profile')
PY

    ( cd "$BUNDLE" && sha256sum -c SHA256SUMS >/dev/null )
    python3 - "$BUNDLE" <<'PY'
import json,os,sys
from pathlib import Path
root=Path(sys.argv[1])
meta=json.loads((root/'metadata.json').read_text())
lib=json.loads((root/'library.json').read_text())
if meta.get('uuid')!='mellon-greeter@local' or meta.get('session-modes')!=['gdm']:
    raise SystemExit('Unexpected G1 extension metadata')
if lib.get('schema')!='mellon-m6-scene-library-v1' or len(lib['scenes'])!=12:
    raise SystemExit('Unexpected greeter photo corpus')
for p in root.rglob('*'):
    if p.is_symlink() or (not p.is_file() and not p.is_dir()):
        raise SystemExit('Unsafe filesystem entry in bundle')
    if p.is_file() and p.stat().st_nlink != 1:
        raise SystemExit('Hardlinked bundle file; refusing')
print('PASS: staged bundle matches approved twelve-scene corpus')
PY

    # Live greeter's own GSettings take precedence over an admin database.
    # Check its real account, XDG_CONFIG_HOME and DCONF_PROFILE.
    python3 - <<'PY'
import os, pathlib, pwd, subprocess
pids=[]
for p in pathlib.Path('/proc').iterdir():
    if not p.name.isdigit():continue
    try:
        args=(p/'cmdline').read_bytes().split(b'\0')
        if b'--mode=gdm' in args and any(a.endswith(b'/gnome-shell') for a in args):
            pids.append(p)
    except (OSError,PermissionError):pass
if len(pids)!=1:raise SystemExit('Expected exactly one live GDM greeter')
p=pids[0]; uid=p.stat().st_uid; pw=pwd.getpwuid(uid)
if pw.pw_name!='gdm-greeter':raise SystemExit('Unexpected greeter identity')
vars={}
for item in (p/'environ').read_bytes().split(b'\0'):
    if b'=' in item:
        k,v=item.split(b'=',1)
        if k in (b'DCONF_PROFILE',b'XDG_CONFIG_HOME',b'HOME',b'XDG_RUNTIME_DIR'):
            vars[k.decode()]=v.decode('utf-8','replace')
if vars.get('DCONF_PROFILE')!='gdm':
    raise SystemExit('Greeter DCONF_PROFILE is not gdm')
config=vars.get('XDG_CONFIG_HOME') or vars.get('HOME',pw.pw_dir)+'/.config'
if not config.startswith('/'):raise SystemExit('Untrusted greeter configuration path')
env={'DCONF_PROFILE':'gdm','XDG_CONFIG_HOME':config,
     'XDG_RUNTIME_DIR':vars.get('XDG_RUNTIME_DIR','/run/user/'+str(uid)),
     'HOME':vars.get('HOME',pw.pw_dir),'LANG':'C.UTF-8',
     'PATH':'/usr/bin:/bin'}
def get(key):
    proc=subprocess.run(['/usr/bin/gsettings','get','org.gnome.shell',key],
        env=env,capture_output=True,text=True,timeout=8,user=uid,group=pw.pw_gid)
    if proc.returncode:raise SystemExit('Could not read greeter '+key+': '+proc.stderr)
    return proc.stdout.strip()
enabled=get('enabled-extensions')
disabled=get('disabled-extensions')
kill=get('disable-user-extensions')
print('Greeter enabled-extensions:',enabled)
print('Greeter disabled-extensions:',disabled)
print('Greeter disable-user-extensions:',kill)
if kill!='false' or enabled not in ('@as []','[]') or disabled not in ('@as []','[]'):
    raise SystemExit('Greeter extension settings not default; inspect before changing')
print('PASS: GDM greeter defaults permit a new admin extension default')
PY

    # Parent paths are system-owned and root-only writable.
    test "$(stat -c '%U' /usr/share/gnome-shell/extensions)" = root
    test "$(stat -c '%U' /etc/dconf)" = root
    install -Dm 700 -- "$ROLLBACK_SRC" "$ROLLBACK"

    # Copy into an unexposed system staging directory before the
    # atomic publish. A partial copy cannot be mistaken for an extension.
    STAGE="$(mktemp -d /usr/share/gnome-shell/extensions/.mellon-g1.XXXXXXXX)"
    trap 'if test -n "${STAGE:-}" && test -d "$STAGE"; then rm -rf -- "$STAGE"; fi' EXIT
    cp -a -- "$BUNDLE/." "$STAGE/"
    chown -R root:root -- "$STAGE"
    find "$STAGE" -type d -exec chmod 755 {} +
    find "$STAGE" -type f -exec chmod 644 {} +
    mv -T -- "$STAGE" "$EXT"
    STAGE=''
    trap - EXIT

    install -d -m 755 /etc/dconf/profile "$DB"
    cat > "$PROFILE" <<'EOF'
user-db:user
system-db:gdm
file-db:/var/lib/gdm3/greeter-dconf-defaults
EOF
    chmod 644 "$PROFILE"
    cat > "$KEYFILE" <<'EOF'
[org/gnome/shell]
enabled-extensions=['mellon-greeter@local']
EOF
    chmod 644 "$KEYFILE"

    dconf update
    install -Dm 600 /dev/null "$MARKER"
    echo 'Mellon G1 VM-only greeter extension, version 1' > "$MARKER"
    chmod 600 "$MARKER"

    echo
    echo 'PASS: installed Mellon G1 photo prototype in TEST VM only.'
    echo 'No GDM restart performed. To see greeter, reboot the TEST VM.'
    echo "Emergency uninstall (guest): sudo $ROLLBACK"
    echo "Emergency uninstall (host): ssh -tt mellon 'sudo $ROLLBACK'"
)
