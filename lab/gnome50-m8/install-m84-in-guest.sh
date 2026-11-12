#!/usr/bin/env bash
# M8.4: reversible user-level VM lock-screen patch, no sudo or PAM edits.
(
    set -euo pipefail
    test "$(id -un)" = test1 && test "$(id -u)" -eq 1000
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    test "$(systemd-detect-virt)" != none
    ROOT="$HOME/.local/share/gnome-shell/extensions"
    EXT="$ROOT/mellon-lab@local"
    BACKUP="$ROOT/.mellon-m84-previous-001"
    QUARANTINE="$ROOT/.mellon-m84-failed-001"
    DIR="$HOME/.local/state/mellon/m84-incoming-001"
    FILES=(extension.js metadata.json hud-progress.js
           observatory-hud.js observatory-intro.js)
    test -d "$EXT" && test ! -L "$EXT"
    test -d "$DIR" && test ! -L "$DIR"
    test ! -e "$BACKUP" && test ! -L "$BACKUP"
    test ! -e "$QUARANTINE" && test ! -L "$QUARANTINE"
    test "$(stat -c %U "$EXT" "$DIR" | sort -u)" = test1
    (cd "$DIR" && sha256sum -c SHA256SUMS)

    python3 - "$EXT" "$DIR" <<'PY'
import json,sys
from pathlib import Path
old,stage=map(Path,sys.argv[1:])
before=json.loads((old/'metadata.json').read_text())
after=json.loads((stage/'metadata.json').read_text())
for m in [before,after]:
    assert m['uuid']=='mellon-lab@local'
    assert m['shell-version']==['50']
    assert m['session-modes']==['unlock-dialog']
assert before['name'].startswith('Mellon M8.3.2')
assert after['name'].startswith('Mellon M8.4')
expected={'extension.js','metadata.json','hud-progress.js',
    'observatory-hud.js','observatory-intro.js',
    'install-m84-in-guest.sh','rollback-m84-in-guest.sh','SHA256SUMS'}
assert {p.name for p in stage.iterdir()}==expected
library=json.loads((old/'library.json').read_text())
assert library['schema']=='mellon-m6-scene-library-v1'
assert len(library['scenes'])==12
for scene in library['scenes']:
    for rel in [scene['image'],*scene['sprites']]:
        assert rel.startswith('assets/') and '..' not in Path(rel).parts
        assert (old/rel).is_file() and not (old/rel).is_symlink()
for file in ['scene-config.json','scene-data.js','stellar-effects.js',
    'failure-tracker.js','hud-state.js','hud-intro-state.js']:
    assert (old/file).is_file() and not (old/file).is_symlink()
PY
    grep -Fq 'this._hud?.cancelIntro();' "$EXT/extension.js"
    grep -Fq 'this._bufferSignalId = buffer.connect(' "$DIR/extension.js"
    ! grep -Fq 'this._hud?.cancelIntro();' "$DIR/extension.js"
    grep -Fq 'mappingReadout(' "$DIR/observatory-hud.js"
    grep -Fq 'stagePulseStrength(' "$DIR/observatory-hud.js"
    grep -Fq 'STAGE_PULSE_SEC = 0.56' "$DIR/hud-progress.js"
    grep -Fq 'this._everStarted = true' "$DIR/observatory-intro.js"
    if find "$EXT" -type l -print -quit | grep -q .; then
        echo 'Refusing links in approved lock extension.' >&2
        exit 1
    fi

    NEXT="$(mktemp -d "$ROOT/.mellon-m84-next.XXXXXXXX")"
    recover() {
        status=$?
        if ((status != 0)) && test ! -e "$EXT" && test -d "$BACKUP"; then
            mv -T -- "$BACKUP" "$EXT" || true
            echo 'M8.3.2 lock-screen restore attempted.' >&2
        fi
        if test -d "${NEXT:-}"; then rm -rf -- "$NEXT"; fi
    }
    trap recover EXIT
    cp -a -- "$EXT/." "$NEXT/"
    for f in "${FILES[@]}"; do
        install -m 644 -- "$DIR/$f" "$NEXT/$f"
    done
    test ! -L "$NEXT/extension.js"
    grep -Fq "Mellon M8.4" "$NEXT/metadata.json"
    grep -Fq 'mappingReadout(' "$NEXT/observatory-hud.js"
    grep -Fq 'this._everStarted = true' "$NEXT/observatory-intro.js"
    test -f "$NEXT/library.json" && test -f "$NEXT/scene-config.json"
    mv -T -- "$EXT" "$BACKUP"
    mv -T -- "$NEXT" "$EXT"
    NEXT=''
    trap - EXIT
    echo 'PASS: M8.4 lock mapping installed only in the TEST VM user session.'
    echo 'Full M8.3.2 preserved in .mellon-m84-previous-001.'
    echo 'No host login/GDM change; reboot ONLY the VM for lock tests.'
)
