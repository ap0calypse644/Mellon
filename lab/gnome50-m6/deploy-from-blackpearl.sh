#!/usr/bin/env bash
# M6 VM-only installer: NEVER install on BlackPearl's GNOME shell.
# Builds the six-scene pack from BlackPearl's already-verified local v9 JSON.
# Backs up currently working guest M6.0 before replacing it; guest reboot is manual.
(
    set -euo pipefail

    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    ROOT="$(cd -- "$HERE/../.." && pwd)"
    VM='mellon-gnome50-lab'
    UUID='mellon-lab@local'
    V9="$HOME/VMs/Mellon/constellation-quality-v9"
    PACK="${MELLON_M6_PACK:-$HOME/VMs/Mellon/m6-pilot-pack-v4}"
    PYTHON="${MELLON_PYTHON:-$HOME/.local/share/mellon-constellations-venv/bin/python}"
    STAGE_NAME=".mellon-m6-stage-$(date +%Y%m%d-%H%M%S)-$$"
    STAGING="$(mktemp -d "$HOME/VMs/Mellon/.m6-copy.XXXXXXXX")"
    trap 'rm -rf -- "$STAGING"' EXIT

    cd "$ROOT"
    echo 'MELLON M6.3 // GNOME 50.1 GUEST ONLY // HOST GNOME UNTOUCHED'
    if [[ ! -x "$PYTHON" ]]; then
        echo "Missing Mellon Python venv: $PYTHON" >&2
        exit 1
    fi
    for file in "$V9/matches-v9.json" "$V9/qa-index.json" \
                "$HERE/pilot-selection.json"; do
        test -f "$file" && test ! -L "$file" || {
            echo "Missing or linked verified input: $file" >&2; exit 1;
        }
    done
    test -d "$HOME/VMs/Mellon/checkpoints/MELLON-BASELINE-001" || {
        echo 'Missing verified Mellon VM baseline. Refusing deployment.' >&2
        exit 1
    }
    virsh -c qemu:///system dominfo "$VM" >/dev/null
    ssh -o BatchMode=yes mellon '
        test "$(id -un)" = test1 &&
        test "$(gnome-shell --version)" = "GNOME Shell 50.1" &&
        test ! -L "$HOME/.local/share/gnome-shell/extensions/mellon-lab@local"
    ' || { echo 'Guest identity/version check failed.' >&2; exit 1; }

    echo
    echo '=== VERIFY EXISTING SOURCE-ALIGNED v9 DATABASE (NO SEARCH) ==='
    BINARY="$HOME/.local/bin/mellon-constellation-quality-v9"
    test -x "$BINARY" || { echo "Missing verified v9 Go binary: $BINARY"; exit 1; }
    "$BINARY" \
        --corpus "$ROOT/assets/starfield/corpus-v1/catalogs" \
        --templates "$ROOT/tools/constellations/templates-v4-orion-bow.json" \
        --out "$V9" --verify-only

    if [[ ! -d "$PACK" ]]; then
        echo
        echo '=== BUILD SIX-SCENE SOURCE-PIXEL PACK ==='
        "$PYTHON" "$HERE/build-pilot-pack.py" \
            --index "$V9/qa-index.json" \
            --database "$V9/matches-v9.json" \
            --corpus "$ROOT/assets/starfield/corpus-v1/catalogs" \
            --out "$PACK"
    fi
    "$PYTHON" "$HERE/verify-pilot-pack.py" --pack "$PACK"

    echo
    echo '=== PREPARE CHECKSUMMED GUEST SOURCE (NO HOST EXTENSION EDITS) ==='
    for file in extension.js scene-data.js failure-tracker.js \
                metadata.json stylesheet.css; do
        test -f "$HERE/$file" && test ! -L "$HERE/$file" || {
            echo "Missing source file: $file" >&2; exit 1;
        }
        cp -- "$HERE/$file" "$STAGING/$file"
    done
    cp -a -- "$PACK/." "$STAGING/"

    # This is a visual-only upgrade: preserve the guest's previously chosen
    # fixed scene / random-on-lock setting rather than silently resetting it
    # to the new pack's default Blue Gold / Leo selection. Validate BEFORE
    # replacing any guest files; the source is JSON only, never executed.
    if ssh -o BatchMode=yes mellon \
        'test -f "$HOME/.local/share/gnome-shell/extensions/mellon-lab@local/scene-config.json"'; then
        ssh -o BatchMode=yes mellon \
            'cat "$HOME/.local/share/gnome-shell/extensions/mellon-lab@local/scene-config.json"' \
            > "$STAGING/.previous-scene-config.json"
        "$PYTHON" - "$STAGING/library.json" "$STAGING/.previous-scene-config.json" \
            "$STAGING/scene-config.json" <<'PY'
import json
import pathlib
import sys
library_path, old_path, output_path = map(pathlib.Path, sys.argv[1:])
ids = {scene['id'] for scene in json.loads(library_path.read_text())['scenes']}
previous = json.loads(old_path.read_text())
if previous.get('stages', 8) != 8:
    raise SystemExit('Guest M6 scene stages unexpectedly changed; refusing to reset')
if previous.get('mode') == 'random-on-lock':
    current = {'mode': 'random-on-lock', 'stages': 8}
elif previous.get('mode') == 'fixed' and previous.get('scene_id') in ids:
    current = {'mode': 'fixed', 'scene_id': previous['scene_id'], 'stages': 8}
else:
    raise SystemExit('Cannot safely preserve current guest M6 scene selection')
output_path.write_text(json.dumps(current, indent=2) + '\n')
print('Preserved guest M6 scene mode:', current['mode'])
PY
        rm -- "$STAGING/.previous-scene-config.json"
    fi

    if find "$STAGING" -type l -print -quit | grep -q .; then
        echo 'Symlink in M6 staging refused' >&2; exit 1;
    fi
    (
        cd "$STAGING"
        find . -type f ! -name 'checksums.sha256' -print0 |
            sort -z | xargs -0 sha256sum > checksums.sha256
        sha256sum -c checksums.sha256 >/dev/null
    )
    REMOTE_PARENT='.local/share/gnome-shell/extensions'
    ssh -o BatchMode=yes mellon \
        "mkdir -p '$REMOTE_PARENT/$STAGE_NAME'"
    tar --no-same-owner -C "$STAGING" -cf - . | \
        ssh -o BatchMode=yes mellon \
            "tar --no-same-owner -C '$REMOTE_PARENT/$STAGE_NAME' -xf -"

    ssh -o BatchMode=yes mellon \
        "cd '$REMOTE_PARENT/$STAGE_NAME' && sha256sum -c checksums.sha256"
    echo
    echo '=== BACK UP WORKING GUEST M6.2 AND INSTALL M6.3 ==='
    ssh -o BatchMode=yes mellon \
        "M6_STAGING='$STAGE_NAME' bash -s" <<'GUEST'
(
    set -euo pipefail
    ROOT="$HOME/.local/share/gnome-shell/extensions"
    DEST="$ROOT/mellon-lab@local"
    STAGE="$ROOT/$M6_STAGING"
    BACKUPS="$HOME/.local/state/mellon/backups"
    mkdir -p "$BACKUPS"
    test -d "$STAGE" && test ! -L "$STAGE"
    if [[ -e "$DEST" ]]; then
        test -d "$DEST" && test ! -L "$DEST"
        BACKUP="$BACKUPS/pre-m6-$(date +%Y%m%d-%H%M%S)-$$"
        mv -- "$DEST" "$BACKUP"
        echo "Rollback snapshot of previous guest extension: $BACKUP"
    else
        BACKUP=''
    fi
    if ! mv -- "$STAGE" "$DEST"; then
        if [[ -n "$BACKUP" && ! -e "$DEST" ]]; then
            mv -- "$BACKUP" "$DEST"
        fi
        echo 'M6 install failed; previous guest extension restored.' >&2
        exit 1
    fi
    test -f "$DEST/library.json" &&
    test -f "$DEST/extension.js" &&
    test -f "$DEST/scene-config.json"
    echo 'PASS: M6 installed in guest only; previous extension backed up.'
)
GUEST

    echo
    echo '=== VERIFY GUEST EXTENSION STILL ENABLED ==='
    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
    gsettings get org.gnome.shell enabled-extensions |
        grep -F "'mellon-lab@local'"
)
GUEST
    echo
    echo 'PASS: M6.3 copied and checksummed ONLY inside mellon-gnome50-lab.'
    echo 'NEXT: reboot the GUEST, never BlackPearl; lock the guest and test.'
    echo 'ROLLBACK: bash lab/gnome50-m5/deploy-from-blackpearl.sh'
)
