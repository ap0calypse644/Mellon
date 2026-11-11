#!/usr/bin/env bash
# Restore the latest pre-M7 extension strictly inside Mellon's GNOME 50 VM.
# Does NOT modify the BlackPearl host GNOME lock screen.
(
    set -euo pipefail
    virsh -c qemu:///system dominfo 'mellon-gnome50-lab' >/dev/null
    ssh -o BatchMode=yes mellon '
        test "$(id -un)" = test1 &&
        test "$(gnome-shell --version)" = "GNOME Shell 50.1"
    ' || { echo 'Unexpected guest; refusing rollback.' >&2; exit 1; }
    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    BACKUPS="$HOME/.local/state/mellon/backups"
    ROOT="$HOME/.local/share/gnome-shell/extensions"
    DEST="$ROOT/mellon-lab@local"
    test -d "$BACKUPS" && test ! -L "$BACKUPS"
    test -d "$DEST" && test ! -L "$DEST"
    latest="$(find "$BACKUPS" -mindepth 1 -maxdepth 1 \
        -type d -name 'pre-m7-*' -printf '%f\n' |
        LC_ALL=C sort | tail -n 1)"
    test -n "$latest" || { echo 'No M7 guest backup found.' >&2; exit 1; }
    SOURCE="$BACKUPS/$latest"
    test ! -L "$SOURCE" && test -f "$SOURCE/extension.js" &&
        test -f "$SOURCE/metadata.json" &&
        test -f "$SOURCE/library.json" ||
        { echo 'Previous VM extension backup incomplete.' >&2; exit 1; }
    FAILED="$BACKUPS/replaced-m7-$(date +%Y%m%d-%H%M%S)-$$"
    mv -- "$DEST" "$FAILED"
    if ! mv -- "$SOURCE" "$DEST"; then
        mv -- "$FAILED" "$DEST"
        echo 'Rollback failed, original guest extension restored.' >&2
        exit 1
    fi
    echo "PASS: guest M6.4/M7 extension restored from $SOURCE"
    echo "Replaced M7 retained at $FAILED"
)
GUEST
    echo 'NEXT: reboot ONLY mellon-gnome50-lab. Do NOT reboot BlackPearl.'
)
