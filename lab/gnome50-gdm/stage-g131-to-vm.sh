#!/usr/bin/env bash
# Mellon G1.3.1 GDM-only HUD placement patch: host-side staging.
# This changes NO VM system files and never uses sudo on BlackPearl.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    SRC="$HERE/greeter-extension/hud-layout.js"
    REMOTE='/home/test1/.local/state/mellon-gdm/g131-incoming-001'
    BACKUP="$HOME/VMs/Mellon/checkpoints/MELLON-GDM-PREINSTALL-001"
    FILES=(install-g131-in-guest.sh rollback-g131-in-guest.sh)

    echo '========== CHECK G1.3.1 LOCAL SOURCE =========='
    test -d "$BACKUP" && test -f "$BACKUP/SHA256SUMS" || {
        echo 'Offline GDM checkpoint missing; refusing.' >&2; exit 1;
    }
    test -f "$SRC" && test ! -L "$SRC"
    virsh -c qemu:///system dominfo "$VM" >/dev/null
    node "$HERE/test-g13-hud.mjs"
    node "$HERE/test-g131-layout.mjs"
    if ! grep -Fq '[Mellon Greeter G1.3] enabled in gdm mode' "$HERE/greeter-extension/extension.js"; then
        echo 'G1.3.1 stage retired for newer greeter builds.' >&2
        exit 1
    fi
    node --input-type=module --check < "$SRC"
    for f in "${FILES[@]}"; do
        bash -n "$HERE/$f"
        test -f "$HERE/$f" && test ! -L "$HERE/$f"
    done

    MANIFEST="$(mktemp)"
    trap 'rm -f -- "$MANIFEST"' EXIT
    sha256sum -- "$SRC" | sed 's@  .*@  hud-layout.js@' > "$MANIFEST"
    (
        cd "$HERE"
        sha256sum -- "${FILES[@]}"
    ) >> "$MANIFEST"

    echo '========== VERIFY MELLON VM IDENTITY =========='
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
)
GUEST

    if ssh -o BatchMode=yes mellon \
        'test -e "$HOME/.local/state/mellon-gdm/g131-incoming-001" || test -L "$HOME/.local/state/mellon-gdm/g131-incoming-001"'; then
        echo 'Prior G1.3.1 staging exists; verifying without overwriting.'
    else
        ssh -o BatchMode=yes mellon \
            'mkdir -p "$HOME/.local/state/mellon-gdm" && mkdir -m 700 "$HOME/.local/state/mellon-gdm/g131-incoming-001"'
        scp -q -- "$SRC" "mellon:$REMOTE/hud-layout.js"
        scp -q -- "$HERE/${FILES[0]}" "$HERE/${FILES[1]}" "mellon:$REMOTE/"
        scp -q -- "$MANIFEST" "mellon:$REMOTE/SHA256SUMS"
    fi

    HOST_SHA="$(sha256sum "$MANIFEST" | cut -d' ' -f1)"
    ssh -o BatchMode=yes mellon "bash -s -- '$HOST_SHA'" <<'GUEST'
(
    set -euo pipefail
    DIR="$HOME/.local/state/mellon-gdm/g131-incoming-001"
    test -d "$DIR" && test ! -L "$DIR"
    test "$(stat -c '%U' "$DIR")" = test1
    cd "$DIR"
    expected=(hud-layout.js install-g131-in-guest.sh
        rollback-g131-in-guest.sh SHA256SUMS)
    shopt -s nullglob dotglob
    actual=(*)
    test "${#actual[@]}" -eq "${#expected[@]}" || {
        echo 'Unexpected staged files; refusing.' >&2; exit 1;
    }
    for f in "${expected[@]}"; do
        test -f "$f" && test ! -L "$f" || exit 1
    done
    test "$(sha256sum SHA256SUMS | cut -d' ' -f1)" = "$1" || {
        echo 'Source manifest differs from BlackPearl; refusing.' >&2; exit 1;
    }
    sha256sum -c SHA256SUMS
    bash -n install-g131-in-guest.sh
    bash -n rollback-g131-in-guest.sh
    grep -Fq 'topLeft: {x: pad, y: 14,' hud-layout.js
    echo 'PASS: all G1.3.1 files staged with matching host hashes.'
    echo 'No guest Node.js, GDM, PAM, dconf or user extension changes.'
)
GUEST
)
