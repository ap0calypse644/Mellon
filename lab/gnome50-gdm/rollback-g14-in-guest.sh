#!/usr/bin/env bash
# Emergency G1.4 -> verified G1.3.1 rollback in the VM only.
# Root inside VM; never edit GDM authentication, dconf, or user extension.
(
    set -euo pipefail
    test "$(id -u)" -eq 0 || { echo 'Guest sudo required.' >&2; exit 1; }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1' || exit 1
    test "$(systemd-detect-virt)" != none || exit 1
    PARENT='/usr/share/gnome-shell/extensions'
    ACTIVE="$PARENT/mellon-greeter@local"
    OLD="$PARENT/.mellon-g14-previous-001"
    FAILED="$PARENT/.mellon-g14-failed-001"
    test -d "$OLD" && test ! -L "$OLD" || {
        echo 'Previous G1.3.1 extension missing; refusing rollback.' >&2
        exit 1
    }
    test -f "$OLD/extension.js" && test ! -L "$OLD/extension.js"
    test -f "$OLD/hud-layout.js" && test ! -L "$OLD/hud-layout.js"
    grep -Fq '[Mellon Greeter G1.3] enabled in gdm mode' "$OLD/extension.js" || {
        echo 'Recovery directory is NOT G1.3.1; refusing.' >&2
        exit 1
    }
    grep -Fq 'topLeft: {x: pad, y: 14,' "$OLD/hud-layout.js" || {
        echo 'Saved G1.3.1 layout not verified; refusing.' >&2
        exit 1
    }
    test ! -e "$FAILED" && test ! -L "$FAILED" || {
        echo 'G1.4 failed-build quarantine already exists; refusing overwrite.' >&2
        exit 1
    }
    if test -e "$ACTIVE" || test -L "$ACTIVE"; then
        test -d "$ACTIVE" && test ! -L "$ACTIVE" || exit 1
        test -f "$ACTIVE/extension.js" && test ! -L "$ACTIVE/extension.js"
        grep -Fq '[Mellon Greeter G1.4] enabled in gdm mode' "$ACTIVE/extension.js" || {
            echo 'Active extension is not G1.4; refusing automatic restore.' >&2
            exit 1
        }
        mv -T -- "$ACTIVE" "$FAILED"
        chmod 700 "$FAILED"
    fi
    mv -T -- "$OLD" "$ACTIVE"
    chmod 755 "$ACTIVE"
    echo 'PASS: test VM GDM reverted to visually approved G1.3.1.'
    echo 'G1.4 quarantined under .mellon-g14-failed-001 if present.'
    echo 'No GDM config changes. Reboot ONLY the VM to reload the greeter.'
)
