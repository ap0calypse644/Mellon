#!/usr/bin/env bash
# Stage already SHA256-verified G1 pack inside the TEST VM. No sudo,
# no system settings, no host GNOME changes, no GDM restart.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    BUNDLE="$HOME/VMs/Mellon/gdm-stage/MELLON-G1-PREVIEW-001"
    CHECKPOINT="$HOME/VMs/Mellon/checkpoints/MELLON-GDM-PREINSTALL-001"
    REMOTE='/home/test1/.local/state/mellon-gdm/g1-incoming'

    virsh -c qemu:///system dominfo "$VM" >/dev/null
    test -d "$CHECKPOINT" && test -f "$CHECKPOINT/SHA256SUMS"
    test -d "$BUNDLE" && test ! -L "$BUNDLE"
    for f in "$BUNDLE/SHA256SUMS" "$HERE/install-g1-in-guest.sh" \
             "$HERE/rollback-g1-in-guest.sh"; do
        test -f "$f" && test ! -L "$f" || {
            echo "Missing or linked G1 file: $f" >&2; exit 1;
        }
    done
    echo '========== VERIFY HOST G1 BUNDLE =========='
    ( cd "$BUNDLE" && sha256sum -c SHA256SUMS >/dev/null )
    echo 'PASS: original G1 bundle digest checks'

    echo '========== VERIFY GUEST IDENTITY =========='
    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    test "$(id -un)" = 'test1'
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    test "$(dpkg-query -W -f='${Version}' gdm3)" = '50.1-0ubuntu0.1'
    test ! -e /usr/share/gnome-shell/extensions/mellon-greeter@local
    test ! -L /usr/share/gnome-shell/extensions/mellon-greeter@local
    test ! -e /etc/dconf/profile/gdm
    test -f /usr/share/dconf/profile/gdm
    test ! -e "$HOME/.local/state/mellon-gdm/g1-incoming"
)
GUEST

    echo '========== STAGE FILES IN VM USER HOME (NOT GREETER HOME) =========='
    ssh -o BatchMode=yes mellon 'mkdir -p "$HOME/.local/state/mellon-gdm"'
    ssh -o BatchMode=yes mellon 'mkdir "$HOME/.local/state/mellon-gdm/g1-incoming"'
    scp -q -r -- "$BUNDLE" "mellon:$REMOTE/bundle"
    scp -q -- "$HERE/install-g1-in-guest.sh" \
        "$HERE/rollback-g1-in-guest.sh" "mellon:$REMOTE/"

    echo '========== VERIFY GUEST STAGING =========='
    ssh -o BatchMode=yes mellon "bash -s" <<'GUEST'
(
    set -euo pipefail
    cd "$HOME/.local/state/mellon-gdm/g1-incoming/bundle"
    sha256sum -c SHA256SUMS >/dev/null
    bash -n "$HOME/.local/state/mellon-gdm/g1-incoming/install-g1-in-guest.sh"
    bash -n "$HOME/.local/state/mellon-gdm/g1-incoming/rollback-g1-in-guest.sh"
    echo 'PASS: G1 assets and installer/rollback staged in the guest.'
)
GUEST

    echo
    echo 'PASS: Guest files staged ONLY in test1 home, GDM unchanged.'
    echo 'Next interactive guest-root install (may prompt for test1 sudo password):'
    echo "ssh -tt mellon 'sudo bash $REMOTE/install-g1-in-guest.sh'"
    echo 'Emergency rollback after install, via host SSH:'
    echo "ssh -tt mellon 'sudo /usr/local/sbin/mellon-greeter-g1-rollback'"
)
