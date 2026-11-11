#!/usr/bin/env bash
# Mellon G1.0 pre-install check: GDM greeter extension enablement.
# Read-only query from BlackPearl -> the known VM via SSH alias mellon.
# Read-only queries only; absolutely no privileged or mutating operations.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    virsh -c qemu:///system dominfo "$VM" >/dev/null

    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail

    test "$(id -un)" = 'test1' || {
        echo 'Wrong guest SSH identity; refusing.' >&2; exit 1;
    }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1' || {
        echo 'Wrong GNOME version; refusing.' >&2; exit 1;
    }

    echo '========== LIVE GNOME GDM SESSION =========='
    ps -eo user:24,comm,args --no-headers |
        awk '$2=="gnome-shell" && index($0,"--mode=gdm")>0 {print; found=1}
             END {exit found ? 0 : 1}' || {
        echo 'No active --mode=gdm process. Do not enable greeter yet.' >&2
        exit 1
    }

    echo
    echo '========== GDM PROFILE SEARCH ORDER =========='
    # DCONF_PROFILE=gdm searches admin override before system vendor
    # profiles. Never invent a replacement without knowing vendor entries.
    for f in /etc/dconf/profile/gdm \
             /usr/local/etc/dconf/profile/gdm \
             /usr/share/dconf/profile/gdm; do
        if test -f "$f" && test -r "$f"; then
            echo "--- $f ---"
            sed -n '1,35p' "$f"
        else
            echo "ABSENT/UNREADABLE: $f"
        fi
    done

    echo
    echo '========== VENDOR GDM DEFAULTS (FILENAMES ONLY) =========='
    for f in /usr/share/gdm/greeter-dconf-defaults \
             /var/lib/gdm3/greeter-dconf-defaults \
             /etc/gdm3/greeter.dconf-defaults \
             /usr/share/gdm/generate-config; do
        if test -e "$f"; then
            ls -ld -- "$f"
        else
            echo "ABSENT: $f"
        fi
    done

    echo
    echo '========== EXISTING ADMIN GDM CONFIG =========='
    if test -d /etc/dconf/db/gdm.d; then
        find /etc/dconf/db/gdm.d -maxdepth 1 -type f \
            -printf '%f\n' | LC_ALL=C sort
        grep -RhnE '^\[org/gnome/shell\]|^enabled-extensions=|^disable-user-extensions=' \
            /etc/dconf/db/gdm.d 2>/dev/null || true
    else
        echo 'No existing /etc/dconf/db/gdm.d directory'
    fi
    if test -e /etc/dconf/db/gdm; then
        echo 'Compiled admin GDM database exists.'
    else
        echo 'Compiled admin GDM database absent.'
    fi

    echo
    echo '========== EFFECTIVE PROBE FOR CURRENT SSH USER =========='
    # This queries the gdm PROFILE, but user-db values belong to the
    # SSH account. Treat as informational, NOT the greeter's effective
    # configuration because gdm-greeter has a separate XDG_CONFIG_HOME.
    if command -v dconf >/dev/null; then
        echo "test1 + DCONF_PROFILE=gdm enabled-extensions:"
        DCONF_PROFILE=gdm dconf read /org/gnome/shell/enabled-extensions ||
            true
        echo "test1 + DCONF_PROFILE=gdm disable-user-extensions:"
        DCONF_PROFILE=gdm dconf read /org/gnome/shell/disable-user-extensions ||
            true
    fi

    echo
    echo '========== GREETER SEAT USER-DB LOCATION (METADATA ONLY) =========='
    for f in /var/lib/gdm3/seat0/config/dconf/user \
             /var/lib/gdm3/seat0/config/dconf/; do
        if test -e "$f"; then
            stat -c '%n %F %U:%G %a' -- "$f" || true
        else
            echo "ABSENT: $f"
        fi
    done

    echo
    echo '========== EXISTING MELLON SYSTEM EXTENSION =========='
    if test -e /usr/share/gnome-shell/extensions/mellon-greeter@local ||
       test -L /usr/share/gnome-shell/extensions/mellon-greeter@local; then
        echo 'A greeter extension already exists. STOP; do not overwrite.'
        exit 2
    fi
    echo 'None (expected for initial G1 deployment).'

    echo
    echo 'PASS: read-only G1 activation profile inspection completed.'
    echo 'NOTE: this does NOT prove what the greeter reads from its'
    echo 'private user-db; inspect that before changing GDM settings.'
)
GUEST
)
