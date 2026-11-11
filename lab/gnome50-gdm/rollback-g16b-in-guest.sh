#!/usr/bin/env bash
# G1.6B emergency restore of visually approved G1.6A.1 VM greeter.
(
    set -euo pipefail
    test "$(id -u)" -eq 0 || { echo 'Guest sudo required.' >&2; exit 1; }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    test "$(systemd-detect-virt)" != none
    PARENT='/usr/share/gnome-shell/extensions'
    ACTIVE="$PARENT/mellon-greeter@local"
    PREVIOUS="$PARENT/.mellon-g16b-previous-001"
    QUARANTINE="$PARENT/.mellon-g16b-failed-001"
    test -d "$PREVIOUS" && test ! -L "$PREVIOUS" || {
        echo 'Previous G1.6A.1 greeter directory missing.' >&2; exit 1;
    }
    test -f "$PREVIOUS/extension.js" && test ! -L "$PREVIOUS/extension.js"
    grep -Fq '[Mellon Greeter G1.6A.1] enabled in gdm mode' "$PREVIOUS/extension.js" || {
        echo 'Previous directory does not contain G1.6A.' >&2; exit 1;
    }
    test -f "$PREVIOUS/hud-layout.js"
    grep -Fq 'topLeft: {x: pad, y: 14,' "$PREVIOUS/hud-layout.js"
    test ! -e "$QUARANTINE" && test ! -L "$QUARANTINE" || {
        echo 'Existing G1.6B quarantine detected; refusing overwrite.' >&2
        exit 1
    }
    if test -e "$ACTIVE" || test -L "$ACTIVE"; then
        test -d "$ACTIVE" && test ! -L "$ACTIVE" || exit 1
        test -f "$ACTIVE/extension.js" && test ! -L "$ACTIVE/extension.js"
        grep -Fq '[Mellon Greeter G1.6B] enabled in gdm mode' "$ACTIVE/extension.js" || {
            echo 'Active greeter is not G1.6B; refusing unsafe rollback.' >&2
            exit 1
        }
        mv -T -- "$ACTIVE" "$QUARANTINE"
        chmod 700 "$QUARANTINE"
    fi
    # Also repairs interruption after the installer moved ACTIVE away.
    mv -T -- "$PREVIOUS" "$ACTIVE"
    chmod 755 "$ACTIVE"
    echo 'PASS: recovered G1.6A.1 visual greeter on the test VM.'
    echo 'G1.6B quarantined in .mellon-g16b-failed-001 if present.'
    echo 'Reboot ONLY the VM. No authentication or dconf changes.'
)
