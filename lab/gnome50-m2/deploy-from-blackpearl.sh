#!/usr/bin/env bash
# Execute on BlackPearl; only mellon-gnome50-lab VM is modified.
(
    set -euo pipefail

    HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
    UUID='mellon-lab@local'
    DEST=".local/share/gnome-shell/extensions/$UUID"

    echo '========== MELLON M2 // VM-ONLY DEPLOY =========='

    for file in metadata.json extension.js stylesheet.css; do
        [[ -f "$HERE/$file" ]] || { echo "Missing $file"; exit 1; }
    done

    [[ -d "$HOME/VMs/Mellon/checkpoints/MELLON-BASELINE-001" ]] || {
        echo 'ERROR: Clean VM baseline not found'; exit 1;
    }
    virsh -c qemu:///system dominfo mellon-gnome50-lab >/dev/null

    ssh -o BatchMode=yes mellon '
        test "$(id -un)" = test1 &&
        test "$(gnome-shell --version)" = "GNOME Shell 50.1" &&
        test ! -L "$HOME/.local/share/gnome-shell/extensions/mellon-lab@local"
    ' || { echo 'ERROR: Incorrect guest identity/version'; exit 1; }

    ssh -o BatchMode=yes mellon "mkdir -p '$DEST'"
    scp -q "$HERE/metadata.json" "$HERE/extension.js" \
        "$HERE/stylesheet.css" "mellon:$DEST/"

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
        raise SystemExit('Failed to enable Mellon')
Gio.Settings.sync()
PY
    gsettings get org.gnome.shell enabled-extensions |
        grep -F "'mellon-lab@local'" >/dev/null
    echo 'PASS: Extension enabled in guest'
)
GUEST

    echo
    echo 'M2 code copied to VM. Restart ONLY the guest GNOME session:'
    echo '  virsh -c qemu:///system reboot mellon-gnome50-lab'
    echo
    echo 'Emergency disable (guest only):'
    echo '  ssh mellon "rm -f ~/.local/share/gnome-shell/extensions/mellon-lab@local/metadata.json"'
    echo '  virsh -c qemu:///system reboot mellon-gnome50-lab'
)
