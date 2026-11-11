#!/usr/bin/env bash
# G1.0.3 read-only audit of the REAL GNOME greeter.
# Interactive sudo is performed over the VM's SSH PTY, never on BlackPearl.
# No password is written to a file, command argument or shell history.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    AUDIT="$HERE/read-effective-greeter-settings.py"

    virsh -c qemu:///system dominfo "$VM" >/dev/null
    test -f "$AUDIT" && test ! -L "$AUDIT" || {
        echo "Missing audited read-only Python file: $AUDIT" >&2
        exit 1
    }

    echo '========== VERIFY GUEST IDENTITY =========='
    ssh -o BatchMode=yes mellon '
        test "$(id -un)" = "test1" &&
        test "$(gnome-shell --version)" = "GNOME Shell 50.1" &&
        test "$(dpkg-query -W -f="\${Version}" gdm3)" = "50.1-0ubuntu0.1"
    ' || {
        echo 'Wrong VM guest identity or version; refusing audit' >&2
        exit 1
    }

    # The script is read-only and contains NO credentials. Encoding it as
    # a command-line argument avoids uploading any privileged script to
    # the guest and leaves stdin/PTY available for interactive sudo.
    encoded="$(base64 -w 0 -- "$AUDIT")"
    test -n "$encoded"

    echo
    echo '========== READ ACTUAL GDM GREETER SETTINGS =========='
    echo 'Guest sudo may prompt for the test1 password in the SSH terminal.'
    ssh -tt -o BatchMode=yes mellon \
        "sudo python3 -c 'import base64; exec(compile(base64.b64decode(\"$encoded\"), \"<mellon-gdm-read-only-audit>\", \"exec\"))'"
)
