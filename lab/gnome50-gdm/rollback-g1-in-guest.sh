#!/usr/bin/env bash
# Emergency Mellon G1 uninstall. VM ONLY. Safe over SSH or guest TTY.
# Never delete the live login user's lockscreen extension.
(
    set -euo pipefail
    test "$(id -u)" -eq 0 || { echo 'Requires guest root' >&2; exit 1; }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1' || exit 1
    test "$(systemd-detect-virt)" != none || exit 1

    EXT='/usr/share/gnome-shell/extensions/mellon-greeter@local'
    PROFILE='/etc/dconf/profile/gdm'
    KEYFILE='/etc/dconf/db/gdm.d/95-mellon-greeter'
    MARKER='/var/lib/mellon-greeter-g1-installed'

    # Never touch another extension or someone else's GDM customization.
    if test -e "$EXT"; then
        test -d "$EXT" && test ! -L "$EXT" || exit 1
        python3 - "$EXT/metadata.json" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1])
if p.is_symlink() or json.loads(p.read_text()).get('uuid')!='mellon-greeter@local':
    raise SystemExit('Not the Mellon G1 extension')
PY
    fi
    if test -f "$PROFILE"; then
        python3 - "$PROFILE" <<'PY'
import sys
from pathlib import Path
p=Path(sys.argv[1])
if p.is_symlink() or p.read_text().strip().splitlines()!=[
    'user-db:user','system-db:gdm',
    'file-db:/var/lib/gdm3/greeter-dconf-defaults']:
    raise SystemExit('GDM admin profile changed; refusing automatic removal')
PY
    fi
    if test -f "$KEYFILE"; then
        python3 - "$KEYFILE" <<'PY'
import sys
from pathlib import Path
p=Path(sys.argv[1])
if p.is_symlink() or p.read_text().strip().splitlines()!=[
    '[org/gnome/shell]',"enabled-extensions=['mellon-greeter@local']"]:
    raise SystemExit('GDM admin keyfile changed; refusing automatic removal')
PY
    fi
    if test ! -e "$MARKER"; then
        # The install may have failed before placing its final marker.
        # Still safe to delete ONLY files whose exact content matches.
        echo 'Partial G1 install detected (no final marker); removing known files.'
    fi
    if test -d "$EXT"; then rm -rf -- "$EXT"; fi
    if test -f "$KEYFILE"; then rm -- "$KEYFILE"; fi
    if test -f "$PROFILE"; then rm -- "$PROFILE"; fi
    if test -f "$MARKER"; then rm -- "$MARKER"; fi
    if test -d /etc/dconf/db/gdm.d; then
        rmdir /etc/dconf/db/gdm.d 2>/dev/null || true
    fi
    dconf update
    echo 'PASS: Removed Mellon G1 test greeter extension and profile override.'
    echo 'The original GDM vendor profile remains /usr/share/dconf/profile/gdm.'
    echo 'Reboot ONLY the guest VM to reload the stock login screen.'
)
