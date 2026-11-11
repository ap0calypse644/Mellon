#!/usr/bin/env bash
# Mellon Greeter G0 -- READ-ONLY inspection of GNOME 50's GDM greeter.
# This script runs on BlackPearl but only queries mellon-gnome50-lab.
# NO sudo, file writes, snapshots, GDM restarts or extension activation.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'

    echo '========== MELLON G0: VM IDENTITY (READ ONLY) =========='
    virsh -c qemu:///system dominfo "$VM" |
        grep -E '^(Name|State|OS Type|Persistent|Autostart):' || true

    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    test "$(id -un)" = 'test1' || {
        echo 'Wrong SSH account; refusing audit' >&2; exit 1;
    }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1' || {
        echo 'GNOME version mismatch; refusing audit' >&2; exit 1;
    }

    echo
    echo '========== GUEST RELEASE / PACKAGES =========='
    sed -n '1,12p' /etc/os-release
    dpkg-query -W -f='${binary:Package} ${Version}\n' \
        gdm3 gnome-shell gnome-session-bin 2>/dev/null || true

    echo
    echo '========== GDM SERVICE =========='
    systemctl show display-manager \
        -p Id -p FragmentPath -p ActiveState -p SubState --no-pager || true
    systemctl is-active gdm3.service || true

    echo
    echo '========== GREETER ACCOUNT(S) =========='
    for account in gdm Debian-gdm; do
        getent passwd "$account" || true
    done

    echo
    echo '========== GNOME SHELL / GREETER PROCESSES =========='
    ps -eo user:16,pid,comm,args --no-headers |
        grep -Ei '(/usr/bin/gnome-shell|gnome-session|gdm-wayland-session|gdm-x-session|gdm3)' |
        grep -vE '(grep -Ei|bash -s)' |
        head -n 45 || true

    echo
    echo '========== LOGIND SESSIONS =========='
    loginctl list-sessions --no-legend --no-pager || true

    echo
    echo '========== GNOME SESSION MODE FILES =========='
    for file in \
        /usr/share/gnome-shell/modes/gdm.json \
        /usr/share/gnome-shell/modes/ubuntu.json \
        /usr/share/gdm/greeter/wayland-sessions/gnome-greeter.desktop \
        /usr/share/gdm/greeter/wayland-sessions/gnome-login.desktop; do
        if test -r "$file"; then
            echo "--- $file ---"
            sed -n '1,65p' "$file"
        fi
    done

    echo
    echo '========== SYSTEM EXTENSION LOCATIONS =========='
    for folder in /usr/share/gnome-shell/extensions \
                  /usr/local/share/gnome-shell/extensions; do
        if test -d "$folder"; then
            echo "--- $folder ---"
            find "$folder" -mindepth 1 -maxdepth 1 -type d \
                -printf '%f\n' | LC_ALL=C sort | head -n 40
        fi
    done

    echo
    echo '========== GDM DCONF PROFILE (NO MUTATION) =========='
    for file in /etc/dconf/profile/gdm \
                /etc/gdm3/custom.conf \
                /etc/gdm/custom.conf; do
        if test -r "$file"; then
            echo "--- $file ---"
            # Only read the profile and shell/theme keys. No credentials.
            grep -E '^(user-db:|system-db:|file-db:|WaylandEnable=|DefaultSession=)' \
                "$file" || true
        fi
    done
    if test -d /etc/dconf/db/gdm.d; then
        echo 'GDM dconf file names:'
        find /etc/dconf/db/gdm.d -mindepth 1 -maxdepth 1 -type f \
            -printf '%f\n' | LC_ALL=C sort | head -n 35
        echo 'Greeter extension settings (if system-readable):'
        grep -R -h -E '^\[org/gnome/shell\]|^enabled-extensions=|^disable-user-extensions=' \
            /etc/dconf/db/gdm.d 2>/dev/null | head -n 30 || true
    fi

    echo
    echo '========== EXISTING MELLON IS USER-SCOPED =========='
    python3 - <<'PY'
import json
from pathlib import Path
p = Path.home()/'.local/share/gnome-shell/extensions/mellon-lab@local/metadata.json'
m = json.loads(p.read_text())
print('name:', m.get('name'))
print('uuid:', m.get('uuid'))
print('session-modes:', m.get('session-modes'))
print('user-scoped:', p)
PY

    echo
    echo 'PASS: Read-only GDM greeter audit finished. No login changes made.'
)
GUEST
)
