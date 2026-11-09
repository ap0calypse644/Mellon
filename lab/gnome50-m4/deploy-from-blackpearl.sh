#!/usr/bin/env bash
# MELLON M4 — copies exclusively to pre-existing GNOME 50 test guest.
# Run on BlackPearl: bash lab/gnome50-m4/deploy-from-blackpearl.sh
(
    set -euo pipefail
    HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
    ROOT="$(cd -- "$HERE/../.." && pwd)"
    VM='mellon-gnome50-lab'
    UUID='mellon-lab@local'
    DEST=".local/share/gnome-shell/extensions/$UUID"
    BG="$ROOT/assets/starfield/corpus-v1/catalogs/blue-gold-nebula/background-dim-16x9.jpg"
    V6="$HOME/VMs/Mellon/constellation-benchmark-v6-centered/matches-v6.json"

    echo 'MELLON M4 // TEST VM ONLY // NO HOST GNOME CHANGES'
    test -f "$V6" || { echo "Missing existing v6 report: $V6"; exit 1; }
    for item in "$HERE/extension.js" "$HERE/metadata.json" "$HERE/scene.json" "$BG"; do
        test -f "$item" && test ! -L "$item" || { echo "Missing or symlinked $item"; exit 1; }
    done
    python3 "$ROOT/tools/mvp/verify_scene.py" --root "$ROOT" --report "$V6"
    test -d "$HOME/VMs/Mellon/checkpoints/MELLON-BASELINE-001" || {
        echo 'VM baseline missing; refusing to deploy'; exit 1;
    }
    virsh -c qemu:///system dominfo "$VM" >/dev/null
    ssh -o BatchMode=yes mellon '
        test "$(id -un)" = test1 &&
        test "$(gnome-shell --version)" = "GNOME Shell 50.1" &&
        test ! -L "$HOME/.local/share/gnome-shell/extensions/mellon-lab@local"
    ' || { echo 'Guest identity/version mismatch'; exit 1; }

    # Install data and source on the TEST guest, never to BlackPearl's GNOME.
    ssh -o BatchMode=yes mellon "mkdir -p '$DEST'"
    scp -q "$HERE/extension.js" "$HERE/metadata.json" "$HERE/scene.json" "mellon:$DEST/"
    scp -q "$BG" "mellon:$DEST/background.jpg"
    for file in extension.js metadata.json scene.json; do
        expected="$(sha256sum "$HERE/$file" | cut -d ' ' -f 1)"
        actual="$(ssh -o BatchMode=yes mellon "sha256sum '$DEST/$file'" | cut -d ' ' -f 1)"
        test "$expected" = "$actual" || { echo "Guest checksum mismatch: $file"; exit 1; }
    done
    expected="$(sha256sum "$BG" | cut -d ' ' -f 1)"
    actual="$(ssh -o BatchMode=yes mellon "sha256sum '$DEST/background.jpg'" | cut -d ' ' -f 1)"
    test "$expected" = "$actual" || { echo 'Guest background checksum mismatch'; exit 1; }
    echo 'PASS: Guest source and image checksums match.'

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
    if not settings.set_strv('enabled-extensions',enabled):
        raise SystemExit('Cannot enable extension')
Gio.Settings.sync()
PY
    gsettings get org.gnome.shell enabled-extensions | grep -F "'mellon-lab@local'"
)
GUEST
    echo
    echo 'PASS: M4 installed and enabled in the guest only.'
    echo 'Next: reboot ONLY mellon-gnome50-lab (guest), then lock the guest to test.'
    echo 'Recovery if guest UI fails:'
    echo '  ssh mellon "rm -f ~/.local/share/gnome-shell/extensions/mellon-lab@local/metadata.json"'
    echo '  virsh -c qemu:///system reboot mellon-gnome50-lab'
)
