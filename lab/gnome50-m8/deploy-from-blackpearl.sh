#!/usr/bin/env bash
# Mellon M8.1: install ONLY in mellon-gnome50-lab, never BlackPearl host GNOME.
# Reuses the user's already-verified and user-tested M6.4 photo pack; NO search.
(
    set -euo pipefail

    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    ROOT="$(cd -- "$HERE/../.." && pwd)"
    VM='mellon-gnome50-lab'
    DEST='.local/share/gnome-shell/extensions/mellon-lab@local'
    PACK="${MELLON_M8_PACK:-$HOME/VMs/Mellon/m6-curated-12-v1}"
    PYTHON="${MELLON_PYTHON:-$HOME/.local/share/mellon-constellations-venv/bin/python}"
    STAGE_NAME=".mellon-m8-stage-$(date +%Y%m%d-%H%M%S)-$$"
    STAGING="$(mktemp -d "$HOME/VMs/Mellon/.m8-copy.XXXXXXXX")"
    trap 'rm -rf -- "$STAGING"' EXIT

    echo 'MELLON M8.1 // GNOME 50.1 TEST VM ONLY // BLACKPEARL HOST UNTOUCHED'
    cd "$ROOT"
    test -d "$PACK" && test ! -L "$PACK" || {
        echo "Missing tested M6.4 image pack: $PACK" >&2; exit 1;
    }
    test -x "$PYTHON" || { echo "Missing Mellon Python venv: $PYTHON" >&2; exit 1; }
    test -d "$HOME/VMs/Mellon/checkpoints/MELLON-BASELINE-001" || {
        echo 'Missing verified VM baseline; refusing M8 install.' >&2; exit 1;
    }
    virsh -c qemu:///system dominfo "$VM" >/dev/null
    ssh -o BatchMode=yes mellon '
        test "$(id -un)" = test1 &&
        test "$(gnome-shell --version)" = "GNOME Shell 50.1" &&
        test ! -L "$HOME/.local/share/gnome-shell/extensions/mellon-lab@local"
    ' || { echo 'Guest identity/version mismatch; refusing.' >&2; exit 1; }

    echo
    echo '=== VERIFY EXISTING TESTED M6.4 PHOTO ASSETS (NO SEARCH/REBUILD) ==='
    "$PYTHON" "$ROOT/lab/gnome50-m6/verify-pilot-pack.py" --pack "$PACK"

    echo
    echo '=== CONFIRM THE VM IS RUNNING THE SAME M6.4 LIBRARY ==='
    EXPECTED="$(sha256sum "$PACK/library.json" | cut -d ' ' -f 1)"
    INSTALLED="$(ssh -o BatchMode=yes mellon "sha256sum '$DEST/library.json'" |
        cut -d ' ' -f 1)"
    if [[ "$EXPECTED" != "$INSTALLED" ]]; then
        echo 'Guest scene library differs from the approved M6.4 pack; refusing.' >&2
        exit 1
    fi
    ssh -o BatchMode=yes mellon 'python3 -' <<'PY'
import json
from pathlib import Path
p=Path.home()/".local/share/gnome-shell/extensions/mellon-lab@local/metadata.json"
meta=json.loads(p.read_text())
if meta.get("uuid") != "mellon-lab@local" or not (
    meta.get("name","").startswith("Mellon M7.1") or
    meta.get("name","").startswith("Mellon M8")
):
    raise SystemExit("Not an approved Mellon M6.4/M8 test extension")
print("PASS: Known-good Mellon guest extension identity")
PY

    echo
    echo '=== BUILD CHECKSUMMED M7 GUEST STAGING AREA ==='
    cp -a -- "$PACK/." "$STAGING/"
    for file in extension.js stellar-effects.js scene-data.js \
                failure-tracker.js metadata.json stylesheet.css \
                observatory-hud.js hud-state.js hud-layout.js; do
        test -f "$HERE/$file" && test ! -L "$HERE/$file" || {
            echo "Missing/linked M8 source: $file" >&2; exit 1;
        }
        cp -- "$HERE/$file" "$STAGING/$file"
    done

    # Persist the user's manual/fixed or random-on-lock choice; validate the
    # JSON against the approved M6.4 library. Never copy passwords/tokens.
    ssh -o BatchMode=yes mellon "cat '$DEST/scene-config.json'" \
        > "$STAGING/scene-config.json"
    "$PYTHON" - "$STAGING/library.json" "$STAGING/scene-config.json" <<'PY'
import json,sys
lib=json.load(open(sys.argv[1]))
cfg=json.load(open(sys.argv[2]))
ids={scene["id"] for scene in lib["scenes"]}
if lib.get("schema")!="mellon-m6-scene-library-v1" or len(ids)!=12:
    raise SystemExit("Unexpected M8 library")
if cfg.get("stages")!=8 or cfg.get("mode") not in ("fixed","random-on-lock"):
    raise SystemExit("Unsafe or unsupported existing guest scene mode")
if cfg["mode"]=="fixed" and cfg.get("scene_id") not in ids:
    raise SystemExit("Fixed scene not included in approved twelve")
print("Preserving installed VM scene selection:",cfg["mode"])
PY

    if find "$STAGING" -type l -print -quit | grep -q .; then
        echo 'Refusing symlink inside M8 VM upload.' >&2; exit 1;
    fi
    (
        cd "$STAGING"
        find . -type f ! -name 'checksums.sha256' -print0 |
            sort -z | xargs -0 sha256sum > checksums.sha256
        sha256sum -c checksums.sha256 >/dev/null
    )

    ssh -o BatchMode=yes mellon \
        "mkdir -p '.local/share/gnome-shell/extensions/$STAGE_NAME'"
    tar --no-same-owner -C "$STAGING" -cf - . | \
        ssh -o BatchMode=yes mellon \
            "tar --no-same-owner -C '.local/share/gnome-shell/extensions/$STAGE_NAME' -xf -"
    ssh -o BatchMode=yes mellon \
        "cd '.local/share/gnome-shell/extensions/$STAGE_NAME' && sha256sum -c checksums.sha256"

    echo
    echo '=== BACK UP CURRENT GUEST M7.1/M8 AND INSTALL M8.1 (ATOMIC RENAME) ==='
    ssh -o BatchMode=yes mellon \
        "M8_STAGING='$STAGE_NAME' bash -s" <<'GUEST'
(
    set -euo pipefail
    ROOT="$HOME/.local/share/gnome-shell/extensions"
    DEST="$ROOT/mellon-lab@local"
    STAGE="$ROOT/$M8_STAGING"
    BACKUPS="$HOME/.local/state/mellon/backups"
    mkdir -p "$BACKUPS"
    test -d "$STAGE" && test ! -L "$STAGE"
    test -d "$DEST" && test ! -L "$DEST"
    BACKUP="$BACKUPS/pre-m8-$(date +%Y%m%d-%H%M%S)-$$"
    mv -- "$DEST" "$BACKUP"
    if ! mv -- "$STAGE" "$DEST"; then
        mv -- "$BACKUP" "$DEST"
        echo 'M8 install failed; working guest extension restored.' >&2
        exit 1
    fi
    test -f "$DEST/stellar-effects.js" && test -f "$DEST/library.json" &&
        test -f "$DEST/observatory-hud.js" && test -f "$DEST/hud-layout.js"
    echo "PASS: Working previous extension retained in guest: $BACKUP"
)
GUEST

    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
    gsettings get org.gnome.shell enabled-extensions |
        grep -F "'mellon-lab@local'"
)
GUEST
    echo
    echo 'PASS: Installed M8.1 and the unchanged twelve-scene photographs in TEST VM ONLY.'
    echo 'NEXT: reboot ONLY mellon-gnome50-lab, then test locking/unlocking.'
    echo 'ROLLBACK: bash lab/gnome50-m7/rollback-last-guest-install.sh'
)
