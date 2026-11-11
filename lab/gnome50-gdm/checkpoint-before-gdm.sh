#!/usr/bin/env bash
# Mellon G0.2 -- safe, OFFLINE VM checkpoint before any GDM modifications.
# Run from the BlackPearl host. Target ONLY mellon-gnome50-lab.
# Usage: bash checkpoint-before-gdm.sh inspect|create
# Does NOT shut down a guest, modify an installed VM, or touch host GNOME.
(
    set -euo pipefail
    VM='mellon-gnome50-lab'
    URI='qemu:///system'
    MODE="${1:-inspect}"
    ROOT="$HOME/VMs/Mellon/checkpoints"
    NAME="MELLON-GDM-PREINSTALL-001"
    DEST="$ROOT/$NAME"
    case "$MODE" in
        inspect|create) ;;
        *) echo 'Usage: checkpoint-before-gdm.sh [inspect|create]' >&2; exit 2 ;;
    esac

    virsh -c "$URI" dominfo "$VM" >/dev/null
    state="$(virsh -c "$URI" domstate "$VM" | head -n 1)"
    echo "VM: $VM | state: $state | action: $MODE"

    # Read the persistent definition; never clone a running qcow2.
    xml="$(mktemp)"
    trap 'rm -f -- "$xml"' EXIT
    virsh -c "$URI" dumpxml --inactive "$VM" > "$xml"
    mapfile -d '' -t ASSETS < <(
        python3 - "$xml" "$VM" <<'PY'
import sys,xml.etree.ElementTree as ET
path,expected=sys.argv[1:]
root=ET.parse(path).getroot()
if root.tag!='domain' or root.findtext('name')!=expected:
    raise SystemExit('Unexpected libvirt domain definition')
disks=[]
for disk in root.findall('./devices/disk'):
    if disk.get('device')!='disk':
        continue
    if disk.get('type')!='file':
        raise SystemExit('Unsupported non-file VM disk: refusing')
    source=disk.find('source')
    driver=disk.find('driver')
    if source is None or driver is None or driver.get('type')!='qcow2':
        raise SystemExit('Only plain qcow2 VM disks supported')
    disks.append(source.get('file'))
if len(disks)!=1 or not disks[0] or not disks[0].startswith('/'):
    raise SystemExit('Expected exactly one absolute-path qcow2 VM disk')
nvram=root.find('./os/nvram')
if nvram is None or not nvram.text or not nvram.text.startswith('/'):
    raise SystemExit('Expected a persistent UEFI variable store')
for item in (disks[0],nvram.text.strip()):
    sys.stdout.buffer.write(item.encode()+b'\0')
PY
    )
    if [ "${#ASSETS[@]}" -ne 2 ]; then
        echo 'Failed to resolve both VM disk and UEFI VARS' >&2
        exit 1
    fi
    DISK="${ASSETS[0]}"
    VARS="${ASSETS[1]}"

    echo "Disk: $DISK"
    echo "UEFI variables: $VARS"
    echo "Checkpoint destination: $DEST"

    if [[ "$MODE" == 'inspect' ]]; then
        echo 'Read-only audit only; no VM files copied.'
        echo 'NEXT: shut the VM off cleanly, then run with create.'
        exit 0
    fi

    # Refuse any active, paused, suspended or saved guest state.
    if [[ "$state" != 'shut off' ]]; then
        echo 'REFUSING: VM must be fully shut off for an offline checkpoint.' >&2
        echo "Use: virsh -c $URI shutdown $VM" >&2
        echo "Then verify: virsh -c $URI domstate $VM" >&2
        exit 1
    fi
    # virsh domstate may print an extra empty line. grep -v previously
    # interpreted that blank line as an unexpected VM state, rejecting an
    # otherwise fully powered-off VM. Compare only the canonical first line.
    if [[ "$(virsh -c "$URI" domstate "$VM" | head -n 1)" != 'shut off' ]]; then
        echo 'VM state changed during preflight; refusing.' >&2
        exit 1
    fi
    if test -e "$DEST" || test -L "$DEST"; then
        echo "Checkpoint already exists; never overwrite: $DEST" >&2
        exit 1
    fi
    test -d "$ROOT" && test ! -L "$ROOT" || {
        echo "Expected safe checkpoint directory missing: $ROOT" >&2
        exit 1
    }
    test -f "$ROOT/MELLON-BASELINE-001/domain.xml" || {
        echo 'Original verified MELLON-BASELINE-001 not found; refusing' >&2
        exit 1
    }
    command -v qemu-img >/dev/null || {
        echo 'qemu-img required to verify qcow2 backing files' >&2; exit 1;
    }

    echo 'Checking permissions and source format (read only)...'
    sudo -v
    sudo test -f "$DISK" && sudo test ! -L "$DISK" &&
        sudo test -f "$VARS" && sudo test ! -L "$VARS" || {
        echo 'Missing or symlinked source disk / UEFI variables; refusing.' >&2
        exit 1
    }
    sudo qemu-img info --output=json "$DISK" |
        python3 -c '
import json,sys
d=json.load(sys.stdin)
if d.get("format")!="qcow2":
    raise SystemExit("Source VM disk is not qcow2")
if "backing-filename" in d or "full-backing-filename" in d:
    raise SystemExit("External qcow2 backing chain: cannot safely clone alone")
print("PASS: standalone qcow2 source (no external backing chain)")
'
    required="$(sudo du -B1 -s "$DISK" | awk '{print $1}')"
    available="$(df -PB1 "$ROOT" | awk 'NR==2 {print $4}')"
    # Allow for qcow2 sparseness, filesystem metadata and concurrent host use.
    need="$((required + required / 4 + 1073741824))"
    if (( available < need )); then
        echo "Insufficient free space: available=$available, conservatively required=$need" >&2
        exit 1
    fi

    # Create a private staging directory; publish checkpoint atomically
    # only after every copy has a matching digest and qemu-img info passes.
    STAGE="$(mktemp -d "$ROOT/.gdm-preinstall-staging.XXXXXXXX")"
    chmod 700 "$STAGE"
    cleanup() {
        if [[ -n "${STAGE:-}" && -d "$STAGE" ]]; then
            sudo chown -R "$(id -u):$(id -g)" -- "$STAGE" || true
            rm -rf -- "$STAGE"
        fi
    }
    trap 'cleanup; rm -f -- "$xml"' EXIT

    # Do not mutate the source VM. Keep the snapshot offline and sparse.
    echo 'Copying offline qcow2; this may be several gigabytes.'
    sudo cp --reflink=auto --sparse=always -- "$DISK" "$STAGE/disk.qcow2"
    sudo cp -- "$VARS" "$STAGE/uefi-vars.fd"
    sudo chown "$(id -u):$(id -g)" -- "$STAGE/disk.qcow2" "$STAGE/uefi-vars.fd"
    cp -- "$xml" "$STAGE/domain.xml"
    chmod 600 "$STAGE"/*

    ( cd "$STAGE" && sha256sum disk.qcow2 uefi-vars.fd domain.xml > SHA256SUMS )
    ( cd "$STAGE" && sha256sum -c SHA256SUMS )
    qemu-img info --output=json "$STAGE/disk.qcow2" |
        python3 -c '
import json,sys
d=json.load(sys.stdin)
if d.get("format")!="qcow2" or "backing-filename" in d:
    raise SystemExit("Checkpoint qcow2 is not standalone")
print("PASS: checkpoint qcow2 independent and readable")
'

    # A defensive last state check: no one may have started the guest
    # while the copy ran, or this backup cannot be treated as consistent.
    if [[ "$(virsh -c "$URI" domstate "$VM" | head -n 1)" != 'shut off' ]]; then
        echo 'VM was started during backup; refusing to publish inconsistent copy' >&2
        exit 1
    fi
    if test -e "$DEST" || test -L "$DEST"; then
        echo 'Destination appeared during copy; refusing overwrite.' >&2
        exit 1
    fi
    mv -T -- "$STAGE" "$DEST"
    STAGE=''
    trap 'rm -f -- "$xml"' EXIT

    echo
    echo 'PASS: VM offline GDM preinstall checkpoint created and hash-verified.'
    echo "Checkpoint: $DEST"
    echo "Retained original baseline: $ROOT/MELLON-BASELINE-001"
    echo 'Next: independently audit the greeter extension loading path.'
    echo 'To restore in an emergency, keep the VM shut off; do not overwrite'
    echo 'its current disk/NVRAM until a separate recovery plan is reviewed.'
)
