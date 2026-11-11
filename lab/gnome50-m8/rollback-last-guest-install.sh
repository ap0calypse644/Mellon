#!/usr/bin/env bash
# Restore the latest pre-M8 extension strictly inside Mellon's GNOME 50 VM.
# Does NOT modify the BlackPearl host GNOME lock screen.
(
    set -euo pipefail
    MODE="${1:-latest}"
    case "$MODE" in
        latest|m7.1|m8.1|m8.2|m8.3.1) ;;
        *) echo 'Usage: rollback-last-guest-install.sh [latest|m7.1|m8.1|m8.2|m8.3.1]' >&2; exit 2 ;;
    esac
    virsh -c qemu:///system dominfo 'mellon-gnome50-lab' >/dev/null
    ssh -o BatchMode=yes mellon '
        test "$(id -un)" = test1 &&
        test "$(gnome-shell --version)" = "GNOME Shell 50.1"
    ' || { echo 'Unexpected guest; refusing rollback.' >&2; exit 1; }
    ssh -o BatchMode=yes mellon "M8_ROLLBACK_MODE='$MODE' bash -s" <<'GUEST'
(
    set -euo pipefail
    BACKUPS="$HOME/.local/state/mellon/backups"
    ROOT="$HOME/.local/share/gnome-shell/extensions"
    DEST="$ROOT/mellon-lab@local"
    test -d "$BACKUPS" && test ! -L "$BACKUPS"
    test -d "$DEST" && test ! -L "$DEST"
    if [[ "$M8_ROLLBACK_MODE" == 'm7.1' ||
          "$M8_ROLLBACK_MODE" == 'm8.1' ||
          "$M8_ROLLBACK_MODE" == 'm8.2' ||
          "$M8_ROLLBACK_MODE" == 'm8.3.1' ]]; then
        # Explicit version selection avoids restoring an intermediate
        # broken M8.2 revision after repeated guest-only deployments.
        latest="$(python3 - "$BACKUPS" <<'PY'
import json,os,sys
from pathlib import Path
root=Path(sys.argv[1])
matches=[]
for folder in root.glob('pre-m8-*'):
    if not folder.is_dir() or folder.is_symlink():
        continue
    meta=folder/'metadata.json'
    if not meta.is_file() or meta.is_symlink():
        continue
    try:
        data=json.loads(meta.read_text())
    except (ValueError,OSError):
        continue
    if data.get('uuid') != 'mellon-lab@local':
        continue
    mode = os.environ.get('M8_ROLLBACK_MODE')
    if mode == 'm7.1' and data.get('name','').startswith('Mellon M7.1'):
        matches.append(folder.name)
    elif mode == 'm8.2' and data.get('name','').startswith('Mellon M8.2'):
        # Restore the visually accepted M8.2, not an intermediate M8.1
        # or M8.3. Require mapping logic and original GNOME 50 resize fix.
        hud = folder / 'observatory-hud.js'
        progress = folder / 'hud-progress.js'
        if (hud.is_file() and not hud.is_symlink() and
                progress.is_file() and not progress.is_symlink() and
                "this.actor.connect('notify::width'" in hud.read_text() and
                not (folder / 'observatory-intro.js').exists()):
            matches.append(folder.name)
    elif mode == 'm8.3.1' and data.get('name','').startswith('Mellon M8.3.1'):
        # Restore the exact user-accepted one-shot grid, never a later
        # repeating version or older corner-only scanner.
        renderer = folder / 'observatory-intro.js'
        envelope = folder / 'hud-intro-state.js'
        if (renderer.is_file() and not renderer.is_symlink() and
                envelope.is_file() and not envelope.is_symlink()):
            js = renderer.read_text()
            helper = envelope.read_text()
            if ('new St.DrawingArea({' in js and
                    'INTRO_DURATION_MS = 1850' in helper and
                    'INTRO_REPEAT_MS' not in helper and
                    '_repeatTimerId' not in js):
                matches.append(folder.name)
    elif mode == 'm8.1' and data.get('name','').startswith('Mellon M8.1'):
        # The earlier broken M8.1 had an unsupported GNOME 50 signal,
        # even though the metadata carries the same version number.
        source = folder / 'observatory-hud.js'
        if source.is_file() and not source.is_symlink():
            js = source.read_text()
            if ("this.actor.connect('notify::width'" in js and
                    "this.actor.connect('notify::height'" in js and
                    "'allocation-changed'," not in js):
                matches.append(folder.name)
if not matches:
    raise SystemExit('No verified matching guest backup found; refusing rollback')
print(sorted(matches)[-1])
PY
        )"
    else
        latest="$(find "$BACKUPS" -mindepth 1 -maxdepth 1 \
            -type d -name 'pre-m8-*' -printf '%f\n' |
            LC_ALL=C sort | tail -n 1)"
    fi
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
