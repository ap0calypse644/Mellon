#!/usr/bin/env bash
# User-level VM-only M8.4 rollback, restoring full visually approved M8.3.2.
(
    set -euo pipefail
    test "$(id -un)" = test1 && test "$(id -u)" -eq 1000
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    test "$(systemd-detect-virt)" != none
    ROOT="$HOME/.local/share/gnome-shell/extensions"
    ACTIVE="$ROOT/mellon-lab@local"
    PREVIOUS="$ROOT/.mellon-m84-previous-001"
    FAILED="$ROOT/.mellon-m84-failed-001"
    test -d "$PREVIOUS" && test ! -L "$PREVIOUS"
    test -f "$PREVIOUS/metadata.json"
    grep -Fq 'Mellon M8.3.2' "$PREVIOUS/metadata.json"
    test ! -e "$FAILED" && test ! -L "$FAILED"
    if test -e "$ACTIVE" || test -L "$ACTIVE"; then
        test -d "$ACTIVE" && test ! -L "$ACTIVE"
        grep -Fq 'Mellon M8.4' "$ACTIVE/metadata.json"
        mv -T -- "$ACTIVE" "$FAILED"
    fi
    mv -T -- "$PREVIOUS" "$ACTIVE"
    echo 'PASS: approved M8.3.2 lock screen restored in TEST VM.'
    echo 'M8.4 quarantined in .mellon-m84-failed-001.'
    echo 'Reboot ONLY the VM, never BlackPearl host.'
)
