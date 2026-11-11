#!/usr/bin/env bash
# G1.3.1 emergency recovery to original G1.3 HUD placement in TEST VM.
(
    set -euo pipefail
    test "$(id -u)" -eq 0 || { echo 'Guest sudo required' >&2; exit 1; }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    test "$(systemd-detect-virt)" != none
    EXT='/usr/share/gnome-shell/extensions/mellon-greeter@local'
    OLD='/var/lib/mellon-g131-backup/hud-layout.js'
    CURRENT="$EXT/hud-layout.js"
    test -d "$EXT" && test ! -L "$EXT" || exit 1
    test -f "$OLD" && test ! -L "$OLD" || exit 1
    test -f "$CURRENT" && test ! -L "$CURRENT" || exit 1
    grep -Fq '[Mellon Greeter G1.3] enabled in gdm mode' "$EXT/extension.js" || exit 1
    grep -Fq 'topLeft: {x: pad, y: Math.max(78, recovery.y + recovery.height + 12)' "$OLD" || {
        echo 'Stored original layout not recognized; refusing.' >&2; exit 1;
    }
    grep -Fq 'topLeft: {x: pad, y: 14,' "$CURRENT" || {
        echo 'Active G1.3.1 layout not recognized; refusing.' >&2; exit 1;
    }

    TEMP="$(mktemp "$EXT/.restore-g131.XXXXXXXX")"
    trap 'if test -n "${TEMP:-}" && test -f "$TEMP"; then rm -f -- "$TEMP"; fi' EXIT
    install -m 644 -- "$OLD" "$TEMP"
    chown root:root "$TEMP"
    mv -T -- "$TEMP" "$CURRENT"
    TEMP=''
    trap - EXIT
    echo 'PASS: restored previous G1.3 HUD layout in isolated test VM.'
    echo 'No dconf or GDM authentication changes. Reboot only the VM.'
)
