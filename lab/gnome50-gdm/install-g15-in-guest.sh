#!/usr/bin/env bash
# G1.5: isolated VM-only lifecycle update; retains G1.4 visual engine.
# Root inside Ubuntu GNOME 50 test VM. NEVER install on BlackPearl.
(
    set -euo pipefail
    echo '========== G1.5: VM-ONLY GREETER STABILITY UPGRADE =========='
    test "$(id -u)" -eq 0 || { echo 'Guest sudo required.' >&2; exit 1; }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    test "$(dpkg-query -W -f='${Version}' gdm3)" = '50.1-0ubuntu0.1'
    test "$(id -u test1)" -eq 1000
    test "$(systemd-detect-virt)" != none || {
        echo 'Refusing GDM modification outside the isolated VM.' >&2; exit 1;
    }
    systemctl is-active --quiet gdm.service

    PARENT='/usr/share/gnome-shell/extensions'
    EXT="$PARENT/mellon-greeter@local"
    BACKUP="$PARENT/.mellon-g15-previous-001"
    DIR='/home/test1/.local/state/mellon-gdm/g15-incoming-001'
    ROLLBACK='/usr/local/sbin/mellon-greeter-g15-rollback'
    PROFILE='/etc/dconf/profile/gdm'
    KEYFILE='/etc/dconf/db/gdm.d/95-mellon-greeter'
    FILES=(extension.js metadata.json)

    test -f /var/lib/mellon-greeter-g1-installed
    test -d "$EXT" && test ! -L "$EXT"
    test -d "$DIR" && test ! -L "$DIR"
    test "$(stat -c %U "$DIR")" = test1
    test "$(stat -c %u "$EXT" "$PROFILE" "$KEYFILE" | sort -u)" = 0
    test "$(stat -c %U "$PARENT")" = root
    for path in "$BACKUP" "$ROLLBACK"; do
        if test -e "$path" || test -L "$path"; then
            echo "Existing G1.5 recovery artifact: $path" >&2
            echo 'Stop; never overwrite an earlier or partial installation.' >&2
            exit 1
        fi
    done
    for file in "${FILES[@]}" SHA256SUMS \
                install-g15-in-guest.sh rollback-g15-in-guest.sh; do
        test -f "$DIR/$file" && test ! -L "$DIR/$file" || {
            echo "Missing or linked G1.5 staged file: $file" >&2; exit 1;
        }
    done
    (cd "$DIR" && sha256sum -c SHA256SUMS)

    python3 - "$EXT" "$DIR" "$PROFILE" "$KEYFILE" <<'PY'
import json,sys
from pathlib import Path
old,stage,profile,keyfile=map(Path,sys.argv[1:])
before=json.loads((old/'metadata.json').read_text())
after=json.loads((stage/'metadata.json').read_text())
for meta in (before,after):
    if (meta.get('uuid')!='mellon-greeter@local'
        or meta.get('session-modes')!=['gdm'
        ] or meta.get('shell-version')!=['50']):
        raise SystemExit('Unexpected GNOME 50 GDM extension metadata')
library=json.loads((old/'library.json').read_text())
if library.get('schema')!='mellon-m6-scene-library-v1' or len(library.get('scenes',[]))!=12:
    raise SystemExit('Expected approved 12-scene pack missing')
for scene in library['scenes']:
    for rel in [scene['image'],*scene['sprites']]:
        if not rel.startswith('assets/') or '..' in Path(rel).parts:
            raise SystemExit('Unexpected photo/sprite path')
        if not (old/rel).is_file() or (old/rel).is_symlink():
            raise SystemExit('Photographic star asset unavailable')
for name in ('greeter-starfield.js','greeter-length-observer.js',
             'stellar-effects.js','hud-layout.js','scene-data.js',
             'observatory-hud.js','stylesheet.css'):
    if not (old/name).is_file() or (old/name).is_symlink():
        raise SystemExit('Installed G1.4 visual module missing: '+name)
if profile.read_text().strip().splitlines()!=[
    'user-db:user','system-db:gdm',
    'file-db:/var/lib/gdm3/greeter-dconf-defaults']:
    raise SystemExit('GDM dconf profile changed; refusing')
if keyfile.read_text().strip().splitlines()!=[
    '[org/gnome/shell]',"enabled-extensions=['mellon-greeter@local']"]:
    raise SystemExit('GDM extension enablement changed; refusing')
expected={'extension.js','metadata.json','install-g15-in-guest.sh',
          'rollback-g15-in-guest.sh','SHA256SUMS'}
if {p.name for p in stage.iterdir()}!=expected:
    raise SystemExit('Unexpected G1.5 staged files')
print('PASS: existing G1.4 visuals and native GDM settings intact')
PY

    grep -Fq '[Mellon Greeter G1.4] enabled in gdm mode' "$EXT/extension.js" || {
        echo 'Active GDM greeter is NOT the approved G1.4 build.' >&2; exit 1;
    }
    grep -Fq 'topLeft: {x: pad, y: 14,' "$EXT/hud-layout.js"
    grep -Fq '[Mellon Greeter G1.5] enabled in gdm mode' "$DIR/extension.js"
    grep -Fq 'GREETER_MAX_REBIND_TICKS = 120' "$DIR/extension.js"
    grep -Fq 'this._selectedScene = scene;' "$DIR/extension.js"
    grep -Fq "new GreeterStarfield(container, scene, sprites, hud)" "$DIR/extension.js"
    grep -Fq "new GreeterLengthObserver(" "$DIR/extension.js"
    if find "$EXT" -type l -print -quit | grep -q .; then
        echo 'Unexpected symlink in installed G1.4.' >&2; exit 1;
    fi

    # Verify recoverability before touching the installed GNOME greeter.
    install -Dm 700 -- "$DIR/rollback-g15-in-guest.sh" "$ROLLBACK"
    NEXT="$(mktemp -d "$PARENT/.mellon-g15-next.XXXXXXXX")"
    chmod 700 "$NEXT"
    recover() {
        status=$?
        if ((status != 0)) && test ! -e "$EXT" && test -d "$BACKUP"; then
            mv -T -- "$BACKUP" "$EXT" || true
            chmod 755 "$EXT" 2>/dev/null || true
            echo 'G1.4 auto-recovery attempted following interrupted upgrade.' >&2
        fi
        if test -n "${NEXT:-}" && test -d "$NEXT"; then
            rm -rf -- "$NEXT"
        fi
    }
    trap recover EXIT
    cp -a -- "$EXT/." "$NEXT/"
    for file in "${FILES[@]}"; do
        install -m 644 -- "$DIR/$file" "$NEXT/$file"
    done
    chown -R root:root -- "$NEXT"
    find "$NEXT" -type d -exec chmod 755 {} +
    if find "$NEXT" -type l -print -quit | grep -q .; then
        echo 'Unexpected symlink in assembled G1.5.' >&2; exit 1;
    fi
    test -f "$NEXT/library.json" && test -f "$NEXT/scene-data.js"
    test -f "$NEXT/greeter-starfield.js"
    test -f "$NEXT/greeter-length-observer.js"
    test -f "$NEXT/stylesheet.css"
    grep -Fq 'GREETER_MAX_REBIND_TICKS = 120' "$NEXT/extension.js"
    grep -Fq 'topLeft: {x: pad, y: 14,' "$NEXT/hud-layout.js"

    # Rename on SAME filesystem; original G1.4 directory stays intact.
    mv -T -- "$EXT" "$BACKUP"
    chmod 700 "$BACKUP"
    mv -T -- "$NEXT" "$EXT"
    NEXT=''
    trap - EXIT

    echo
    echo 'PASS: Mellon G1.5 stability patch installed in TEST VM only.'
    echo 'Entire G1.4 extension retained as .mellon-g15-previous-001.'
    echo 'No changes to GDM login controls, PAM, dconf, M8 or BlackPearl.'
    echo 'NO GDM restart. Reboot only the isolated VM for functional tests.'
    echo "Emergency rollback: sudo $ROLLBACK"
)
