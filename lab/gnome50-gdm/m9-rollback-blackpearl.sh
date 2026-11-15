#!/usr/bin/env bash
# One-step GDM M9 rollback. Safe from a TTY; does not restart GDM.
(
    set -euo pipefail
    test "$(id -u)" -eq 0
    ACTIVE='/usr/share/gnome-shell/extensions/mellon-greeter@local'
    PARENT="$(dirname -- "$ACTIVE")"
    PREVIOUS="$PARENT/.mellon-greeter-m9-original"
    FAILED="$PARENT/.mellon-greeter-m9-failed"
    test -d "$ACTIVE" && test ! -L "$ACTIVE"
    test -d "$PREVIOUS" && test ! -L "$PREVIOUS"
    test ! -e "$FAILED" && test ! -L "$FAILED"
    test -f "$ACTIVE/greeter-visuals.js"
    grep -Fq '[Mellon GDM M9]' "$ACTIVE/greeter-visuals.js"
    (cd "$PREVIOUS" && sha256sum -c SHA256SUMS >/dev/null)
    mv -T -- "$ACTIVE" "$FAILED"
    if ! mv -T -- "$PREVIOUS" "$ACTIVE"; then
        mv -T -- "$FAILED" "$ACTIVE"
        echo 'Restore failed; M9 restored in place for safety.' >&2
        exit 1
    fi
    echo 'PASS: original GDM greeter restored on disk.'
    echo "Quarantined M9 package: $FAILED"
    echo 'No live GDM restart. A fresh greeter session is required.'
)
