#!/usr/bin/env bash
# G1.3: install only the nonreactive Observatory HUD + five-second scan
# in mellon-gnome50-lab. Root inside VM; NEVER on BlackPearl.
# Existing verified G1.2.1 extension becomes an atomic rollback directory.
# No GDM/dconf/PAM mutations and no service restart.
(
    set -euo pipefail
    echo '========== G1.3: VM-ONLY OBSERVATORY GREETER UPGRADE =========='
    test "$(id -u)" -eq 0 || { echo 'Requires guest sudo' >&2; exit 1; }
    test "$(gnome-shell --version)" = 'GNOME Shell 50.1'
    test "$(dpkg-query -W -f='${Version}' gdm3)" = '50.1-0ubuntu0.1'
    test "$(id -u test1)" -eq 1000
    test "$(systemd-detect-virt)" != none || {
        echo 'Refusing installation outside test VM' >&2; exit 1;
    }
    test -n "$(getent passwd gdm-greeter)" || {
        echo 'Cannot confirm GDM greeter account' >&2; exit 1;
    }

    PARENT='/usr/share/gnome-shell/extensions'
    EXT="$PARENT/mellon-greeter@local"
    OLD="$PARENT/.mellon-g13-previous-001"
    DIR='/home/test1/.local/state/mellon-gdm/g13-incoming-001'
    ROLLBACK='/usr/local/sbin/mellon-greeter-g13-rollback'
    PROFILE='/etc/dconf/profile/gdm'
    KEYFILE='/etc/dconf/db/gdm.d/95-mellon-greeter'
    MARKER='/var/lib/mellon-greeter-g1-installed'
    FILES=(extension.js metadata.json hud-state.js hud-layout.js
        hud-progress.js hud-intro-state.js observatory-hud.js
        observatory-intro.js stylesheet.css)
    test -d "$PARENT" && test "$(stat -c %U "$PARENT")" = root
    test -d "$EXT" && test ! -L "$EXT"
    test -d "$DIR" && test ! -L "$DIR"
    test "$(stat -c %U "$DIR")" = test1
    test -f "$MARKER" && test ! -L "$MARKER"
    for path in "$OLD" "$ROLLBACK"; do
        if test -e "$path" || test -L "$path"; then
            echo "G1.3 already or partially installed: $path" >&2
            echo 'Stop and inspect before applying another update.' >&2
            exit 1
        fi
    done
    for file in "${FILES[@]}" install-g13-in-guest.sh rollback-g13-in-guest.sh SHA256SUMS; do
        test -f "$DIR/$file" && test ! -L "$DIR/$file" || {
            echo "Staged G1.3 file missing or linked: $file" >&2; exit 1;
        }
    done
    test "$(stat -c %u "$EXT" "$PROFILE" "$KEYFILE" | sort -u)" = 0
    if find "$EXT" -type l -print -quit | grep -q .; then
        echo 'Unexpected symlink in existing G1 greeter installation' >&2
        exit 1
    fi

    ( cd "$DIR" && sha256sum -c SHA256SUMS )
    python3 - "$EXT" "$DIR" "$PROFILE" "$KEYFILE" <<'PY'
import json,sys
from pathlib import Path
old,stage,profile,keyfile=map(Path,sys.argv[1:])
before=json.loads((old/'metadata.json').read_text())
after=json.loads((stage/'metadata.json').read_text())
library=json.loads((old/'library.json').read_text())
for meta in (before,after):
    if meta.get('uuid')!='mellon-greeter@local' or meta.get('session-modes')!=['gdm'] or meta.get('shell-version')!=['50']:
        raise SystemExit('Unexpected GNOME 50 GDM extension metadata')
if library.get('schema')!='mellon-m6-scene-library-v1' or len(library.get('scenes',[]))!=12:
    raise SystemExit('Missing curated twelve-scene photo library')
if not (old/'scene-data.js').is_file():
    raise SystemExit('Missing original scene-data.js')
if profile.read_text().strip().splitlines()!=[
    'user-db:user','system-db:gdm',
    'file-db:/var/lib/gdm3/greeter-dconf-defaults']:
    raise SystemExit('Unexpected GDM profile; refuse to modify')
if keyfile.read_text().strip().splitlines()!=[
    '[org/gnome/shell]',"enabled-extensions=['mellon-greeter@local']"]:
    raise SystemExit('Unexpected GDM keyfile; refuse to modify')
files=[p for p in stage.iterdir() if p.is_file()]
expected={'extension.js','metadata.json','hud-state.js','hud-layout.js',
'hud-progress.js','hud-intro-state.js','observatory-hud.js',
'observatory-intro.js','stylesheet.css','install-g13-in-guest.sh',
'rollback-g13-in-guest.sh','SHA256SUMS'}
if set(p.name for p in files)!=expected or len(files)!=len(expected):
    raise SystemExit('Unknown staged files found; refusing')
print('PASS: approved assets and GDM profile verified; no auth changes.')
PY

    # Prove the currently installed build is the one visually approved.
    grep -Fq '[Mellon Greeter G1.2.1] enabled in gdm mode' "$EXT/extension.js" || {
        echo 'Installed GDM source is NOT G1.2.1; refusing upgrade.' >&2
        exit 1
    }
    grep -Fq 'container.insert_child_below(photo, dialog)' "$EXT/extension.js"
    grep -Fq '[Mellon Greeter G1.3] enabled in gdm mode' "$DIR/extension.js"
    grep -Fq 'container.insert_child_below(hud.actor, dialog)' "$DIR/extension.js"
    grep -Fq "from './observatory-intro.js'" "$DIR/observatory-hud.js"
    grep -Fq 'INTRO_REPEAT_MS = 5000' "$DIR/hud-intro-state.js"

    # Install an emergency root-only rollback command BEFORE replacing
    # any live greeter files. Leave native GDM configuration unchanged.
    install -Dm 700 -- "$DIR/rollback-g13-in-guest.sh" "$ROLLBACK"
    NEXT="$(mktemp -d "$PARENT/.mellon-g13-next.XXXXXXXX")"
    chmod 700 "$NEXT"

    restore_on_failure() {
        status=$?
        if ((status != 0)) && test ! -e "$EXT" && test -d "$OLD"; then
            mv -T -- "$OLD" "$EXT" || true
            chmod 755 "$EXT" 2>/dev/null || true
            echo 'Attempted automatic recovery of G1.2.1 after interrupted update.' >&2
        fi
        if test -n "${NEXT:-}" && test -d "$NEXT"; then
            rm -rf -- "$NEXT"
        fi
    }
    trap restore_on_failure EXIT

    cp -a -- "$EXT/." "$NEXT/"
    for file in "${FILES[@]}"; do
        install -m 644 -- "$DIR/$file" "$NEXT/$file"
    done
    chown -R root:root -- "$NEXT"
    if find "$NEXT" -type l -print -quit | grep -q .; then
        echo 'Unexpected symlink in assembled G1.3 extension' >&2; exit 1;
    fi
    test -f "$NEXT/library.json" && test -f "$NEXT/scene-data.js"
    test -f "$NEXT/assets/blue-gold-nebula/background.jpg"
    test -f "$NEXT/stylesheet.css"
    grep -Fq 'new ObservatoryHUD(container, hudMetadata(scene))' "$NEXT/extension.js"

    # Both directories live on the SAME filesystem, so each rename is
    # atomic. The VM is not restarted until after this command succeeds.
    mv -T -- "$EXT" "$OLD"
    chmod 700 "$OLD"
    mv -T -- "$NEXT" "$EXT"
    NEXT=''
    chmod 755 "$EXT"
    trap - EXIT

    echo
    echo 'PASS: Mellon G1.3 Observatory HUD installed in TEST VM only.'
    echo 'Preserved G1.2.1 at /usr/share/gnome-shell/extensions/.mellon-g13-previous-001'
    echo 'Native login, system dconf and M8.3.2 lock screen untouched.'
    echo 'NO GDM restart performed. Reboot only the VM to visually test.'
    echo "Emergency rollback: sudo $ROLLBACK"
)
