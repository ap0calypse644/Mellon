#!/usr/bin/env bash
# Switch M6 VM scene for the NEXT lock without modifying BlackPearl.
# Usage: bash lab/gnome50-m6/select-scene-in-guest.sh cosmic-wings/03-Vir
#        bash lab/gnome50-m6/select-scene-in-guest.sh random-on-lock
(
    set -euo pipefail
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    ROOT="$(cd -- "$HERE/../.." && pwd)"
    cd "$ROOT"
    SELECTION="${1:-}"
    [[ -n "$SELECTION" && "$#" -eq 1 ]] || {
        echo 'Supply a pilot scene ID or random-on-lock.' >&2; exit 2;
    }

    python3 - "$HERE/pilot-selection.json" "$SELECTION" <<'PY'
import json,sys
selected=json.load(open(sys.argv[1]))['pilot_scene_ids']
value=sys.argv[2]
if value!='random-on-lock' and value not in selected:
    raise SystemExit('Unknown M6 pilot scene: '+value+'\nChoices: '+', '.join(selected)+', random-on-lock')
print('Validated mode:',value)
PY
    ssh -o BatchMode=yes mellon "bash -s -- '$SELECTION'" <<'GUEST'
(
    set -euo pipefail
    MODE="$1"
    DIR="$HOME/.local/share/gnome-shell/extensions/mellon-lab@local"
    test -f "$DIR/library.json" && test -f "$DIR/scene-config.json" || {
        echo 'M6 pack not installed in GNOME 50 guest' >&2; exit 1;
    }
    python3 - "$DIR" "$MODE" <<'PY'
import json,os,sys,tempfile
root,value=sys.argv[1:3]
lib=json.load(open(os.path.join(root,'library.json')))
if lib.get('schema')!='mellon-m6-scene-library-v1':
    raise SystemExit('Unexpected installed M6 library')
ids={x['id'] for x in lib['scenes']}
config={'stages':8}
if value=='random-on-lock':
    config['mode']='random-on-lock'
else:
    if value not in ids:
        raise SystemExit('Scene missing from guest library: '+value)
    config.update(mode='fixed',scene_id=value)
fd,tmp=tempfile.mkstemp(prefix='.scene-config-',dir=root)
try:
    with os.fdopen(fd,'w') as f:
        json.dump(config,f,indent=2)
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp,os.path.join(root,'scene-config.json'))
except BaseException:
    if os.path.exists(tmp):
        os.unlink(tmp)
    raise
print('M6 NEXT LOCK:',value)
PY
)
GUEST
    echo 'PASS: guest-only scene selection updated; take effect on next lock.'
)
