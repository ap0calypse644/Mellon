#!/usr/bin/env bash
# Mellon G1.3 emergency recovery to visually approved G1.2.1. VM-only.
# Does not restart GDM, edit dconf, or change the user lock extension.
(
    set -euo pipefail
    test "$(id -u)" -eq 0 || { echo 'Requires guest sudo' >&2; exit 1; }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1' || exit 1
    test "$(systemd-detect-virt)" != none || exit 1
    PARENT='/usr/share/gnome-shell/extensions'
    EXT="$PARENT/mellon-greeter@local"
    OLD="$PARENT/.mellon-g13-previous-001"
    FAILED="$PARENT/.mellon-g13-failed-001"
    test -d "$OLD" && test ! -L "$OLD" || {
        echo 'Verified previous G1.2.1 directory missing; refusing.' >&2; exit 1;
    }
    test -f "$OLD/extension.js" && test ! -L "$OLD/extension.js"
    grep -Fq '[Mellon Greeter G1.2.1] enabled in gdm mode' "$OLD/extension.js" || {
        echo 'Backup does not match G1.2.1; refusing.' >&2; exit 1;
    }
    test ! -e "$FAILED" && test ! -L "$FAILED" || {
        echo 'Previous rollback quarantine exists; refusing overwrite.' >&2; exit 1;
    }
    if test -e "$EXT" || test -L "$EXT"; then
        test -d "$EXT" && test ! -L "$EXT" || exit 1
        test -f "$EXT/extension.js" && test ! -L "$EXT/extension.js"
        grep -Fq '[Mellon Greeter G1.3] enabled in gdm mode' "$EXT/extension.js" || {
            echo 'Active extension is not G1.3; refusing to replace.' >&2
            exit 1
        }
        mv -T -- "$EXT" "$FAILED"
        chmod 700 "$FAILED"
    fi
    # If the G1.3 installation was interrupted after moving EXT away,
    # this still restores G1.2.1 without relying on a login screen.
    mv -T -- "$OLD" "$EXT"
    chmod 755 "$EXT"
    echo 'PASS: GDM extension restored to working G1.2.1.'
    echo 'G1.3 quarantined in .mellon-g13-failed-001 (if present).'
    echo 'No GDM settings or user extension changed. Reboot ONLY test VM.'
)
