#!/usr/bin/env bash
# G1 read-only preflight for system greeter extension activation.
# Uses SSH alias 'mellon' and performs no privileged operations or file writes.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    virsh -c qemu:///system dominfo "$VM" >/dev/null
    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    test "$(id -un)" = test1
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    echo '========== VERIFY GDM 50 =========='
    dpkg-query -W -f='${Version}\n' gdm3
    systemctl show display-manager -p ActiveState -p SubState

    echo
    echo '========== LIVE GREETER MODE =========='
    ps -eo user:24,comm,args --no-headers |
        awk '$2=="gnome-shell" && index($0,"--mode=gdm")>0 {print}'
    echo
    echo '========== GNOME EXTENSION CONFIGURATION =========='
    for f in /etc/dconf/profile/gdm /etc/dconf/db/gdm.d/00-extensions \
             /etc/dconf/db/gdm.d/01-mellon-greeter \
             /usr/share/gdm/greeter-dconf-defaults; do
        if test -f "$f" && test -r "$f"; then
            echo "FOUND: $f"
            case "$f" in
                */00-extensions|*/01-mellon-greeter)
                    grep -E '^\[org/gnome/shell\]|^enabled-extensions=|^disable-user-extensions=' "$f" || true ;;
            esac
        else
            echo "ABSENT/UNREADABLE: $f"
        fi
    done

    echo
    echo '========== SYSTEM EXTENSION DIRECTORY =========='
    for dir in /usr/share/gnome-shell/extensions \
               /usr/local/share/gnome-shell/extensions; do
        if test -d "$dir"; then
            printf '%s: ' "$dir"
            stat -c '%U:%G %a' "$dir"
        fi
    done
    if test -e /usr/share/gnome-shell/extensions/mellon-greeter@local; then
        echo 'A preexisting greeter installation exists. Stop and inspect.'
        exit 2
    fi

    echo
    echo '========== VENDOR GREETER FILES =========='
    if test -r /usr/share/gnome-session/sessions/gnome-login.session; then
        grep -E '^(Name|Kiosk)=' /usr/share/gnome-session/sessions/gnome-login.session || true
    fi
    echo
    echo 'PASS: G1 preflight read-only. No greeter settings changed.'
)
GUEST
)
