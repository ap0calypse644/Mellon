#!/usr/bin/env bash
# G1.3.1 -- install ONLY GDM-specific hud-layout.js in mellon-gnome50-lab.
# Root *inside VM* only. No dconf, GDM restart, auth, or host changes.
(
    set -euo pipefail
    echo '========== G1.3.1: VM-ONLY HUD POSITION PATCH =========='
    test "$(id -u)" -eq 0 || { echo 'Guest sudo required.' >&2; exit 1; }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    test "$(dpkg-query -W -f='${Version}' gdm3)" = '50.1-0ubuntu0.1'
    test "$(id -u test1)" -eq 1000
    test "$(systemd-detect-virt)" != none
    systemctl is-active --quiet gdm.service || {
        echo 'GDM is not active; refusing installation.' >&2; exit 1;
    }

    EXT='/usr/share/gnome-shell/extensions/mellon-greeter@local'
    DIR='/home/test1/.local/state/mellon-gdm/g131-incoming-001'
    PROFILE='/etc/dconf/profile/gdm'
    KEYFILE='/etc/dconf/db/gdm.d/95-mellon-greeter'
    OLD='/var/lib/mellon-g131-backup'
    RECOVERY='/usr/local/sbin/mellon-greeter-g131-rollback'
    MARKER='/var/lib/mellon-greeter-g1-installed'

    test -d "$EXT" && test ! -L "$EXT"
    test -d "$DIR" && test ! -L "$DIR"
    test "$(stat -c %U "$DIR")" = test1
    for file in "$EXT/extension.js" "$EXT/metadata.json" "$EXT/hud-layout.js" \
         "$DIR/hud-layout.js" "$DIR/SHA256SUMS" \
         "$DIR/install-g131-in-guest.sh" "$DIR/rollback-g131-in-guest.sh" \
         "$MARKER" "$PROFILE" "$KEYFILE"; do
        test -f "$file" && test ! -L "$file" || {
            echo "Missing or linked protected file: $file" >&2; exit 1;
        }
    done
    test "$(stat -c '%u' "$EXT" "$EXT/hud-layout.js" "$PROFILE" "$KEYFILE" | sort -u)" = 0
    for path in "$OLD" "$RECOVERY"; do
        if test -e "$path" || test -L "$path"; then
            echo "Existing G1.3.1 backup/rollback: $path" >&2
            echo 'Do not reinstall without inspecting the current state.' >&2
            exit 1
        fi
    done
    ( cd "$DIR" && sha256sum -c SHA256SUMS )

    python3 - "$EXT" "$DIR" "$PROFILE" "$KEYFILE" <<'PY'
import json,sys
from pathlib import Path
ext,stage,profile,keyfile=map(Path,sys.argv[1:])
metadata=json.loads((ext/'metadata.json').read_text())
if (metadata.get('uuid')!='mellon-greeter@local'
    or metadata.get('session-modes')!=['gdm']
    or metadata.get('shell-version')!=['50']):
    raise SystemExit('Unexpected GNOME greeter extension')
if profile.read_text().strip().splitlines()!=[
    'user-db:user', 'system-db:gdm',
    'file-db:/var/lib/gdm3/greeter-dconf-defaults']:
    raise SystemExit('GDM dconf profile was modified; refusing')
if keyfile.read_text().strip().splitlines()!=[
    '[org/gnome/shell]',"enabled-extensions=['mellon-greeter@local']"]:
    raise SystemExit('GDM extension enablement changed; refusing')
expected={'hud-layout.js','install-g131-in-guest.sh',
          'rollback-g131-in-guest.sh','SHA256SUMS'}
actual={p.name for p in stage.iterdir()}
if actual!=expected:
    raise SystemExit(f'Unexpected G1.3.1 staging entries: {actual-expected}')
print('PASS: GDM profile and staged source verified')
PY
    grep -Fq '[Mellon Greeter G1.3] enabled in gdm mode' "$EXT/extension.js" || {
        echo 'Current greeter is NOT G1.3; refusing.' >&2; exit 1;
    }
    grep -Fq 'recovery = {x: 26, y: 22, width: 145, height: 46}' "$EXT/hud-layout.js" || {
        echo 'Original M8-style G1.3 layout not detected; refusing.' >&2; exit 1;
    }
    grep -Fq 'topLeft: {x: pad, y: Math.max(78, recovery.y + recovery.height + 12)' "$EXT/hud-layout.js"
    grep -Fq 'recovery = null' "$DIR/hud-layout.js"
    grep -Fq 'topLeft: {x: pad, y: 14,' "$DIR/hud-layout.js"
    # Publish independent emergency recovery BEFORE replacing the layout.
    install -d -m 700 "$OLD"
    install -m 600 "$EXT/hud-layout.js" "$OLD/hud-layout.js"
    install -Dm 700 "$DIR/rollback-g131-in-guest.sh" "$RECOVERY"

    TEMP="$(mktemp "$EXT/.hud-layout-g131.XXXXXXXX")"
    cleanup() {
        if test -n "${TEMP:-}" && test -f "$TEMP"; then
            rm -f -- "$TEMP"
        fi
    }
    trap cleanup EXIT
    install -m 644 -- "$DIR/hud-layout.js" "$TEMP"
    chown root:root "$TEMP"
    mv -T -- "$TEMP" "$EXT/hud-layout.js"
    TEMP=''
    trap - EXIT

    echo
    echo 'PASS: G1.3.1 top-left HUD layout installed in TEST VM only.'
    echo 'Only hud-layout.js replaced; rest of working G1.3 remains intact.'
    echo 'No changes to dconf, GDM authentication, BlackPearl, or M8 lockscreen.'
    echo 'Reboot only the VM to inspect the login screen.'
    echo "Emergency guest rollback: sudo $RECOVERY"
)
