#!/usr/bin/env bash
# Mellon G1.8: stage only the runtime stability update from BlackPearl.
# Host has Node; guest has no Node. Never edit either machine's GDM here.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    SRC="$HERE/greeter-extension"
    REMOTE='/home/test1/.local/state/mellon-gdm/g18-incoming-001'
    CHECKPOINT="$HOME/VMs/Mellon/checkpoints/MELLON-GDM-PREINSTALL-001"
    FILES=(extension.js metadata.json observatory-hud.js hud-progress.js)
    SCRIPTS=(install-g18-in-guest.sh rollback-g18-in-guest.sh)

    echo '========== G1.8 BLACKPEARL TESTS =========='
    test -f "$CHECKPOINT/SHA256SUMS"
    test -d "$SRC" && test ! -L "$SRC"
    virsh -c qemu:///system dominfo "$VM" >/dev/null

    node "$HERE/test-g1.mjs"
    node "$HERE/test-g1-runtime.mjs"
    node "$HERE/test-g13-hud.mjs"
    node "$HERE/test-g14-length.mjs"
    node "$HERE/test-g14-starfield.mjs"
    node "$HERE/test-g14-runtime.mjs"
    node "$HERE/test-g16a-cover.mjs"
    node "$HERE/test-g16a-scan.mjs"
    node "$HERE/test-g16b-chooser.mjs"
    node "$HERE/test-g131-layout.mjs"
    node "$HERE/test-g18-hud-runtime.mjs"
    node "$HERE/test-g18-deploy.mjs"
    grep -Fq '[Mellon Greeter G1.8] enabled in gdm mode' "$SRC/extension.js"
    grep -Fq "from './greeter-account-chooser.js'" "$SRC/extension.js"
    grep -Fq "mappingReadout(" "$SRC/observatory-hud.js"
    grep -Fq "stagePulseStrength(" "$SRC/observatory-hud.js"
    grep -Fq "STAGE_PULSE_SEC = 0.56" "$SRC/hud-progress.js"

    for file in "${FILES[@]}"; do
        test -f "$SRC/$file" && test ! -L "$SRC/$file"
        if [[ "$file" == *.js ]]; then
            node --input-type=module --check < "$SRC/$file"
        fi
    done
    for file in "${SCRIPTS[@]}"; do
        test -f "$HERE/$file" && test ! -L "$HERE/$file"
        bash -n "$HERE/$file"
    done
    MANIFEST="$(mktemp)"
    trap 'rm -f -- "$MANIFEST"' EXIT
    (cd "$SRC" && sha256sum -- "${FILES[@]}") > "$MANIFEST"
    (cd "$HERE" && sha256sum -- "${SCRIPTS[@]}") >> "$MANIFEST"
    HOST_HASH="$(sha256sum "$MANIFEST" | cut -d' ' -f1)"

    echo '========== G1.8 VERIFY ISOLATED TEST VM =========='
    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    test "$(id -un)" = test1
    test "$(id -u)" -eq 1000
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    test "$(dpkg-query -W -f='${Version}' gdm3)" = '50.1-0ubuntu0.1'
    test "$(systemd-detect-virt)" != none
    test -f /var/lib/mellon-greeter-g1-installed
    test -d /usr/share/gnome-shell/extensions/mellon-greeter@local
    test ! -e /usr/local/sbin/mellon-greeter-g18-rollback
    grep -Fq '[Mellon Greeter G1.7] enabled in gdm mode' /usr/share/gnome-shell/extensions/mellon-greeter@local/extension.js
)
GUEST

    # An interrupted stage is immutable; verify existing bytes, never
    # overwrite, erase or blindly reuse staged files.
    if ssh -o BatchMode=yes mellon \
        'test -e "$HOME/.local/state/mellon-gdm/g18-incoming-001" || test -L "$HOME/.local/state/mellon-gdm/g18-incoming-001"'; then
        echo 'Existing G1.8 staging found: checking without replacement.'
    else
        ssh -o BatchMode=yes mellon \
            'mkdir -p "$HOME/.local/state/mellon-gdm" && mkdir -m 700 "$HOME/.local/state/mellon-gdm/g18-incoming-001"'
        sources=()
        for file in "${FILES[@]}"; do sources+=("$SRC/$file"); done
        for file in "${SCRIPTS[@]}"; do sources+=("$HERE/$file"); done
        scp -q -- "${sources[@]}" "mellon:$REMOTE/"
        scp -q -- "$MANIFEST" "mellon:$REMOTE/SHA256SUMS"
    fi

    ssh -o BatchMode=yes mellon "bash -s -- '$HOST_HASH'" <<'GUEST'
(
    set -euo pipefail
    DIR="$HOME/.local/state/mellon-gdm/g18-incoming-001"
    test -d "$DIR" && test ! -L "$DIR"
    test "$(stat -c %U "$DIR")" = test1
    cd "$DIR"
    expected=(extension.js metadata.json observatory-hud.js
        hud-progress.js install-g18-in-guest.sh
        rollback-g18-in-guest.sh SHA256SUMS)
    shopt -s dotglob nullglob
    actual=(*)
    test "${#actual[@]}" -eq "${#expected[@]}" || {
        echo 'Unexpected staged G1.8 entries' >&2; exit 1;
    }
    for f in "${expected[@]}"; do
        test -f "$f" && test ! -L "$f" || exit 1
    done
    test "$(sha256sum SHA256SUMS | cut -d' ' -f1)" = "$1" || {
        echo 'Manifest mismatch against BlackPearl; refusing' >&2; exit 1;
    }
    sha256sum -c SHA256SUMS
    bash -n install-g18-in-guest.sh
    bash -n rollback-g18-in-guest.sh
    echo 'PASS: G1.8 seven-file stage verified; GDM files untouched.'
)
GUEST
)
