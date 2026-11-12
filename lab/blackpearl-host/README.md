# Mellon on BlackPearl — G1.8 GDM + M8.4 Lock Screen

**Host deployment is specifically authorized by the owner on Nov 12,
2026. The VM is already fully validated. Mythological constellation
artwork is intentionally postponed until last.**

This is a **different and more restrictive installer** than the VM-only
development scripts. It applies to physical BlackPearl only:
Ubuntu 26.04.1, GNOME Shell 50.1, gdm3 50.1, host `BlackPearl`, primary
user `ap0calypse` (uid 1000). It fails if any identity/version,
dconf, installed-extension, or vendor GDM-profile assumption differs.

The installer never calls `systemctl restart gdm`, restarts the desktop,
reboots the host, changes PAM, modifies authentication, or installs a
new GNOME Shell binary. It installs only:
- The full, vetted 12-photo **M8.4 lock-screen extension** into
  `~/.local/share/gnome-shell/extensions/mellon-lab@local`
- The full, vetted **G1.8 GDM extension**, root-owned and world-readable,
  into `/usr/share/gnome-shell/extensions/mellon-greeter@local`
- New (only if **completely absent**) GDM dconf admin files:
  `/etc/dconf/profile/gdm`,
  `/etc/dconf/db/gdm.d/95-mellon-greeter`,
  and the compiled `/etc/dconf/db/gdm`
- A root-owned emergency TTY rollback at
  `/usr/local/sbin/mellon-blackpearl-rollback`
- A root-only directory at
  `/var/backups/mellon-blackpearl/host-v1`

Unlike the VM, the original host never had a Mellon extension installed.
If any of these paths already exist, stop; the clean-host deployment
must **not** overwrite someone's existing configuration.

## Before installing: check that a real TTY login works

Save and close current work. Switch to `Ctrl+Alt+F3`, log in using your
normal Ubuntu account, then switch back to your desktop (commonly
`Ctrl+Alt+F2`, although the session's VT may vary).
**Do this while the original GNOME login screen is still unmodified.**
You need a known-good out-of-band recovery path before altering GDM.

Also verify backups and your Ubuntu/Windows dual-boot remain unaffected:
there are no GRUB, UEFI, boot partition, or Windows disk operations.

## Step 1 — Git update and read-only host preflight

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/blackpearl-host/preflight.sh
)
```

This reads the current GNOME 50, GDM package, actual greeter account
settings (if the greeter has exited after login, it checks the GDM
account's defaults), existing dconf profile, system directory ownership,
existing user-enabled extensions, storage, and source photo-pack status.
It asks for sudo **only for a read-only live greeter configuration
audit**, and does not change any files or services.

If any check fails, **stop**, provide the output, and adapt the
installer. Do not bypass the guard or manually change dconf.

## Step 2 — Build two audited bundles (no sudo)

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/blackpearl-host/stage.sh
)
```

The stage compares the local curated photo corpus against both VM
installed libraries, checks that the guest is indeed running tested
G1.8 and M8.4, runs Node regression suites, verifies all 12 original
images and photo-derived star sprites, and preserves the **tested VM
fixed/random scene selection**. All module files and assets receive
two complete SHA256 manifests. The package is published at:

`$HOME/.local/state/mellon-blackpearl/stage-v1/{gdm,lock}`

It does not install anything, reboot, or call sudo.

## Step 3 — Host installation with root-owned recovery

**Only after BOTH preflight and staging report PASS:**

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    sudo bash lab/blackpearl-host/install.sh
)
```

The installer rechecks host identity and checksums, creates
`/var/backups/mellon-blackpearl/host-v1/` (mode 0700), publishes the
rollback executable **before any GNOME changes**, stages full
extensions safely, and enables the GDM extension on the **next**
login-manager session only. If an operation fails after backups are
created, its exit trap runs the rollback automatically and reports
the result.

**No GDM restart or host reboot.**

## Step 4 — Enable and test the lock screen BEFORE rebooting

```bash
(
    set -euo pipefail
    gnome-extensions enable mellon-lab@local
    gnome-extensions info mellon-lab@local
    gsettings get org.gnome.shell enabled-extensions
    test -f /usr/local/sbin/mellon-blackpearl-rollback
)
```

Make sure it is present and enabled without disabling your existing
GNOME extensions. Use **Super+L** only once you've confirmed the
`Ctrl+Alt+F3` TTY escape works. In the lock-screen view check:
- source-photo background and constellation nodes/edges;
- eight numeric mapping stages + brief segment pulses;
- 5-second grid scanning, Backspace, and final bright wave;
- incorrect-password UNAUTHORIZED ACCESS and scan recovery;
- **SHOW LOGIN** reveals GNOME's real native password form.

If the lock screen fails, **DO NOT reboot into GDM yet**. Run the
rollback below from TTY, then reboot after saving any work.

## Step 5 — Reboot to test GDM G1.8

Only after the native lock screen recovers correctly and you are
confident with TTY access:

```bash
(
    set -euo pipefail
    sudo reboot
)
```

Check the clean photo → Mellon startup → user auto-selection →
constellation password flow, including 5-second scanning and
**SHOW LOGIN**, then verify successful desktop login. The system-wide
GDM extension is visible on first reboot; its normal password
verification and session selection remain GNOME-owned. Test one
additional logout/login and unlock cycle.

## EMERGENCY: recovery from an unusable graphical login

1. Press **Ctrl+Alt+F3** (or another usable text VT).
2. Log in as `ap0calypse` normally.
3. Run:

```bash
(
    set -euo pipefail
    sudo /usr/local/sbin/mellon-blackpearl-rollback
    sudo reboot
)
```

The rollback checks the exact Mellon extension UUIDs before
quarantining the installation, removes **only** the dconf
entries installed by Mellon (it refuses to overwrite later unrelated
admin changes), returns to the original vendor GDM profile, and
restores native GNOME by the next reboot. A dangling
`mellon-lab@local` entry in user enabled-extensions is harmless
when the extension directory has been removed; it can be disabled
later if necessary.

If no text console works, use the Ubuntu **GRUB recovery root shell**
to execute the same rollback script; its root-owned bytes live outside
the graphical session. **Do not format, reinstall, or modify the
Windows dual-boot partitions.**

## Hard stops

Stop if:
- Hostname/user/UID differ, GNOME or GDM major version differs,
  or the physical machine is detected as a VM.
- An existing system-wide Mellon GDM extension, user Mellon lock
  extension, GDM admin database/profile or rollback artifact exists.
- The prior VM build or photo library differs from the vetted files.
- Any staged file contains a symlink/hardlink or checksum mismatch.
- The user cannot access a working text console.

**No system extension will be installed by ChatGPT directly.** All
commands run locally, visibly and with your authorization.
