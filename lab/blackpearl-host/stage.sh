#!/usr/bin/env bash
# BLACKPEARL-ONLY. Build checksum-verified production bundles in user HOME.
# Does not enable/modify GNOME or GDM; requires approved local photo corpus.
(
    set -euo pipefail
    USER_NAME="$(id -un)"
    test "$USER_NAME" = ap0calypse
    test "$(id -u)" -eq 1000
    HOST="$(hostname -s | tr '[:upper:]' '[:lower:]')"
    test "$HOST" = blackpearl
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    ROOT="$(cd -- "$HERE/../.." && pwd)"
    M8="$ROOT/lab/gnome50-m8"
    GDM="$ROOT/lab/gnome50-gdm/greeter-extension"
    PACK="$HOME/VMs/Mellon/m6-curated-12-v1"
    TARGET="$HOME/.local/state/mellon-blackpearl/stage-v1"
    PARENT="$(dirname -- "$TARGET")"
    test -d "$PACK" && test ! -L "$PACK"
    test -f "$PACK/library.json"
    test -d "$M8" && test -d "$GDM"
    test ! -e "$TARGET" && test ! -L "$TARGET" || {
        echo 'Existing immutable BlackPearl stage; refusing replacement.' >&2
        exit 1
    }

    echo '========== APPROVED VETTED PHOTO CORPUS =========='
    PYTHON="$HOME/.local/share/mellon-constellations-venv/bin/python"
    test -x "$PYTHON"
    "$PYTHON" "$ROOT/lab/gnome50-m6/verify-pilot-pack.py" --pack "$PACK"
    if find "$PACK" -type l -print -quit | grep -q .; then
        echo 'Symlink in photographic scene pack; refusing.' >&2
        exit 1
    fi
    PHOTO_SHA="$(sha256sum "$PACK/library.json" | cut -d' ' -f1)"
    echo "Local approved library SHA256: $PHOTO_SHA"

    echo
    echo '========== VERIFY SAME PACK IN TESTED MELLON VM =========='
    VM_LOCK="$(ssh -o BatchMode=yes mellon \
        'sha256sum "$HOME/.local/share/gnome-shell/extensions/mellon-lab@local/library.json"' | awk '{print $1}')"
    VM_GDM="$(ssh -o BatchMode=yes mellon \
        'sha256sum /usr/share/gnome-shell/extensions/mellon-greeter@local/library.json' | awk '{print $1}')"
    test "$PHOTO_SHA" = "$VM_LOCK" && test "$PHOTO_SHA" = "$VM_GDM" || {
        echo "VM/source photographic library mismatch: lock=$VM_LOCK gdm=$VM_GDM" >&2
        exit 1
    }
    echo 'PASS: same curated constellation library as tested VM'
    ssh -o BatchMode=yes mellon 'python3 -' <<'PY'
import json
from pathlib import Path
home=Path.home()
lock=json.loads((home/'.local/share/gnome-shell/extensions/mellon-lab@local/metadata.json').read_text())
gdm=json.loads(Path('/usr/share/gnome-shell/extensions/mellon-greeter@local/metadata.json').read_text())
if not lock['name'].startswith('Mellon M8.4'):
    raise SystemExit('VM unlock screen is not validated M8.4')
if not gdm['name'].startswith('Mellon Greeter G1.8'):
    raise SystemExit('VM GDM greeter is not validated G1.8')
print('PASS: exact approved M8.4/G1.8 versions installed in test VM')
PY

    echo
    echo '========== CURRENT G1.8 / M8.4 REGRESSIONS =========='
    node "$ROOT/lab/gnome50-gdm/test-g18-hud-runtime.mjs"
    node "$ROOT/lab/gnome50-gdm/test-g18-deploy.mjs"
    node "$ROOT/lab/gnome50-gdm/test-g17-parity-performance.mjs"
    node "$M8/test-m8-regression.mjs"
    node "$M8/test-mapping.mjs"
    node "$M8/test-intro-runtime.mjs"

    mkdir -p -- "$PARENT"
    test ! -L "$PARENT"
    BUILD="$(mktemp -d "$PARENT/.mellon-host-build.XXXXXXXX")"
    trap 'if test -n "${BUILD:-}" && test -d "$BUILD"; then rm -rf -- "$BUILD"; fi' EXIT
    mkdir -p "$BUILD/gdm" "$BUILD/lock"
    cp -a -- "$PACK/." "$BUILD/gdm/"
    cp -a -- "$PACK/." "$BUILD/lock/"
    for f in "$GDM"/*.js "$GDM"/stylesheet.css "$GDM"/metadata.json; do
        test -f "$f" && test ! -L "$f"
        cp -- "$f" "$BUILD/gdm/"
    done
    for f in extension.js metadata.json stylesheet.css \
        scene-data.js stellar-effects.js failure-tracker.js \
        hud-state.js hud-layout.js hud-progress.js \
        observatory-hud.js observatory-intro.js hud-intro-state.js; do
        test -f "$M8/$f" && test ! -L "$M8/$f"
        cp -- "$M8/$f" "$BUILD/lock/$f"
    done

    echo
    echo '========== PRESERVE TESTED VM SCENE PREFERENCE =========='
    ssh -o BatchMode=yes mellon \
        'cat "$HOME/.local/share/gnome-shell/extensions/mellon-lab@local/scene-config.json"' \
        > "$BUILD/lock/scene-config.json"

    python3 - "$BUILD" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1])
sources=[]
for mode in ('gdm','lock'):
    p=root/mode
    meta=json.loads((p/'metadata.json').read_text())
    lib=json.loads((p/'library.json').read_text())
    assert meta['uuid']==('mellon-greeter@local' if mode=='gdm' else 'mellon-lab@local')
    assert meta['session-modes']==(['gdm'] if mode=='gdm' else ['unlock-dialog'])
    assert meta['shell-version']==['50']
    assert lib['schema']=='mellon-m6-scene-library-v1'
    assert len(lib['scenes'])==12
    for scene in lib['scenes']:
        for rel in [scene['image'],*scene['sprites']]:
            assert rel.startswith('assets/') and '..' not in Path(rel).parts
            file=p/rel
            assert file.is_file() and not file.is_symlink()
    for file in p.rglob('*'):
        if file.is_symlink():
            raise SystemExit('Unsafe symlink in bundled sources: '+str(file))
    # Display metadata honestly. The source code itself is untouched.
    meta['name']=meta['name'].replace('VM only','BlackPearl')
    meta['description']=meta['description'].replace('VM only','BlackPearl')
    (p/'metadata.json').write_text(json.dumps(meta,indent=2)+'\n')
    sources.append(meta['name'])
config=json.loads((root/'lock'/'scene-config.json').read_text())
ids={scene['id'] for scene in json.loads((root/'lock'/'library.json').read_text())['scenes']}
assert config['stages']==8 and config['mode'] in ('fixed','random-on-lock')
if config['mode']=='fixed':
    assert config['scene_id'] in ids
assert (root/'gdm'/'hud-progress.js').read_bytes()==(root/'lock'/'hud-progress.js').read_bytes()
print('PASS: validated two complete source-photo bundles and fixed/random mode')
print('Lock scene preference:',config['mode'])
print('Variants:',*sources,sep='\n  ')
PY
    for bundle in gdm lock; do
        for js in "$BUILD/$bundle"/*.js; do
            node --input-type=module --check < "$js"
        done
    done
    for target in gdm lock; do
        (
            cd "$BUILD/$target"
            find . -type f ! -name SHA256SUMS -print0 | sort -z |
                xargs -0 sha256sum > SHA256SUMS
            sha256sum -c SHA256SUMS >/dev/null
        )
    done
    (cd "$BUILD" &&
      sha256sum gdm/SHA256SUMS lock/SHA256SUMS > BUNDLE-SHA256SUMS &&
      sha256sum -c BUNDLE-SHA256SUMS)
    chmod -R a+rX,go-w "$BUILD"
    mv -T -- "$BUILD" "$TARGET"
    BUILD=''
    echo
    echo "PASS: staged two complete audited bundles at $TARGET"
    echo 'NO changes to the host lock, extensions, GDM or login.'
)
