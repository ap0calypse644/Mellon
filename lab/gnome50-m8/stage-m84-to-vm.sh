#!/usr/bin/env bash
# M8.4: stage five lock-only source updates to the GNOME 50 test VM.
# No BlackPearl host GNOME modification, no VM system writes, no sudo.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    SOURCE="$HERE"
    REMOTE='/home/test1/.local/state/mellon/m84-incoming-001'
    CHECKPOINT="$HOME/VMs/Mellon/checkpoints/MELLON-GDM-PREINSTALL-001"
    FILES=(extension.js metadata.json hud-progress.js
           observatory-hud.js observatory-intro.js)
    SCRIPTS=(install-m84-in-guest.sh rollback-m84-in-guest.sh)

    echo '========== M8.4 VM LOCK SCREEN SOURCE PREFLIGHT =========='
    test -f "$CHECKPOINT/SHA256SUMS"
    test -d "$SOURCE" && test ! -L "$SOURCE"
    virsh -c qemu:///system dominfo "$VM" >/dev/null
    node "$HERE/test-mapping.mjs"
    node "$HERE/test-intro-runtime.mjs"
    node "$HERE/test-m8-regression.mjs"
    node "$HERE/../gnome50-gdm/test-g18-hud-runtime.mjs"
    node "$HERE/../gnome50-gdm/test-g18-deploy.mjs"
    grep -Fq 'this._bufferSignalId = buffer.connect(' "$SOURCE/extension.js"
    grep -Fq "mappingReadout(" "$SOURCE/observatory-hud.js"
    grep -Fq "this._everStarted = true" "$SOURCE/observatory-intro.js"
    for file in "${FILES[@]}"; do
        test -f "$SOURCE/$file" && test ! -L "$SOURCE/$file"
        [[ "$file" != *.js ]] ||
            node --input-type=module --check < "$SOURCE/$file"
    done
    for file in "${SCRIPTS[@]}"; do
        test -f "$HERE/$file" && test ! -L "$HERE/$file"
        bash -n "$HERE/$file"
    done

    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    test "$(id -un)" = test1 && test "$(id -u)" -eq 1000
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    test "$(systemd-detect-virt)" != none
    ROOT="$HOME/.local/share/gnome-shell/extensions"
    EXT="$ROOT/mellon-lab@local"
    test -d "$EXT" && test ! -L "$EXT"
    test ! -e "$ROOT/.mellon-m84-previous-001"
    test ! -e "$ROOT/.mellon-m84-failed-001"
    python3 - "$EXT/metadata.json" <<'PY'
import json,sys
m=json.load(open(sys.argv[1]))
assert m['uuid']=='mellon-lab@local'
assert m['shell-version']==['50']
assert m['session-modes']==['unlock-dialog']
assert m['name'].startswith('Mellon M8.3.2'),m['name']
print('PASS: working GNOME 50 M8.3.2 unlock extension identified')
PY
)
GUEST

    MANIFEST="$(mktemp)"
    trap 'rm -f -- "$MANIFEST"' EXIT
    (cd "$SOURCE" && sha256sum -- "${FILES[@]}") > "$MANIFEST"
    (cd "$HERE" && sha256sum -- "${SCRIPTS[@]}") >> "$MANIFEST"
    HASH="$(sha256sum "$MANIFEST" | cut -d' ' -f1)"

    if ssh -o BatchMode=yes mellon \
        'test -e "$HOME/.local/state/mellon/m84-incoming-001" || test -L "$HOME/.local/state/mellon/m84-incoming-001"'; then
        echo 'Existing M8.4 stage: verify immutable files; no replacement.'
    else
        ssh -o BatchMode=yes mellon \
          'mkdir -p "$HOME/.local/state/mellon" && mkdir -m 700 "$HOME/.local/state/mellon/m84-incoming-001"'
        sources=()
        for file in "${FILES[@]}"; do sources+=("$SOURCE/$file"); done
        for file in "${SCRIPTS[@]}"; do sources+=("$HERE/$file"); done
        scp -q -- "${sources[@]}" "mellon:$REMOTE/"
        scp -q -- "$MANIFEST" "mellon:$REMOTE/SHA256SUMS"
    fi

    ssh -o BatchMode=yes mellon "bash -s -- '$HASH'" <<'GUEST'
(
    set -euo pipefail
    DIR="$HOME/.local/state/mellon/m84-incoming-001"
    test -d "$DIR" && test ! -L "$DIR"
    test "$(stat -c %U "$DIR")" = test1
    cd "$DIR"
    expected=(extension.js metadata.json hud-progress.js
        observatory-hud.js observatory-intro.js
        install-m84-in-guest.sh rollback-m84-in-guest.sh SHA256SUMS)
    shopt -s dotglob nullglob
    actual=(*)
    test "${#expected[@]}" -eq "${#actual[@]}"
    for f in "${expected[@]}"; do
        test -f "$f" && test ! -L "$f"
    done
    test "$(sha256sum SHA256SUMS | cut -d' ' -f1)" = "$1"
    sha256sum -c SHA256SUMS
    bash -n install-m84-in-guest.sh
    bash -n rollback-m84-in-guest.sh
    echo 'PASS: checksum-verified M8.4 stage; installed lock screen unchanged.'
)
GUEST
)
