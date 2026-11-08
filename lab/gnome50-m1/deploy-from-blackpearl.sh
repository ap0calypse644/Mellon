#!/usr/bin/env bash
# Run on BlackPearl from a checked-out Mellon repository. Guest-only deployment.
(
    set -euo pipefail

    SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    UUID='mellon-lab@local'
    VM='mellon-gnome50-lab'
    DEST=".local/share/gnome-shell/extensions/$UUID"

    echo '========== MELLON M1 // VM-ONLY DEPLOY =========='

    for file in metadata.json extension.js stylesheet.css; do
        [[ -f "$SOURCE/$file" ]] || { echo "Missing $file"; exit 1; }
    done

    command -v virsh >/dev/null
    command -v ssh >/dev/null
    command -v scp >/dev/null

    [[ -d "$HOME/VMs/Mellon/checkpoints/MELLON-BASELINE-001" ]] || {
        echo 'Baseline not found on host; refusing deployment.'
        exit 1
    }

    virsh -c qemu:///system dominfo "$VM" >/dev/null || {
        echo 'Mellon VM not found.'
        exit 1
    }

    ssh -o BatchMode=yes mellon '
        test "$(id -un)" = test1 &&
        test "$(gnome-shell --version)" = "GNOME Shell 50.1" &&
        test ! -L "$HOME/.local/share/gnome-shell/extensions/mellon-lab@local"
    ' || {
        echo 'Guest identity/version check failed.'
        exit 1
    }

    ssh -o BatchMode=yes mellon "mkdir -p '$DEST'"
    scp -q "$SOURCE/metadata.json" "$SOURCE/extension.js"         "$SOURCE/stylesheet.css" "mellon:$DEST/"

    # Enable for the next GUI login; do not restart or touch the host GNOME.
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
    settings.set_strv('enabled-extensions', enabled)
assert uuid in settings.get_strv('enabled-extensions')
print('Guest enabled-extensions includes:', uuid)
PY
)
GUEST

    echo
    echo 'Source deployed ONLY to the Mellon VM.'
    echo 'Reboot guest (from BlackPearl):'
    echo '  virsh -c qemu:///system reboot mellon-gnome50-lab'
    echo 'Open the VM console, log in, press Super+L, reveal password prompt.'
    echo
    echo 'Emergency disable (from BlackPearl):'
    echo '  ssh mellon "rm -f ~/.local/share/gnome-shell/extensions/mellon-lab@local/metadata.json"'
    echo '  virsh -c qemu:///system reboot mellon-gnome50-lab'
)
