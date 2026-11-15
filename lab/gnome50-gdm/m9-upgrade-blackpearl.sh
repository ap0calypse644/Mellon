#!/usr/bin/env bash
# M9 GDM-only updater for the existing BlackPearl G1.8 installation.
# NEVER restart the live display manager. Activate on next fresh GDM session.
(
    set -euo pipefail
    test "$(id -u)" -eq 0
    test "$(hostname -s | tr '[:upper:]' '[:lower:]')" = blackpearl
    test "$(systemd-detect-virt)" = none
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    case "$(dpkg-query -W -f='${Version}' gdm3)" in 50.1*) ;; *) exit 1 ;; esac

    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    SOURCE="$HERE/greeter-extension"
    ACTIVE='/usr/share/gnome-shell/extensions/mellon-greeter@local'
    PARENT="$(dirname -- "$ACTIVE")"
    PREVIOUS="$PARENT/.mellon-greeter-m9-original"
    BACKUP='/var/backups/mellon-blackpearl/gdm-m9-original'

    test -d "$ACTIVE" && test ! -L "$ACTIVE"
    test ! -e "$PREVIOUS" && test ! -L "$PREVIOUS"
    test ! -e "$BACKUP" && test ! -L "$BACKUP"
    test -f "$ACTIVE/library.json"
    test -f "$ACTIVE/SHA256SUMS"
    test -f "$SOURCE/greeter-visuals.js"
    grep -Fq '[Mellon GDM M9]' "$SOURCE/greeter-visuals.js"
    python3 - "$ACTIVE/metadata.json" "$SOURCE/metadata.json" <<'PY'
import json,sys
before,after=[json.load(open(p,encoding='utf8')) for p in sys.argv[1:]]
for obj in [before,after]:
    if (obj.get('uuid')!='mellon-greeter@local'
        or obj.get('shell-version')!=['50']
        or obj.get('session-modes')!=['gdm']):
        raise SystemExit('Refusing unknown GDM extension configuration')
PY

    echo '========== VERIFY ORIGINAL GDM PACKAGE =========='
    (cd "$ACTIVE" && sha256sum -c SHA256SUMS >/dev/null)
    echo 'PASS: installed GDM package matches its own original checksums'

    FILES=(extension.js greeter-visuals.js greeter-password-cover.js
        greeter-account-chooser.js observatory-intro.js)
    # JavaScript syntax is checked by the unprivileged preflight before
    # sudo. BlackPearl keeps Node in the user's PATH, not sudo secure_path.
    # Never execute a user-installed Node binary as root.
    for file in "${FILES[@]}"; do
        test -f "$SOURCE/$file" && test ! -L "$SOURCE/$file"
    done
    echo 'PASS: required upgrade files present (run user-level syntax preflight first)'

    echo '========== STAGE COMPLETE GREETER PACKAGE =========='
    STAGE="$(mktemp -d "$PARENT/.mellon-gdm-m9-stage.XXXXXXXX")"
    moved=0
    cleanup() {
        code=$?
        if test "$moved" -eq 1 && test ! -e "$ACTIVE" &&
           test -d "$PREVIOUS"; then
            mv -T -- "$PREVIOUS" "$ACTIVE" || true
        fi
        test ! -d "${STAGE:-}" || rm -rf -- "$STAGE"
        exit "$code"
    }
    trap cleanup EXIT
    cp -a -- "$ACTIVE/." "$STAGE/"
    for file in "${FILES[@]}"; do
        install -m 644 -- "$SOURCE/$file" "$STAGE/$file"
    done
    if find "$STAGE" -type l -print -quit | grep -q .; then
        echo 'Refusing GDM package containing symlinks' >&2
        exit 1
    fi
    (cd "$STAGE" &&
        find . -type f ! -name SHA256SUMS -print0 | sort -z |
            xargs -0 sha256sum > SHA256SUMS &&
        sha256sum -c SHA256SUMS >/dev/null)
    chown -R root:root "$STAGE"
    chmod -R a+rX,go-w "$STAGE"

    echo '========== SAVE COMPLETE ORIGINAL GREETER =========='
    install -d -o root -g root -m 700 -- "$(dirname "$BACKUP")"
    cp -a -- "$ACTIVE" "$BACKUP"
    (cd "$BACKUP" && sha256sum -c SHA256SUMS >/dev/null)
    echo "Full original backup: $BACKUP"

    echo '========== ACTIVATE AT NEXT GDM SESSION =========='
    mv -T -- "$ACTIVE" "$PREVIOUS"
    moved=1
    mv -T -- "$STAGE" "$ACTIVE"
    moved=2
    STAGE=''
    trap - EXIT
    (cd "$ACTIVE" && sha256sum -c SHA256SUMS >/dev/null)
    echo 'PASS: M9 greeter installed on disk, original recovery copy retained.'
    echo "Original recovery copy: $PREVIOUS"
    echo 'GDM was NOT restarted. New code loads on a new GDM Shell process.'
    echo 'If needed, use sudo bash lab/gnome50-gdm/m9-rollback-blackpearl.sh'
)
