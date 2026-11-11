#!/usr/bin/env bash
# Run diagnostic with interactive sudo ONLY inside the known test VM.
# All inspections are read-only; the VM and host login remain unchanged.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    AUDIT="$HERE/diagnose-g1-greeter.py"
    virsh -c qemu:///system dominfo "$VM" >/dev/null
    test -f "$AUDIT" && test ! -L "$AUDIT" || {
        echo "Expected read-only diagnosis script missing: $AUDIT" >&2
        exit 1
    }
    echo '========== VERIFY ONLY THE MELLON TEST VM =========='
    ssh -o BatchMode=yes mellon '
        test "$(id -un)" = "test1" &&
        test "$(gnome-shell --version)" = "GNOME Shell 50.1" &&
        test "$(dpkg-query -W -f="\${Version}" gdm3)" = "50.1-0ubuntu0.1"
    ' || {
        echo 'Unexpected guest identity or GNOME/GDM version; refusing' >&2
        exit 1
    }

    encoded="$(base64 -w 0 -- "$AUDIT")"
    test -n "$encoded"
    echo
    echo '========== DIAGNOSE ACTUAL GDM GREETER (READ ONLY) =========='
    echo 'The VM may prompt for the guest test1 sudo password.'
    ssh -tt -o BatchMode=yes mellon \
       "sudo python3 -c 'import base64; exec(compile(base64.b64decode(\"$encoded\"), \"<mellon-g1-diagnostics>\", \"exec\"))'"
)
