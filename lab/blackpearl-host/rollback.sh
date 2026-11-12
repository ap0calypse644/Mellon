#!/usr/bin/env bash
# Emergency recovery of original BlackPearl GNOME/GDM from TTY.
# Run: sudo /usr/local/sbin/mellon-blackpearl-rollback
# NEVER restart GDM here; reboot separately AFTER recovery.
(
    set -euo pipefail
    test "$(id -u)" -eq 0
    test "$(hostname -s | tr '[:upper:]' '[:lower:]')" = blackpearl
    BACKUP='/var/backups/mellon-blackpearl/host-v1'
    test -f "$BACKUP/host-install-sentinel"
    grep -Fxq 'MELLON-BLACKPEARL-HOST-V1' "$BACKUP/host-install-sentinel"
    USERHOME="$(getent passwd ap0calypse | cut -d: -f6)"
    test -n "$USERHOME" && test -d "$USERHOME"
    LOCK="$USERHOME/.local/share/gnome-shell/extensions/mellon-lab@local"
    GDM='/usr/share/gnome-shell/extensions/mellon-greeter@local'
    PROFILE='/etc/dconf/profile/gdm'
    KEYFILE='/etc/dconf/db/gdm.d/95-mellon-greeter'
    DB='/etc/dconf/db/gdm'
    MARKER='/var/lib/mellon-blackpearl-host-v1'
    echo '========== BLACKPEARL EMERGENCY NATIVE GNOME RECOVERY =========='

    # Verify before moving any files; an unrelated admin's future changes
    # are never silently deleted by a stale rollback.
    if test -e "$GDM" || test -L "$GDM"; then
        test -d "$GDM" && test ! -L "$GDM"
        grep -Fq '"uuid": "mellon-greeter@local"' "$GDM/metadata.json"
    fi
    if test -e "$LOCK" || test -L "$LOCK"; then
        test -d "$LOCK" && test ! -L "$LOCK"
        grep -Fq '"uuid": "mellon-lab@local"' "$LOCK/metadata.json"
    fi
    if test -e "$PROFILE" || test -L "$PROFILE"; then
        test ! -L "$PROFILE"
        python3 - "$PROFILE" <<'PY'
import sys
from pathlib import Path
lines=[l.strip() for l in Path(sys.argv[1]).read_text().splitlines()
       if l.strip() and not l.lstrip().startswith('#')]
if lines!=['user-db:user','system-db:gdm',
           'file-db:/var/lib/gdm3/greeter-dconf-defaults']:
    raise SystemExit('GDM profile was changed after Mellon; manual review needed')
PY
    fi
    if test -e "$KEYFILE" || test -L "$KEYFILE"; then
        test ! -L "$KEYFILE"
        grep -Fxq "enabled-extensions=['mellon-greeter@local']" "$KEYFILE"
    fi
    for pair in "$GDM:gdm-quarantined" "$LOCK:lock-quarantined"; do
        from="${pair%%:*}"
        name="${pair#*:}"
        if test -e "$from"; then
            test ! -e "$BACKUP/$name" && test ! -L "$BACKUP/$name"
        fi
    done

    if test -e "$GDM"; then
        mv -- "$GDM" "$BACKUP/gdm-quarantined"
        echo 'Quarantined Mellon GDM extension'
    fi
    if test -e "$LOCK"; then
        mv -- "$LOCK" "$BACKUP/lock-quarantined"
        echo 'Quarantined Mellon lock-screen extension'
    fi
    if test -e "$KEYFILE"; then
        rm -- "$KEYFILE"
    fi
    if test -e "$PROFILE"; then
        rm -- "$PROFILE"
    fi
    if test -d /etc/dconf/db/gdm.d; then
        if test -z "$(find /etc/dconf/db/gdm.d -mindepth 1 -maxdepth 1 -print -quit)"; then
            rmdir /etc/dconf/db/gdm.d
        else
            echo 'WARNING: additional GDM admin files present; leaving directory.' >&2
        fi
    fi
    if test -f "$DB" || test -L "$DB"; then
        # This file did not exist before Mellon; its contents are compiled
        # solely from the generated admin keyfile, now removed.
        test ! -L "$DB"
        rm -- "$DB"
    fi
    if command -v dconf >/dev/null 2>&1; then
        dconf update
    fi
    if test -f "$MARKER"; then rm -- "$MARKER"; fi
    echo
    echo 'PASS: Original GNOME/GDM defaults restored on disk.'
    echo 'Reboot BlackPearl to fully unload Mellon from both GNOME processes.'
    echo 'If the session is running, optional cleanup after login:'
    echo '  gnome-extensions disable mellon-lab@local'
    echo 'NOTE: an orphan enabled-extension UUID is harmless with its files absent.'
)
