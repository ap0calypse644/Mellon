#!/usr/bin/env bash
# Mellon M3 / The Observatory — deploy ONLY to mellon-gnome50-lab.
# Run with: bash lab/gnome50-m3/deploy-from-blackpearl.sh
(
    set -euo pipefail

    HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
    UUID='mellon-lab@local'
    VM='mellon-gnome50-lab'
    DEST=".local/share/gnome-shell/extensions/$UUID"

    echo '========== MELLON M3 // VM-ONLY DEPLOY =========='

    for file in extension.js metadata.json stylesheet.css; do
        [[ -f "$HERE/$file" && ! -L "$HERE/$file" ]] || {
            echo "Missing or symlinked source: $file"; exit 1;
        }
    done

    [[ -d "$HOME/VMs/Mellon/checkpoints/MELLON-BASELINE-001" ]] || {
        echo 'Clean VM baseline not found; refusing deployment.'
        exit 1
    }
    virsh -c qemu:///system dominfo "$VM" >/dev/null

    ssh -o BatchMode=yes mellon '
        test "$(id -un)" = test1 &&
        test "$(gnome-shell --version)" = "GNOME Shell 50.1" &&
        test ! -L "$HOME/.local/share/gnome-shell/extensions/mellon-lab@local"
    ' || {
        echo 'Guest identity/version validation failed.'
        exit 1
    }

    ssh -o BatchMode=yes mellon "mkdir -p '$DEST'"
    scp -q "$HERE/extension.js" "$HERE/metadata.json" \
        "$HERE/stylesheet.css" "mellon:$DEST/"

    # Confirm the guest received precisely the files just pulled from GitHub.
    for file in extension.js metadata.json stylesheet.css; do
        expected="$(sha256sum "$HERE/$file" | cut -d ' ' -f 1)"
        actual="$(ssh -o BatchMode=yes mellon \
            "sha256sum '$DEST/$file'" | cut -d ' ' -f 1)"
        [[ "$expected" == "$actual" ]] || {
            echo "Checksum mismatch on guest: $file"; exit 1;
        }
    done
    echo 'PASS: All deployed files match GitHub worktree.'

    # The setting write must be flushed, and read by a separate process.
    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
    python3 - <<'PY'
from gi.repository import Gio

uuid = 'mellon-lab@local'
settings = Gio.Settings.new('org.gnome.shell')
enabled = list(settings.get_strv('enabled-extensions'))
if uuid not in enabled:
    enabled.append(uuid)
    if not settings.set_strv('enabled-extensions', enabled):
        raise SystemExit('GNOME rejected the extension enable setting')
Gio.Settings.sync()
PY
    gsettings get org.gnome.shell enabled-extensions |
        grep -F "'mellon-lab@local'" >/dev/null
)
GUEST

    ssh -o BatchMode=yes mellon '
        export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
        gsettings get org.gnome.shell enabled-extensions
    ' | grep -F "'mellon-lab@local'" >/dev/null || {
        echo 'Extension enable setting did not persist.'
        exit 1
    }

    echo 'PASS: Mellon enabled and verified from a second SSH session.'
    echo
    echo 'M3 staged in the VM. Reboot ONLY the guest to reload GNOME Shell:'
    echo '  virsh -c qemu:///system reboot mellon-gnome50-lab'
    echo
    echo 'To roll back to the verified M2 implementation:'
    echo '  bash lab/gnome50-m2/deploy-from-blackpearl.sh'
    echo '  virsh -c qemu:///system reboot mellon-gnome50-lab'
)
