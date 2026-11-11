#!/usr/bin/env bash
# G1.4 GNOME 50 greeter upgrade: photo-source star effects + visual-only
# length observer. TEST VM ROOT ONLY. No password text, auth or dconf writes.
(
    set -euo pipefail
    echo '========== G1.4: GUARDED VM-ONLY GREETER UPGRADE =========='
    test "$(id -u)" -eq 0 || { echo 'Requires test VM sudo.' >&2; exit 1; }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    test "$(dpkg-query -W -f='${Version}' gdm3)" = '50.1-0ubuntu0.1'
    test "$(id -u test1)" -eq 1000
    test "$(systemd-detect-virt)" != none || {
        echo 'Refusing upgrade outside virtual machine.' >&2; exit 1;
    }
    systemctl is-active --quiet gdm.service

    PARENT='/usr/share/gnome-shell/extensions'
    EXT="$PARENT/mellon-greeter@local"
    BACKUP="$PARENT/.mellon-g14-previous-001"
    DIR='/home/test1/.local/state/mellon-gdm/g14-incoming-001'
    ROLLBACK='/usr/local/sbin/mellon-greeter-g14-rollback'
    PROFILE='/etc/dconf/profile/gdm'
    KEYFILE='/etc/dconf/db/gdm.d/95-mellon-greeter'
    FILES=(extension.js metadata.json greeter-starfield.js
           greeter-length-observer.js stellar-effects.js)
    test -f /var/lib/mellon-greeter-g1-installed
    test -d "$EXT" && test ! -L "$EXT"
    test -d "$DIR" && test ! -L "$DIR"
    test "$(stat -c '%U' "$DIR")" = test1
    test "$(stat -c %u "$EXT" "$PROFILE" "$KEYFILE" | sort -u)" = 0
    test "$(stat -c %U "$PARENT")" = root
    for path in "$BACKUP" "$ROLLBACK"; do
        if test -e "$path" || test -L "$path"; then
            echo "Existing G1.4 recovery path: $path" >&2
            echo 'Do not reinstall over an existing or partial upgrade.' >&2
            exit 1
        fi
    done
    for file in "${FILES[@]}" SHA256SUMS \
                install-g14-in-guest.sh rollback-g14-in-guest.sh; do
        test -f "$DIR/$file" && test ! -L "$DIR/$file" || {
            echo "Missing or linked staged G1.4 file: $file" >&2; exit 1;
        }
    done
    ( cd "$DIR" && sha256sum -c SHA256SUMS )

    python3 - "$EXT" "$DIR" "$PROFILE" "$KEYFILE" <<'PY'
import json,sys
from pathlib import Path
old,stage,profile,keyfile=map(Path,sys.argv[1:])
meta0=json.loads((old/'metadata.json').read_text())
meta1=json.loads((stage/'metadata.json').read_text())
for meta in (meta0,meta1):
    if (meta.get('uuid')!='mellon-greeter@local'
        or meta.get('session-modes')!=['gdm']
        or meta.get('shell-version')!=['50']):
        raise SystemExit('Unexpected GNOME 50 greeter extension metadata')
library=json.loads((old/'library.json').read_text())
if library.get('schema')!='mellon-m6-scene-library-v1' or len(library.get('scenes',[]))!=12:
    raise SystemExit('Existing approved 12-scene library missing')
# The previous photo, sprites, HUD and dconf must remain known and intact.
for scene in library['scenes']:
    for rel in [scene['image'],*scene['sprites']]:
        if not rel.startswith('assets/') or '..' in Path(rel).parts:
            raise SystemExit('Unexpected photographic asset path')
        if not (old/rel).is_file() or (old/rel).is_symlink():
            raise SystemExit('Missing curated photographic asset')
if not (old/'hud-layout.js').is_file() or not (old/'scene-data.js').is_file():
    raise SystemExit('Expected G1.3.1 layout and scene library absent')
if profile.read_text().strip().splitlines()!=[
    'user-db:user','system-db:gdm',
    'file-db:/var/lib/gdm3/greeter-dconf-defaults']:
    raise SystemExit('GDM admin profile changed: refusing upgrade')
if keyfile.read_text().strip().splitlines()!=[
    '[org/gnome/shell]',"enabled-extensions=['mellon-greeter@local']"]:
    raise SystemExit('GDM admin keyfile changed: refusing upgrade')
expected={'extension.js','metadata.json','greeter-starfield.js',
          'greeter-length-observer.js','stellar-effects.js',
          'install-g14-in-guest.sh','rollback-g14-in-guest.sh',
          'SHA256SUMS'}
if {p.name for p in stage.iterdir()}!=expected:
    raise SystemExit('Unknown staged files in G1.4 bundle')
print('PASS: G1.3.1 assets and native GDM config unchanged')
PY
    # Only upgrade the VISUALLY APPROVED G1.3.1 version.
    grep -Fq '[Mellon Greeter G1.3] enabled in gdm mode' "$EXT/extension.js" || {
        echo 'Installed version is not approved G1.3.1; refusing.' >&2
        exit 1
    }
    grep -Fq 'topLeft: {x: pad, y: 14,' "$EXT/hud-layout.js"
    grep -Fq '[Mellon Greeter G1.4] enabled in gdm mode' "$DIR/extension.js"
    grep -Fq 'new GreeterLengthObserver(' "$DIR/extension.js"
    grep -Fq 'new GreeterStarfield(' "$DIR/extension.js"
    grep -Fq "buffer.connect('notify::length'" "$DIR/greeter-length-observer.js"

    # Guard against malicious or unexpected symlink trees in the existing
    # system extension: never follow them while copying to system folders.
    if find "$EXT" -type l -print -quit | grep -q .; then
        echo 'Unexpected symlink in system greeter extension.' >&2; exit 1;
    fi

    # Publish the emergency recovery command BEFORE changing the
    # installed extension. No Node.js required inside the VM.
    install -Dm 700 -- "$DIR/rollback-g14-in-guest.sh" "$ROLLBACK"
    NEXT="$(mktemp -d "$PARENT/.mellon-g14-next.XXXXXXXX")"
    chmod 700 "$NEXT"
    recover() {
        code=$?
        if ((code != 0)) && test ! -e "$EXT" && test -d "$BACKUP"; then
            mv -T -- "$BACKUP" "$EXT" || true
            chmod 755 "$EXT" 2>/dev/null || true
            echo 'Recovery attempted: original G1.3.1 restored.' >&2
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
        echo 'Unexpected symlink in assembled G1.4.' >&2; exit 1;
    fi
    test -f "$NEXT/library.json" && test -f "$NEXT/scene-data.js"
    test -f "$NEXT/assets/blue-gold-nebula/background.jpg"
    test -f "$NEXT/greeter-starfield.js"
    test -f "$NEXT/greeter-length-observer.js"
    grep -Fq 'container.insert_child_below(starfield.actor, dialog)' "$NEXT/extension.js"
    grep -Fq 'topLeft: {x: pad, y: 14,' "$NEXT/hud-layout.js"

    # Atomic on-filesystem rename, original G1.3.1 preserved entirely.
    mv -T -- "$EXT" "$BACKUP"
    chmod 700 "$BACKUP"
    mv -T -- "$NEXT" "$EXT"
    NEXT=''
    trap - EXIT
    echo
    echo 'PASS: Mellon G1.4 constellation effects installed in TEST VM only.'
    echo 'Full G1.3.1 greeter preserved in .mellon-g14-previous-001.'
    echo 'Native GDM authentication, dconf, and BlackPearl unchanged.'
    echo 'NO service restart. Reboot only the test VM to inspect.'
    echo "Emergency guest rollback: sudo $ROLLBACK"
)
