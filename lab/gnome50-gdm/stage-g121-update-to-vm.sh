#!/usr/bin/env bash
# Mellon G1.2.1: STAGE ONLY the corrected GDM backdrop source into
# mellon-gnome50-lab (no sudo, GDM modification, or reboot).
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    SOURCE="$ROOT/greeter-extension/extension.js"
    REMOTE_DIR='/home/test1/.local/state/mellon-gdm/g1-update-002'
    BACKUP="$HOME/VMs/Mellon/checkpoints/MELLON-GDM-PREINSTALL-001"
    test -d "$BACKUP" && test -f "$BACKUP/SHA256SUMS" || {
        echo 'GDM backup checkpoint missing: refusing update staging' >&2
        exit 1
    }
    test -f "$SOURCE" && test ! -L "$SOURCE"
    test -f "$ROOT/update-g121-in-guest.sh"
    test -f "$ROOT/rollback-g121-in-guest.sh"
    virsh -c qemu:///system dominfo "$VM" >/dev/null
    node --input-type=module --check < "$SOURCE"
    grep -Fq 'container.insert_child_below(photo, dialog)' "$SOURCE"
    grep -Fq 'Main.screenShield?._lockDialogGroup' "$SOURCE"

    echo '========== CHECK ONLY THE KNOWN VM =========='
    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    test "$(id -un)" = test1
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    test "$(dpkg-query -W -f='${Version}' gdm3)" = '50.1-0ubuntu0.1'
    test -d /usr/share/gnome-shell/extensions/mellon-greeter@local
    test -f /var/lib/mellon-greeter-g1-installed
    test ! -e "$HOME/.local/state/mellon-gdm/g1-update-002"
)
GUEST

    echo '========== STAGE G1.2.1 (NO SYSTEM WRITES) =========='
    ssh -o BatchMode=yes mellon 'mkdir -p "$HOME/.local/state/mellon-gdm"'
    ssh -o BatchMode=yes mellon 'mkdir "$HOME/.local/state/mellon-gdm/g1-update-002"'
    scp -q -- "$SOURCE" "$ROOT/update-g121-in-guest.sh" \
        "$ROOT/rollback-g121-in-guest.sh" "mellon:$REMOTE_DIR/"
    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    cd "$HOME/.local/state/mellon-gdm/g1-update-002"
    bash -n update-g121-in-guest.sh
    bash -n rollback-g121-in-guest.sh
    node --input-type=module --check < extension.js
    grep -Fq 'container.insert_child_below(photo, dialog)' extension.js
    sha256sum extension.js > SHA256SUMS
    sha256sum -c SHA256SUMS
    echo 'PASS: G1.2.1 source staged in guest test1 home (no GDM changes).'
)
GUEST
)
