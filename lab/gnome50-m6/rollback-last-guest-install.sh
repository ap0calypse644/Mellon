#!/usr/bin/env bash
# Roll back the last Mellon VM-only extension installation to the latest
# retained pre-m6 backup. Never touches the BlackPearl host GNOME install.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    virsh -c qemu:///system dominfo "$VM" >/dev/null
    ssh -o BatchMode=yes mellon '
        test "$(id -un)" = test1 &&
        test "$(gnome-shell --version)" = "GNOME Shell 50.1"
    ' || { echo 'Unexpected VM identity/version. Refusing rollback.' >&2; exit 1; }

    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    BACKUPS="$HOME/.local/state/mellon/backups"
    ROOT="$HOME/.local/share/gnome-shell/extensions"
    DEST="$ROOT/mellon-lab@local"
    test -d "$DEST" && test ! -L "$DEST" || {
        echo 'Current guest Mellon extension missing or linked. Refusing.' >&2
        exit 1
    }
    test -d "$BACKUPS" && test ! -L "$BACKUPS" || {
        echo 'VM-only backup folder missing or linked. Refusing.' >&2
        exit 1
    }
    latest="$(find "$BACKUPS" -mindepth 1 -maxdepth 1 -type d -name 'pre-m6-*' \
        -printf '%f\n' | LC_ALL=C sort | tail -n 1)"
    test -n "$latest" || {
        echo 'No previous guest M6 backup available.' >&2
        exit 1
    }
    SOURCE="$BACKUPS/$latest"
    test -d "$SOURCE" && test ! -L "$SOURCE" &&
    test -f "$SOURCE/extension.js" &&
    test -f "$SOURCE/metadata.json" || {
        echo 'Previous VM extension backup is incomplete. Refusing.' >&2
        exit 1
    }
    FAILED="$BACKUPS/replaced-m6-$(date +%Y%m%d-%H%M%S)-$$"
    mv -- "$DEST" "$FAILED"
    if ! mv -- "$SOURCE" "$DEST"; then
        mv -- "$FAILED" "$DEST"
        echo 'Rollback failed; originally installed extension restored.' >&2
        exit 1
    fi
    echo "PASS: guest extension restored from $SOURCE"
    echo "Previous failed version preserved at $FAILED"
)
GUEST
    echo 'NEXT: reboot ONLY mellon-gnome50-lab; do not reboot BlackPearl.'
)
