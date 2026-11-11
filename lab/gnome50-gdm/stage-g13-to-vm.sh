#!/usr/bin/env bash
# Mellon G1.3: stage source-only HUD upgrade in the isolated GNOME 50 VM.
# No sudo, no GNOME/GDM changes, no VM restart.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    SRC="$HERE/greeter-extension"
    REMOTE='/home/test1/.local/state/mellon-gdm/g13-incoming-001'
    CHECKPOINT="$HOME/VMs/Mellon/checkpoints/MELLON-GDM-PREINSTALL-001"
    FILES=(extension.js metadata.json hud-state.js hud-layout.js
        hud-progress.js hud-intro-state.js observatory-hud.js
        observatory-intro.js stylesheet.css)
    SCRIPTS=(install-g13-in-guest.sh rollback-g13-in-guest.sh)

    echo '========== G1.3: VERIFY BLACKPEARL SOURCE =========='
    test -d "$CHECKPOINT" && test -f "$CHECKPOINT/SHA256SUMS"
    test -d "$SRC" && test ! -L "$SRC"
    virsh -c qemu:///system dominfo "$VM" >/dev/null
    node "$HERE/test-g1.mjs"
    node "$HERE/test-g1-runtime.mjs"
    node "$HERE/test-g13-hud.mjs"
    node "$HERE/test-g13-deploy.mjs"
    for file in "${FILES[@]}"; do
        test -f "$SRC/$file" && test ! -L "$SRC/$file"
    done
    for file in "${SCRIPTS[@]}"; do
        test -f "$HERE/$file" && test ! -L "$HERE/$file"
        bash -n "$HERE/$file"
    done
    for file in extension.js hud-state.js hud-layout.js hud-progress.js \
            hud-intro-state.js observatory-hud.js observatory-intro.js; do
        node --input-type=module --check < "$SRC/$file"
    done

    MANIFEST="$(mktemp)"
    trap 'rm -f -- "$MANIFEST"' EXIT
    (
        cd "$SRC"
        sha256sum -- "${FILES[@]}"
    ) > "$MANIFEST"
    (
        cd "$HERE"
        sha256sum -- "${SCRIPTS[@]}"
    ) >> "$MANIFEST"

    echo '========== VERIFY ONLY THE ISOLATED VM =========='
    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    test "$(id -un)" = test1
    test "$(id -u)" -eq 1000
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    test "$(dpkg-query -W -f='${Version}' gdm3)" = '50.1-0ubuntu0.1'
    test "$(systemd-detect-virt)" != none
    test -d /usr/share/gnome-shell/extensions/mellon-greeter@local
    test -f /var/lib/mellon-greeter-g1-installed
    test ! -e /usr/local/sbin/mellon-greeter-g13-rollback
)
GUEST

    # If an interrupted stage already exists, compare it to the trusted
    # host manifest; NEVER overwrite or erase it without investigation.
    if ssh -o BatchMode=yes mellon \
        'test -e "$HOME/.local/state/mellon-gdm/g13-incoming-001" || test -L "$HOME/.local/state/mellon-gdm/g13-incoming-001"'; then
        echo 'Existing G1.3 staging detected; verifying in place.'
    else
        ssh -o BatchMode=yes mellon \
            'mkdir -p "$HOME/.local/state/mellon-gdm" && mkdir -m 700 "$HOME/.local/state/mellon-gdm/g13-incoming-001"'
        local_paths=()
        for file in "${FILES[@]}"; do local_paths+=("$SRC/$file"); done
        for file in "${SCRIPTS[@]}"; do local_paths+=("$HERE/$file"); done
        scp -q -- "${local_paths[@]}" "mellon:$REMOTE/"
        scp -q -- "$MANIFEST" "mellon:$REMOTE/SHA256SUMS"
    fi

    # Accept only matching source bytes, correct owner and known file list.
    # The guest intentionally has NO Node.js dependency.
    HOST_HASH="$(sha256sum -- "$MANIFEST" | cut -d' ' -f1)"
    ssh -o BatchMode=yes mellon "bash -s -- '$HOST_HASH'" <<'GUEST'
(
    set -euo pipefail
    DIR="$HOME/.local/state/mellon-gdm/g13-incoming-001"
    test -d "$DIR" && test ! -L "$DIR"
    test "$(stat -c %U "$DIR")" = test1
    cd "$DIR"
    expected=(extension.js metadata.json hud-state.js hud-layout.js
        hud-progress.js hud-intro-state.js observatory-hud.js
        observatory-intro.js stylesheet.css install-g13-in-guest.sh
        rollback-g13-in-guest.sh SHA256SUMS)
    shopt -s nullglob dotglob
    actual=(*)
    test "${#actual[@]}" -eq "${#expected[@]}" || {
        echo 'Unexpected count of staged files; refusing' >&2; exit 1;
    }
    for file in "${expected[@]}"; do
        test -f "$file" && test ! -L "$file" || exit 1
    done
    test "$(sha256sum SHA256SUMS | cut -d' ' -f1)" = "$1" || {
        echo 'Host and VM manifest hashes differ; refusing.' >&2; exit 1;
    }
    sha256sum -c SHA256SUMS
    bash -n install-g13-in-guest.sh
    bash -n rollback-g13-in-guest.sh
    echo 'PASS: G1.3 staged with all 11 files verified; no system changes.'
)
GUEST
    echo 'G1.3 package staged; use the VM-only installer after this PASS.'
)
