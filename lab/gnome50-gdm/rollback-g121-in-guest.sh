#!/usr/bin/env bash
# Restore the original G1 greeter extension.js; do not alter dconf.
# Guest root in mellon-gnome50-lab ONLY.
(
    set -euo pipefail
    test "$(id -u)" -eq 0 || exit 1
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1' || exit 1
    test "$(systemd-detect-virt)" != none || exit 1
    EXT='/usr/share/gnome-shell/extensions/mellon-greeter@local'
    OLD='/var/lib/mellon-greeter-g121-backup/extension.js'
    NEW="$EXT/extension.js"
    test -d "$EXT" && test ! -L "$EXT" || exit 1
    test -f "$OLD" && test ! -L "$OLD" || exit 1
    test -f "$NEW" && test ! -L "$NEW" || exit 1
    grep -Fq 'const container = dialog?._backgroundGroup;' "$OLD" || {
        echo 'Unexpected saved old G1 extension: refusing.' >&2; exit 1;
    }
    grep -Fq 'const container = Main.screenShield?._lockDialogGroup;' "$NEW" || {
        echo 'Unexpected running greeter extension: refusing.' >&2; exit 1;
    }
    # Restore only the known original source (checked by signature).
    TMP="$(mktemp "$EXT/.restore-g121.XXXXXXXX")"
    trap 'if test -n "${TMP:-}" && test -f "$TMP"; then rm -f -- "$TMP"; fi' EXIT
    cp -- "$OLD" "$TMP"
    chown root:root "$TMP"
    chmod 644 "$TMP"
    mv -T -- "$TMP" "$NEW"
    TMP=''
    trap - EXIT
    echo 'PASS: Restored original G1 greeter extension.js.'
    echo 'No GDM settings modified. Reboot the TEST VM to reload.'
)
