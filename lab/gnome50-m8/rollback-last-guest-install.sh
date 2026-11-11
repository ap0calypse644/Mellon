#!/usr/bin/env bash
# Restore the latest pre-M8 extension strictly inside Mellon's GNOME 50 VM.
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
        -type d -name 'pre-m8-*' -printf '%f\n' |
        LC_ALL=C sort | tail -n 1)"
    test -n "$latest" || { echo 'No M8 guest backup found.' >&2; exit 1; }
    SOURCE="$BACKUPS/$latest"
    test ! -L "$SOURCE" && test -f "$SOURCE/extension.js" &&
        test -f "$SOURCE/metadata.json" &&
        test -f "$SOURCE/library.json" ||
        { echo 'Previous VM extension backup incomplete.' >&2; exit 1; }
    FAILED="$BACKUPS/replaced-m8-$(date +%Y%m%d-%H%M%S)-$$"
    python3 - "$DEST/metadata.json" "$SOURCE/metadata.json" <<'PY'
import json,sys
current=json.load(open(sys.argv[1]))
previous=json.load(open(sys.argv[2]))
if not current.get("name","").startswith("Mellon M8"):
    raise SystemExit("Installed guest extension is not M8; refusing")
if not previous.get("name","").startswith(("Mellon M7.1","Mellon M8")):
    raise SystemExit("Backup is not a recognized M7.1/M8 extension")
if current.get("uuid")!="mellon-lab@local" or previous.get("uuid")!="mellon-lab@local":
    raise SystemExit("Unexpected extension UUID")
PY
    mv -- "$DEST" "$FAILED"
    if ! mv -- "$SOURCE" "$DEST"; then
        mv -- "$FAILED" "$DEST"
        echo 'Rollback failed, original guest extension restored.' >&2
        exit 1
    fi
    echo "PASS: previous Mellon guest extension restored from $SOURCE"
    echo "Replaced M8 retained at $FAILED"
)
GUEST
    echo 'NEXT: reboot ONLY mellon-gnome50-lab. Do NOT reboot BlackPearl.'
)
