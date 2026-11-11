#!/usr/bin/env bash
# Mellon G1.2.1: root-only, VM-only, update ONLY the installed greeter
# extension.js. Dconf, auth, PAM and native GDM files are never modified.
(
    set -euo pipefail
    test "$(id -u)" -eq 0 || { echo 'Requires guest sudo' >&2; exit 1; }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1' || exit 1
    test "$(dpkg-query -W -f='${Version}' gdm3)" = '50.1-0ubuntu0.1' || exit 1
    test "$(id -u test1)" -eq 1000 || exit 1
    test "$(systemd-detect-virt)" != none || {
        echo 'Refusing system extension update outside virtual machine' >&2
        exit 1
    }
    EXT='/usr/share/gnome-shell/extensions/mellon-greeter@local'
    SOURCE='/home/test1/.local/state/mellon-gdm/g1-update-002'
    PROFILE='/etc/dconf/profile/gdm'
    KEYFILE='/etc/dconf/db/gdm.d/95-mellon-greeter'
    MARKER='/var/lib/mellon-greeter-g1-installed'
    BACKUP='/var/lib/mellon-greeter-g121-backup'
    ROLLBACK='/usr/local/sbin/mellon-greeter-g121-rollback'

    echo '========== G1.2.1: GREETER-ONLY PATCH PREFLIGHT =========='
    for file in "$SOURCE/extension.js" "$SOURCE/SHA256SUMS" \
                "$SOURCE/rollback-g121-in-guest.sh" "$MARKER" \
                "$EXT/extension.js" "$EXT/metadata.json" "$PROFILE" \
                "$KEYFILE"; do
        test -f "$file" && test ! -L "$file" || {
            echo "Expected plain file missing or symlinked: $file" >&2
            exit 1
        }
    done
    test -d "$EXT" && test ! -L "$EXT" || exit 1
    test "$(stat -c '%u' "$EXT" "$EXT/extension.js" "$PROFILE" "$KEYFILE" | sort -u)" = 0 || {
        echo 'Expected system files not root-owned' >&2; exit 1;
    }
    for path in "$BACKUP" "$ROLLBACK"; do
        if test -e "$path" || test -L "$path"; then
            echo "G1.2.1 recovery already exists: $path" >&2
            exit 1
        fi
    done
    ( cd "$SOURCE" && sha256sum -c SHA256SUMS )

    python3 - "$EXT/metadata.json" "$PROFILE" "$KEYFILE" <<'PY'
import json,sys
from pathlib import Path
meta,profile,keyfile=map(Path,sys.argv[1:])
data=json.loads(meta.read_text())
if data.get('uuid')!='mellon-greeter@local' or data.get('session-modes')!=['gdm']:
    raise SystemExit('Unexpected installed G1 greeter metadata')
if profile.read_text().strip().splitlines()!=[
    'user-db:user', 'system-db:gdm',
    'file-db:/var/lib/gdm3/greeter-dconf-defaults']:
    raise SystemExit('GDM profile changed; refusing update')
if keyfile.read_text().strip().splitlines()!=[
    '[org/gnome/shell]', "enabled-extensions=['mellon-greeter@local']"]:
    raise SystemExit('GDM keyfile changed; refusing update')
print('PASS: existing GDM settings preserved; no dconf changes planned')
PY
    grep -Fq 'const container = dialog?._backgroundGroup;' "$EXT/extension.js" || {
        echo 'Installed G1 is not the expected pre-G1.2.1 version; refusing' >&2
        exit 1
    }
    grep -Fq 'const container = Main.screenShield?._lockDialogGroup;' "$SOURCE/extension.js"
    grep -Fq 'container.insert_child_below(photo, dialog)' "$SOURCE/extension.js"
    node --input-type=module --check < "$SOURCE/extension.js"

    # Root-only recovery is published BEFORE the change to active code.
    install -d -m 700 "$BACKUP"
    cp -- "$EXT/extension.js" "$BACKUP/extension.js"
    chmod 600 "$BACKUP/extension.js"
    install -Dm 700 -- "$SOURCE/rollback-g121-in-guest.sh" "$ROLLBACK"

    TEMP="$(mktemp "$EXT/.extension-g121.XXXXXXXX")"
    trap 'if test -n "${TEMP:-}" && test -f "$TEMP"; then rm -f -- "$TEMP"; fi' EXIT
    cp -- "$SOURCE/extension.js" "$TEMP"
    chown root:root "$TEMP"
    chmod 644 "$TEMP"
    mv -T -- "$TEMP" "$EXT/extension.js"
    TEMP=''
    trap - EXIT

    echo
    echo 'PASS: Updated ONLY test VM GDM extension.js to G1.2.1.'
    echo 'Vendor profile, admin dconf, login and user lock extension unchanged.'
    echo 'Reboot the TEST VM to load the corrected photo actor.'
    echo "Recover the previous G1 photo source via: sudo $ROLLBACK"
)
