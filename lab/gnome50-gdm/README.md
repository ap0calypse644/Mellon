# Mellon Greeter — G0/G0.1 GNOME 50.1 audit

Goal: the **same visual constellation and Observatory HUD** at both the
normal session lock screen (`unlock-dialog`) and the pre-login greeter.

Ubuntu 26.04.1 in the Mellon's VM reports GNOME Shell **50.1** and
`gdm3 50.1-0ubuntu0.1`. The test1 audit showed an active
`gnome-shell --mode=ubuntu` process; this was **the user's desktop**,
not proof of the GNOME greeter mode. GDM 50 has changed its special-session
startup and may allocate a dynamic greeter account, so don't assume the
old on-disk `gdm` user or dconf profile is actually in use.

## G0 — Completed read-only inventory

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-gdm/audit-guest-greeter.sh
)
```

Checks VM identity; distro, GNOME and GDM versions; system extension
locations; current GNOME processes; read-only gdm settings. No mutations.

## G0.1 — Verify the **actual live login greeter** (NEXT)

1. Save anything open inside the VM. **Log out of the VM's graphical
   `test1` desktop using its own GNOME menu.** The GDM login screen
   should appear in the VM console. Do not log back into the VM GUI yet.
   (The BlackPearl host itself remains logged in.)
2. With the VM sitting at that pre-login screen, run the following from
   BlackPearl. The SSH account `test1` can still log in even though its
   graphical session is logged out.

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-gdm/audit-live-greeter.sh
)
```

Paste the output. **PASS** requires an actual running
`gnome-shell --mode=gdm`. A desktop shell in `--mode=ubuntu`
is insufficient. The audit deliberately refuses to approve installation
if the real greeter can't be confirmed.

The script performs only read-only process/session queries and checks
system-supplied greeter desktop/session files. It does not attempt to
read password buffers, private greeter environment variables, PAM state,
GDM's secrets, or any authentication data.

## G0.2: offline VM checkpoint before system-wide changes (NEXT)

Once G0.1 confirms the real greeter mode, prepare a **fresh** restorable
checkpoint of the isolated VM, covering qcow2 disk, libvirt domain XML
and UEFI variable store (where present). Verify file hashes and document
the rollback/recovery sequence. A checkpoint must be taken with the
guest safely **shut off**, not by copying its running qcow2.

Keep an independent SSH and virtual-console recovery method; do not
restart GDM before backup verification. Do not modify the host.

### Offline checkpoint helper

`checkpoint-before-gdm.sh` is available and intentionally has two modes.

Inspect the storage and NVRAM paths **without changing anything**:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-gdm/checkpoint-before-gdm.sh inspect
)
```

When the inventory looks correct, shut down **only** the VM, from
BlackPearl's terminal (the guest is currently on GDM's login screen):

```bash
(
    set -euo pipefail
    virsh -c qemu:///system shutdown mellon-gnome50-lab
    virsh -c qemu:///system domstate mellon-gnome50-lab
)
```

If shutdown is still in progress, run `virsh -c qemu:///system domstate
mellon-gnome50-lab` again. The exact state must be **shut off** before
the next command.

Create the checkpoint on the **powered-off VM**:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-gdm/checkpoint-before-gdm.sh create
)
```

The helper verifies the VM name/state, existing baseline, one standalone
qcow2 disk without a backing chain, persistent UEFI NVRAM, available free
space and SHA256 integrity of the copied disk/vars/XML; it publishes
`$HOME/VMs/Mellon/checkpoints/MELLON-GDM-PREINSTALL-001/` only after
all checks pass. It **never overwrites** an existing checkpoint. The
original `MELLON-BASELINE-001` is preserved. Copying the disk may
require host `sudo`. The checkpoint includes enough raw assets for
an offline recovery, but a restore drill remains a separate later test.

To boot the test VM again **after** confirming checkpoint success:

```bash
(
    set -euo pipefail
    virsh -c qemu:///system start mellon-gnome50-lab
)
```

If the snapshot command fails, **do not install a GDM extension**.
Paste its output so we can investigate without risking the guest login.

## Planned subsequent milestones

- **G1**: isolated `mellon-greeter@local` system extension,
  `"session-modes": ["gdm"]`, installed only into guest system-wide
  extension directory. Start with source photography, backdrop, static
  constellation and HUD **behind native GDM controls**. GDM remains
  immediately usable on any extension error. Preserve M8.3.2 user extension.
- **G2**: read-only GDM-specific visual activation adapter. Never
  capture password text, intercept keys, impersonate GNOME's verifier
  or change PAM, user selection, login or focus. No false "ACCESS GRANTED".
- **G3**: reuse the 5-second grid and eight-segment stage display with
  independent, audited greeter timer/callback lifecycle.
- **G4**: boot/logout/reboot/failed-login/broken asset/crash tests,
  recovery verification and safe package/uninstall scripts.

No `gdm` metadata or dconf changes to the user extension alone.
No change to `/usr/share/gdm/greeter/wayland-sessions` or GNOME theme
gresources. **BlackPearl host GNOME is explicitly out of scope.**

Primary GNOME guidance: system extensions run from
`/usr/share/gnome-shell/extensions`; only system extensions can use
the `gdm` session mode. GDM 50 release notes document special-session
handling changes, so validate the actual running mode before installing.
