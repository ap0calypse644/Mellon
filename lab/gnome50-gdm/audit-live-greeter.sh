#!/usr/bin/env bash
# G0.1: inspect ONLY a LIVE GDM greeter in mellon-gnome50-lab.
# Run from BlackPearl after logging OUT of test1's graphical desktop.
# SSH into test1 is okay; do not sign back into the guest GUI yet.
# Read-only; no sudo, no GNOME/GDM service changes, no passwords.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'

    echo '========== VERIFY ISOLATED VM =========='
    virsh -c qemu:///system dominfo "$VM" |
        grep -E '^(Name|State|Autostart):' || true

    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    test "$(id -un)" = 'test1' || {
        echo 'Refusing: wrong SSH account' >&2; exit 1;
    }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1' || {
        echo 'Refusing: GNOME version mismatch' >&2; exit 1;
    }

    echo
    echo '========== DISPLAY MANAGER =========='
    systemctl show display-manager \
        -p Id -p ActiveState -p SubState --no-pager

    echo
    echo '========== LIVE SHELLS (PROCESS / USER / MODE) =========='
    ps -eo user:24,pid,comm,args --no-headers |
        awk '$3=="gnome-shell" {print}'

    echo
    echo '========== GREETER / LOGIN SESSION PROCESSES =========='
    ps -eo user:24,pid,comm,args --no-headers |
        awk '$3=="gdm-wayland-ses" ||
             $3=="gnome-session-b" || $3=="gnome-session" ||
             $3=="gdm3" || $3=="gdm" {print}' |
        head -n 50 || true

    echo
    echo '========== LOGIND SEAT0 SESSIONS =========='
    loginctl list-sessions --no-legend --no-pager || true
    loginctl seat-status seat0 --no-pager 2>/dev/null |
        head -n 30 || true

    echo
    echo '========== LIVE GREETER ACCOUNT =========='
    # GDM 50 may use a dynamically allocated user, not legacy "gdm".
    ps -eo user:24,comm,args --no-headers |
        awk '$2=="gnome-shell" && index($0,"--mode=gdm")>0 {print $1}' |
        sort -u | while IFS= read -r account; do
            echo "Greeter shell account: $account"
            getent passwd "$account" || true
        done

    echo
    echo '========== GREETER DESKTOP / SESSION FILES =========='
    for file in \
      /usr/share/gdm/greeter/wayland-sessions/gnome-greeter.desktop \
      /usr/share/gnome-session/sessions/gnome-login.session \
      /usr/share/gnome-session/sessions/gnome-greeter.session \
      /usr/share/gnome-shell/modes/gdm.json; do
        if test -r "$file"; then
            echo "--- $file ---"
            sed -n '1,100p' "$file"
        fi
    done

    echo
    echo '========== GREETER VENDOR PROFILE (READ-ONLY) =========='
    for file in /etc/dconf/profile/gdm \
        /usr/share/gdm/greeter-dconf-defaults \
        /usr/share/gdm/greeter-dconf-defaults/profile; do
        if test -r "$file" && test -f "$file"; then
            echo "--- $file ---"
            grep -E '^(user-db:|system-db:|file-db:|service-db:)' "$file" ||
                true
        fi
    done

    echo
    echo '========== GDM SESSION CHECK =========='
    # Crucial: test1's normal --mode=ubuntu GNOME is NOT the greeter.
    if ps -eo comm,args --no-headers |
        awk '$1=="gnome-shell" && index($0,"--mode=gdm")>0 {yes=1}
             END {exit yes ? 0 : 1}'; then
        echo 'PASS: Active GNOME Shell --mode=gdm confirmed.'
        echo 'NEXT: secure an offline VM checkpoint before prototype install.'
    else
        echo 'NOT VERIFIED: No active GNOME Shell --mode=gdm was found.'
        echo 'Do not install or enable a greeter extension yet.'
        echo 'Confirm that the VM GUI is showing the genuine GDM login screen.'
        exit 3
    fi
)
GUEST
)
