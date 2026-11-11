# G1 screenshot diagnosis — native GDM still visible, Mellon photo absent

The **2026-11-12** first real GDM screenshots show a functional
GNOME user-selector and password prompt on the stock Ubuntu dark background.
The photos are not visibly rendered. This **does not yet distinguish**
between a greeter extension that never loaded and an extension that
loaded but could not locate the target background actor.

## Non-mutating differential diagnosis

From BlackPearl:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-gdm/diagnose-g1-greeter.sh
)
```

Enter the **test VM's** sudo password at the SSH-PTY prompt.

The audit reads the real, potentially dynamically allocated
`gdm-greeter` account UID, GNOME shell PID, whitelisted dconf
environment keys (never its full process environment), effective
`gsettings` extension values, explicit dconf key overrides, the
installed greeter's file metadata and representative image readability,
and narrowly filtered extension-related entries from the current
GNOME greeter process journal.

**All reads.** No GDM restart, no config edits, no service writes,
no transfer of password data, and no BlackPearl system changes.

## Decision tree

1. **System extension / metadata / keyfile missing**: G1 installer
   did not finish or was not run; inspect previous output, **do not
   rerun blindly**.
2. **Enabled-extensions is empty despite matching admin keyfile**:
   inspect whether the greeter's private user database supplies a
   higher-priority empty override. Do **not** delete/rebuild its
   user database without a separate recovery review.
3. **Enabled-extensions contains `mellon-greeter@local`, but journal
   reports a load error**: fix the explicit GNOME 50 error, repackage
   and deploy to the VM only.
4. **Enabled extension, no log errors, photograph readable**: likely
   mounting/layering issue. Existing G1 uses
   `Main.screenShield?._dialog?._backgroundGroup`, an actor API
   adapted from the user unlock screen. This may not be the right
   GDM LoginDialog view root. Before patching, inspect GNOME 50's
   actual greeter scene graph and add bounded diagnostic logging to
   the isolated greeter extension. **Do not touch authentication**.

Recovery checkpoint:
`$HOME/VMs/Mellon/checkpoints/MELLON-GDM-PREINSTALL-001`.
Known G1 emergency rollback if a later test breaks login:

```bash
(
    set -euo pipefail
    ssh -tt mellon 'sudo /usr/local/sbin/mellon-greeter-g1-rollback'
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

The G1 login screen currently remains usable, so **do not rollback
merely because the backdrop is dark** until the diagnosis establishes
why it did not appear.
