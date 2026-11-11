#!/usr/bin/env bash
# Mellon G1.2.1: STAGE ONLY the corrected GDM backdrop source into
# mellon-gnome50-lab (no sudo, GDM modification, or reboot).
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    SOURCE="$ROOT/greeter-extension/extension.js"
    REMOTE_DIR='/home/test1/.local/state/mellon-gdm/g1-update-003'
    BACKUP="$HOME/VMs/Mellon/checkpoints/MELLON-GDM-PREINSTALL-001"
    test -d "$BACKUP" && test -f "$BACKUP/SHA256SUMS" || {
        echo 'GDM backup checkpoint missing: refusing update staging' >&2
        exit 1
    }
    test -f "$SOURCE" && test ! -L "$SOURCE"
    test -f "$ROOT/update-g121-in-guest.sh"
    test -f "$ROOT/rollback-g121-in-guest.sh"
    virsh -c qemu:///system dominfo "$VM" >/dev/null
    # JavaScript syntax is validated on BlackPearl only.
    node --input-type=module --check < "$SOURCE"
    # G1.2.1's updater replaces ONLY extension.js. Once G1.3 adds
    # external HUD modules and stylesheet, this legacy updater MUST NOT
    # deploy newer code without its dependencies. Use a new installer.
    if ! grep -Fq '[Mellon Greeter G1.2.1] enabled in gdm mode' "$SOURCE"; then
        echo 'G1.2.1 stage retired: current extension needs newer HUD modules.' >&2
        echo 'Refusing to stage an incomplete greeter package.' >&2
        exit 1
    fi
    grep -Fq 'container.insert_child_below(photo, dialog)' "$SOURCE"
    grep -Fq 'Main.screenShield?._lockDialogGroup' "$SOURCE"

    echo '========== CHECK ONLY THE KNOWN VM =========='
    ssh -o BatchMode=yes mellon 'bash -s' <<'GUEST'
(
    set -euo pipefail
    test "$(id -un)" = test1
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    test "$(dpkg-query -W -f='${Version}' gdm3)" = '50.1-0ubuntu0.1'
    test -d /usr/share/gnome-shell/extensions/mellon-greeter@local
    test -f /var/lib/mellon-greeter-g1-installed
    # An interrupted earlier staging run may have already copied all
    # three files. It is safe to inspect, but NEVER overwrite unknown files.
    TARGET="$HOME/.local/state/mellon-gdm/g1-update-003"
    if test -e "$TARGET" || test -L "$TARGET"; then
        test -d "$TARGET" && test ! -L "$TARGET" || {
            echo "Unsafe pre-existing staging path: $TARGET" >&2; exit 1;
        }
    fi
)
GUEST

    echo '========== STAGE G1.2.1 (NO SYSTEM WRITES) =========='
    # Node.js is needed ONLY on BlackPearl. The Ubuntu VM need not have it.
    # For crash-resume, never overwrite an already staged update: compare
    # each file against the reviewed host source before trusting it.
    if ssh -o BatchMode=yes mellon \
        'test -e "$HOME/.local/state/mellon-gdm/g1-update-003" || test -L "$HOME/.local/state/mellon-gdm/g1-update-003"'; then
        echo 'Previous staging directory exists; verifying in place without overwriting.'
    else
        ssh -o BatchMode=yes mellon \
            'mkdir -p "$HOME/.local/state/mellon-gdm"'
        ssh -o BatchMode=yes mellon \
            'mkdir "$HOME/.local/state/mellon-gdm/g1-update-003"'
        scp -q -- "$SOURCE" "$ROOT/update-g121-in-guest.sh" \
            "$ROOT/rollback-g121-in-guest.sh" "mellon:$REMOTE_DIR/"
    fi

    # Trusted digests are calculated from the HOST source, not accepted
    # from an unverified guest directory or previous failed run.
    EXT_HASH="$(sha256sum -- "$SOURCE" | cut -d' ' -f1)"
    APPLY_HASH="$(sha256sum -- "$ROOT/update-g121-in-guest.sh" | cut -d' ' -f1)"
    RESTORE_HASH="$(sha256sum -- "$ROOT/rollback-g121-in-guest.sh" | cut -d' ' -f1)"

    ssh -o BatchMode=yes mellon \
        "bash -s -- '$EXT_HASH' '$APPLY_HASH' '$RESTORE_HASH'" <<'GUEST'
(
    set -euo pipefail
    test "$(id -un)" = 'test1'
    TARGET="$HOME/.local/state/mellon-gdm/g1-update-003"
    test -d "$TARGET" && test ! -L "$TARGET"
    test "$(stat -c '%U' "$TARGET")" = 'test1' || {
        echo 'Staging directory is not owned by test1; refusing.' >&2
        exit 1
    }
    cd "$TARGET"
    for file in extension.js update-g121-in-guest.sh rollback-g121-in-guest.sh; do
        test -f "$file" && test ! -L "$file" || {
            echo "Missing or linked staged file: $file" >&2
            exit 1
        }
    done
    # Refuse unknown entries (including hidden files), but don't treat
    # a non-matching glob as a literal pathname on a clean directory.
    # No automatic deletion or re-copying.
    shopt -s dotglob nullglob
    for file in *; do
        case "$file" in
            .|..|extension.js|update-g121-in-guest.sh|rollback-g121-in-guest.sh|SHA256SUMS) ;;
            *) echo "Unexpected staging entry: $file" >&2; exit 1 ;;
        esac
    done
    bash -n update-g121-in-guest.sh
    bash -n rollback-g121-in-guest.sh
    grep -Fq 'container.insert_child_below(photo, dialog)' extension.js

    # Verify the complete staged bundle against the host's three digests.
    printf '%s  %s\n' "$1" extension.js "$2" update-g121-in-guest.sh \
        "$3" rollback-g121-in-guest.sh | sha256sum -c -

    # The root updater already consumes an extension.js manifest. Write
    # it only AFTER the full host-to-guest integrity check has passed.
    printf '%s  extension.js\n' "$1" > SHA256SUMS
    sha256sum -c SHA256SUMS
    echo 'PASS: G1.2.1 source and scripts verified on the VM.'
    echo 'No guest Node.js required. No GDM configuration or source modified.'
)
GUEST
)
