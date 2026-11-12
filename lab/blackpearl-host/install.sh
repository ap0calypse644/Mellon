#!/usr/bin/env bash
# BlackPearl ONLY. Install verified G1.8 GDM + M8.4 user unlock extension.
# Requires successful host preflight, local staging and an attended console.
# Never restarts GNOME, kills sessions, or automatically reboots.
(
    set -euo pipefail
    echo '========== ATTENDED BLACKPEARL INSTALL (NO REBOOT) =========='
    test "$(id -u)" -eq 0 || {
        echo 'Requires sudo root on physical BlackPearl.' >&2
        exit 1
    }
    test "$(hostname -s | tr '[:upper:]' '[:lower:]')" = blackpearl
    test "$(systemd-detect-virt)" = none
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    case "$(dpkg-query -W -f='${Version}' gdm3)" in 50.1*) ;; *) exit 1 ;; esac
    systemctl is-active --quiet display-manager.service
    test "$(id -u ap0calypse)" -eq 1000
    USERHOME="$(getent passwd ap0calypse | cut -d: -f6)"
    USERGROUP="$(id -gn ap0calypse)"
    test -n "$USERHOME" && test -d "$USERHOME"
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    STAGE="$USERHOME/.local/state/mellon-blackpearl/stage-v1"
    ROOT='/var/backups/mellon-blackpearl'
    BACKUP="$ROOT/host-v1"
    SYS_EXT='/usr/share/gnome-shell/extensions/mellon-greeter@local'
    USER_EXT="$USERHOME/.local/share/gnome-shell/extensions/mellon-lab@local"
    USER_PARENT="$(dirname "$USER_EXT")"
    SYS_PARENT="$(dirname "$SYS_EXT")"
    PROFILE='/etc/dconf/profile/gdm'
    KEYFILE='/etc/dconf/db/gdm.d/95-mellon-greeter'
    DB='/etc/dconf/db/gdm'
    ROLLBACK='/usr/local/sbin/mellon-blackpearl-rollback'
    MARKER='/var/lib/mellon-blackpearl-host-v1'
    EXPECTED_PROFILE='user-db:user
system-db:gdm
file-db:/var/lib/gdm3/greeter-dconf-defaults'
    EXPECTED_KEY='[org/gnome/shell]
enabled-extensions=['\''mellon-greeter@local'\'']'

    for path in "$BACKUP" "$SYS_EXT" "$USER_EXT" "$PROFILE" "$KEYFILE" \
                "$DB" "$ROLLBACK" "$MARKER" /etc/dconf/db/gdm.d; do
        if test -e "$path" || test -L "$path"; then
            echo "Refusing to replace existing host configuration: $path" >&2
            exit 1
        fi
    done
    for source in "$STAGE" "$STAGE/gdm" "$STAGE/lock"; do
        test -d "$source" && test ! -L "$source"
        test "$(stat -c %U "$source")" = ap0calypse
    done
    test -f "$STAGE/BUNDLE-SHA256SUMS"
    (cd "$STAGE" && sha256sum -c BUNDLE-SHA256SUMS)
    for bundle in gdm lock; do
        (cd "$STAGE/$bundle" && sha256sum -c SHA256SUMS >/dev/null)
        if find "$STAGE/$bundle" -type l -print -quit | grep -q .; then
            echo 'Untrusted linked file in production staging.' >&2
            exit 1
        fi
        if find "$STAGE/$bundle" -type f -links +1 -print -quit | grep -q .; then
            echo 'Hardlinked production bundle; refusing.' >&2
            exit 1
        fi
    done

    test "$(stat -c '%U' "$SYS_PARENT" /etc/dconf)" = $'root\nroot'
    test -r /usr/share/dconf/profile/gdm
    test -r /var/lib/gdm3/greeter-dconf-defaults
    python3 - "$STAGE" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1])
vendor=Path('/usr/share/dconf/profile/gdm')
lines=[x.strip() for x in vendor.read_text().splitlines()
       if x.strip() and not x.lstrip().startswith('#')]
if lines!=['user-db:user','file-db:/var/lib/gdm3/greeter-dconf-defaults']:
    raise SystemExit('Unexpected vendor profile; refusing host install')
for typ in ('gdm','lock'):
    base=root/typ
    meta=json.loads((base/'metadata.json').read_text())
    library=json.loads((base/'library.json').read_text())
    if (meta['uuid']!=('mellon-greeter@local' if typ=='gdm' else 'mellon-lab@local')
        or meta['shell-version']!=['50']
        or meta['session-modes']!=(['gdm'] if typ=='gdm' else ['unlock-dialog'])):
        raise SystemExit('Unexpected production '+typ+' extension metadata')
    if library['schema']!='mellon-m6-scene-library-v1' or len(library['scenes'])!=12:
        raise SystemExit('Approved twelve-photo corpus missing')
    for scene in library['scenes']:
        for rel in [scene['image'], *scene['sprites']]:
            if not rel.startswith('assets/') or '..' in Path(rel).parts:
                raise SystemExit('Unsafe asset path')
            a=base/rel
            if not a.is_file() or a.is_symlink():
                raise SystemExit('Missing source-derived star sprite')
config=json.loads((root/'lock'/'scene-config.json').read_text())
if config['mode'] not in ('fixed','random-on-lock') or config['stages']!=8:
    raise SystemExit('Unsupported source scene mode')
print('PASS: verified both G1.8/M8.4 packages, GNOME 50, and vetted photos')
PY
    echo
    echo '========== SNAPSHOT ORIGINAL HOST CONFIGURATION =========='
    mkdir -p -- "$ROOT"
    chmod 700 "$ROOT"
    install -d -m 700 -- "$BACKUP"
    printf '%s\n' 'MELLON-BLACKPEARL-HOST-V1' > "$BACKUP/host-install-sentinel"
    chmod 600 "$BACKUP/host-install-sentinel"
    cp -a -- /usr/share/dconf/profile/gdm "$BACKUP/gdm-vendor-profile.original"
    if test -e /etc/gdm3/custom.conf; then
        cp -a -- /etc/gdm3/custom.conf "$BACKUP/gdm-custom.conf.untouched"
    fi
    stat -c '%n %U %G %a' "$SYS_PARENT" /etc/dconf \
        > "$BACKUP/prior-path-permissions.txt"
    # No user settings are modified by this root installation. Preserve the
    # list for potential manual recovery/verification.
    echo "Production installation candidate: G1.8 GDM + M8.4 unlock" \
        > "$BACKUP/description.txt"

    echo
    echo '========== MAKE TTY ROLLBACK AVAILABLE BEFORE ANY CHANGE =========='
    install -Dm 700 -- "$HERE/rollback.sh" "$ROLLBACK"
    on_exit() {
        status=$?
        if ((status != 0)); then
            echo 'Host install failed; attempting on-disk rollback.' >&2
            bash "$ROLLBACK" || {
                echo 'Emergency rollback failed; follow TTY recovery documentation.' >&2
            }
        fi
    }
    trap on_exit EXIT

    echo
    echo '========== INSTALL USER UNLOCK EXTENSION (NOT ENABLED YET) =========='
    install -d -o ap0calypse -g "$USERGROUP" -m 755 -- "$USER_PARENT"
    TMP_LOCK="$(mktemp -d "$USER_PARENT/.mellon-host-lock.XXXXXXXX")"
    cp -a -- "$STAGE/lock/." "$TMP_LOCK/"
    chown -R ap0calypse:"$USERGROUP" "$TMP_LOCK"
    find "$TMP_LOCK" -type d -exec chmod 755 {} +
    find "$TMP_LOCK" -type f -exec chmod 644 {} +
    mv -T -- "$TMP_LOCK" "$USER_EXT"

    echo
    echo '========== INSTALL ROOT-OWNED GDM EXTENSION (NOT ACTIVE YET) =========='
    TMP_GDM="$(mktemp -d "$SYS_PARENT/.mellon-host-gdm.XXXXXXXX")"
    cp -a -- "$STAGE/gdm/." "$TMP_GDM/"
    chown -R root:root "$TMP_GDM"
    find "$TMP_GDM" -type d -exec chmod 755 {} +
    find "$TMP_GDM" -type f -exec chmod 644 {} +
    mv -T -- "$TMP_GDM" "$SYS_EXT"

    echo
    echo '========== ENABLE GDM EXTENSION FOR NEXT GREETER SESSION =========='
    install -d -m 755 /etc/dconf/profile /etc/dconf/db/gdm.d
    printf '%s\n' "$EXPECTED_PROFILE" > "$PROFILE"
    chmod 644 "$PROFILE"
    printf '%s\n' "$EXPECTED_KEY" > "$KEYFILE"
    chmod 644 "$KEYFILE"
    /usr/bin/dconf update

    test -s "$DB"
    grep -Fxq "enabled-extensions=['mellon-greeter@local']" "$KEYFILE"
    grep -Fq '[Mellon Greeter G1.8] enabled in gdm mode' "$SYS_EXT/extension.js"
    grep -Fq 'this._bufferSignalId = buffer.connect(' "$USER_EXT/extension.js"
    test -f "$ROLLBACK" && test -d "$SYS_EXT" && test -d "$USER_EXT"
    printf '%s\n' 'MELLON-BLACKPEARL-HOST-V1' > "$MARKER"
    chmod 600 "$MARKER"
    trap - EXIT
    echo
    echo 'PASS: BlackPearl production code installed; native GNOME session NOT restarted.'
    echo 'NEXT: enable Mellon M8.4 in active user session and TEST LOCK before reboot.'
    echo 'ONLY THEN reboot to activate GDM G1.8.'
    echo 'EMERGENCY TTY: Ctrl+Alt+F3, log in and run:'
    echo "  sudo $ROLLBACK"
    echo '  sudo reboot'
)
