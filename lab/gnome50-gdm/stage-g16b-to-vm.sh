#!/usr/bin/env bash
# Mellon G1.6B: stage only the runtime stability update from BlackPearl.
# Host has Node; guest has no Node. Never edit either machine's GDM here.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    SRC="$HERE/greeter-extension"
    REMOTE='/home/test1/.local/state/mellon-gdm/g16b-incoming-001'
    CHECKPOINT="$HOME/VMs/Mellon/checkpoints/MELLON-GDM-PREINSTALL-001"
    FILES=(extension.js metadata.json greeter-account-chooser.js
           stylesheet.css)
    SCRIPTS=(install-g16b-in-guest.sh rollback-g16b-in-guest.sh)

    echo '========== G1.6B BLACKPEARL TESTS =========='
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
    node "$HERE/test-g16b-deploy.mjs"
    # A G1.6B-only package must never ship newer G1.7 initialization code.
    if ! grep -Fq '[Mellon Greeter G1.6B] enabled in gdm mode' "$SRC/extension.js"; then
        echo 'G1.6B stage retired: use the G1.7 package.' >&2
        exit 1
    fi
    grep -Fq '[Mellon Greeter G1.6B] enabled in gdm mode' "$SRC/extension.js"
    grep -Fq "from './greeter-account-chooser.js'" "$SRC/extension.js"
    grep -Fq "item.emit('activate')" "$SRC/greeter-account-chooser.js"

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

    echo '========== G1.6B VERIFY ISOLATED TEST VM =========='
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
    test ! -e /usr/local/sbin/mellon-greeter-g16b-rollback
    grep -Fq '[Mellon Greeter G1.6A.1] enabled in gdm mode' /usr/share/gnome-shell/extensions/mellon-greeter@local/extension.js
)
GUEST

    # An interrupted stage is immutable; verify existing bytes, never
    # overwrite, erase or blindly reuse staged files.
    if ssh -o BatchMode=yes mellon \
        'test -e "$HOME/.local/state/mellon-gdm/g16b-incoming-001" || test -L "$HOME/.local/state/mellon-gdm/g16b-incoming-001"'; then
        echo 'Existing G1.6B staging found: checking without replacement.'
    else
        ssh -o BatchMode=yes mellon \
            'mkdir -p "$HOME/.local/state/mellon-gdm" && mkdir -m 700 "$HOME/.local/state/mellon-gdm/g16b-incoming-001"'
        sources=()
        for file in "${FILES[@]}"; do sources+=("$SRC/$file"); done
        for file in "${SCRIPTS[@]}"; do sources+=("$HERE/$file"); done
        scp -q -- "${sources[@]}" "mellon:$REMOTE/"
        scp -q -- "$MANIFEST" "mellon:$REMOTE/SHA256SUMS"
    fi

    ssh -o BatchMode=yes mellon "bash -s -- '$HOST_HASH'" <<'GUEST'
(
    set -euo pipefail
    DIR="$HOME/.local/state/mellon-gdm/g16b-incoming-001"
    test -d "$DIR" && test ! -L "$DIR"
    test "$(stat -c %U "$DIR")" = test1
    cd "$DIR"
    expected=(extension.js metadata.json greeter-account-chooser.js
        stylesheet.css install-g16b-in-guest.sh
        rollback-g16b-in-guest.sh SHA256SUMS)
    shopt -s dotglob nullglob
    actual=(*)
    test "${#actual[@]}" -eq "${#expected[@]}" || {
        echo 'Unexpected staged G1.6B entries' >&2; exit 1;
    }
    for f in "${expected[@]}"; do
        test -f "$f" && test ! -L "$f" || exit 1
    done
    test "$(sha256sum SHA256SUMS | cut -d' ' -f1)" = "$1" || {
        echo 'Manifest mismatch against BlackPearl; refusing' >&2; exit 1;
    }
    sha256sum -c SHA256SUMS
    bash -n install-g16b-in-guest.sh
    bash -n rollback-g16b-in-guest.sh
    echo 'PASS: G1.6B seven-file stage verified; GDM files untouched.'
)
GUEST
)
