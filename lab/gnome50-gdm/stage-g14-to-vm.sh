#!/usr/bin/env bash
# G1.4 stage: approved photo-star effects and length-only adapter.
# NO sudo and NO writes to GDM; runs from BlackPearl only.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    SRC="$HERE/greeter-extension"
    REMOTE='/home/test1/.local/state/mellon-gdm/g14-incoming-001'
    CHECKPOINT="$HOME/VMs/Mellon/checkpoints/MELLON-GDM-PREINSTALL-001"
    FILES=(extension.js metadata.json greeter-starfield.js
           greeter-length-observer.js stellar-effects.js)
    SCRIPTS=(install-g14-in-guest.sh rollback-g14-in-guest.sh)

    echo '========== G1.4: VERIFY BLACKPEARL =========='
    test -f "$CHECKPOINT/SHA256SUMS"
    test -d "$SRC" && test ! -L "$SRC"
    virsh -c qemu:///system dominfo "$VM" >/dev/null

    node "$HERE/test-g1.mjs"
    node "$HERE/test-g1-runtime.mjs"
    node "$HERE/test-g13-hud.mjs"
    node "$HERE/test-g14-length.mjs"
    node "$HERE/test-g14-starfield.mjs"
    node "$HERE/test-g14-runtime.mjs"
    node "$HERE/test-g14-deploy.mjs"

    for file in "${FILES[@]}"; do
        test -f "$SRC/$file" && test ! -L "$SRC/$file" || exit 1
        if [[ "$file" == *.js ]]; then
            node --input-type=module --check < "$SRC/$file"
        fi
    done
    for file in "${SCRIPTS[@]}"; do
        test -f "$HERE/$file" && test ! -L "$HERE/$file" || exit 1
        bash -n "$HERE/$file"
    done

    MANIFEST="$(mktemp)"
    trap 'rm -f -- "$MANIFEST"' EXIT
    ( cd "$SRC" && sha256sum -- "${FILES[@]}" ) > "$MANIFEST"
    ( cd "$HERE" && sha256sum -- "${SCRIPTS[@]}" ) >> "$MANIFEST"
    HOST_HASH="$(sha256sum "$MANIFEST" | cut -d' ' -f1)"

    echo '========== VERIFY MELLON TEST VM IDENTITY =========='
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
    test ! -e /usr/local/sbin/mellon-greeter-g14-rollback
)
GUEST

    if ssh -o BatchMode=yes mellon \
        'test -e "$HOME/.local/state/mellon-gdm/g14-incoming-001" || test -L "$HOME/.local/state/mellon-gdm/g14-incoming-001"'; then
        echo 'Existing G1.4 stage found: verifying without replacing it.'
    else
        ssh -o BatchMode=yes mellon \
            'mkdir -p "$HOME/.local/state/mellon-gdm" && mkdir -m 700 "$HOME/.local/state/mellon-gdm/g14-incoming-001"'
        paths=()
        for file in "${FILES[@]}"; do paths+=("$SRC/$file"); done
        for file in "${SCRIPTS[@]}"; do paths+=("$HERE/$file"); done
        scp -q -- "${paths[@]}" "mellon:$REMOTE/"
        scp -q -- "$MANIFEST" "mellon:$REMOTE/SHA256SUMS"
    fi

    echo '========== VERIFY STAGED ASSETS AGAINST HOST HASH =========='
    ssh -o BatchMode=yes mellon "bash -s -- '$HOST_HASH'" <<'GUEST'
(
    set -euo pipefail
    DIR="$HOME/.local/state/mellon-gdm/g14-incoming-001"
    test -d "$DIR" && test ! -L "$DIR"
    test "$(stat -c %U "$DIR")" = test1
    cd "$DIR"
    expected=(extension.js metadata.json greeter-starfield.js
        greeter-length-observer.js stellar-effects.js
        install-g14-in-guest.sh rollback-g14-in-guest.sh SHA256SUMS)
    shopt -s dotglob nullglob
    actual=(*)
    test "${#actual[@]}" -eq "${#expected[@]}" || {
        echo 'Unexpected G1.4 staged entries.' >&2; exit 1;
    }
    for file in "${expected[@]}"; do
        test -f "$file" && test ! -L "$file" || exit 1
    done
    test "$(sha256sum SHA256SUMS | cut -d' ' -f1)" = "$1" || {
        echo 'Host manifest differs from guest! Refusing.' >&2; exit 1;
    }
    sha256sum -c SHA256SUMS
    bash -n install-g14-in-guest.sh
    bash -n rollback-g14-in-guest.sh
    grep -Fq '[Mellon Greeter G1.4] enabled in gdm mode' extension.js
    echo 'PASS: G1.4 verified in guest test1 home; GDM unchanged.'
)
GUEST
    echo 'Ready for VM-only G1.4 installation after staging passes.'
)
