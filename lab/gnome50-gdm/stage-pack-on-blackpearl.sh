#!/usr/bin/env bash
# G1: prepare a LOCAL copy of the approved source-photo pack and extension.
# Absolutely no GNOME/GDM/system writes and no SSH to the guest.
(
    set -euo pipefail
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT="$(cd -- "$HERE/../.." && pwd)"
    PHOTO_PACK="$HOME/VMs/Mellon/m6-curated-12-v1"
    BASELINE="$HOME/VMs/Mellon/checkpoints/MELLON-GDM-PREINSTALL-001"
    STAGE_ROOT="$HOME/VMs/Mellon/gdm-stage"
    TARGET="$STAGE_ROOT/MELLON-G1-PREVIEW-001"
    PYTHON="$HOME/.local/share/mellon-constellations-venv/bin/python"

    echo '========== G1: PREPARE GREETER PACK (HOST FILES ONLY) =========='
    test -d "$PHOTO_PACK" && test ! -L "$PHOTO_PACK"
    test -d "$BASELINE" && test ! -L "$BASELINE" &&
        test -s "$BASELINE/SHA256SUMS" || {
        echo 'Verified GDM preinstall checkpoint missing: refusing stage' >&2
        exit 1
    }
    test -x "$PYTHON" || { echo "Missing photo pack venv: $PYTHON" >&2; exit 1; }
    if find "$PHOTO_PACK" -type l -print -quit | grep -q .; then
        echo 'Symlink found in photo assets; refusing unsafe staging' >&2
        exit 1
    fi
    test -f "$HERE/greeter-extension/extension.js" &&
        test -f "$HERE/greeter-extension/metadata.json" || {
        echo 'Missing greeter source' >&2; exit 1;
    }
    test -f "$PROJECT/lab/gnome50-m8/scene-data.js" || exit 1

    "$PYTHON" "$PROJECT/lab/gnome50-m6/verify-pilot-pack.py" \
        --pack "$PHOTO_PACK"

    mkdir -p -- "$STAGE_ROOT"
    test ! -L "$STAGE_ROOT" || {
        echo 'Staging parent is a symlink; refusing' >&2; exit 1;
    }
    if test -e "$TARGET" || test -L "$TARGET"; then
        echo "Already exists, will not overwrite: $TARGET" >&2
        exit 1
    fi

    STAGING="$(mktemp -d "$STAGE_ROOT/.g1-build.XXXXXXXX")"
    cleanup() { if test -n "${STAGING:-}"; then rm -rf -- "$STAGING"; fi; }
    trap cleanup EXIT
    chmod 700 "$STAGING"

    cp -a -- "$PHOTO_PACK/." "$STAGING/"
    cp -- "$HERE/greeter-extension/extension.js" "$STAGING/extension.js"
    cp -- "$HERE/greeter-extension/metadata.json" "$STAGING/metadata.json"
    cp -- "$PROJECT/lab/gnome50-m8/scene-data.js" "$STAGING/scene-data.js"

    node --input-type=module --check < "$STAGING/extension.js"
    node --input-type=module --check < "$STAGING/scene-data.js"

    python3 - "$STAGING" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1])
lib=json.loads((root/'library.json').read_text())
meta=json.loads((root/'metadata.json').read_text())
assert lib['schema']=='mellon-m6-scene-library-v1'
assert len(lib['scenes'])==12
assert meta['uuid']=='mellon-greeter@local'
assert meta['session-modes']==['gdm']
assert meta['shell-version']==['50']
for scene in lib['scenes']:
    for rel in [scene['image'],*scene['sprites']]:
        p=root/rel
        if not p.is_file() or p.is_symlink():
            raise SystemExit(f'Missing or linked vetted photo asset: {rel}')
print('PASS: exactly 12 vetted scenes, all photos/sprites present')
PY

    (
        cd "$STAGING"
        find . -type f ! -name SHA256SUMS -print0 |
            LC_ALL=C sort -z |
            xargs -0 sha256sum > SHA256SUMS
        sha256sum -c SHA256SUMS
    )
    chmod -R a+rX,go-w -- "$STAGING"
    mv -T -- "$STAGING" "$TARGET"
    STAGING=''

    echo
    echo "PASS: safe G1 greeter bundle prepared at: $TARGET"
    echo 'GDM NOT MODIFIED. No VM files written. No extensions enabled.'
    echo 'Next: review the guest greeter activation and safe rollback.'
)
