# Installation, updates, and recovery

**Current M9 (accepted on the original BlackPearl):** both GNOME lock and GDM render per-monitor viewports. Read the [M9 multi-monitor guide](MULTI_MONITOR.md) for the already-installed host upgrade, exact rollback path, and why Wayland requires a fresh GNOME Shell session after module changes. The initial-install scripts below are historical and **must not be rerun** on an installed host.

Mellon makes the **visible** GNOME login experience custom; authentication remains native. That still puts it on a critical path: an extension error can make GDM unusable. This page intentionally separates **tested BlackPearl deployment history** from **porting instructions for other machines**.

## The known-good physical installation

The original owner has successfully installed M9 (GDM and lock, superseding the original G1.8/M8.4 builds) on BlackPearl: Ubuntu 26.04.1, GNOME Shell 50.1, gdm3 50.1, Wayland, `ap0calypse` as primary user.

The original scripts in [`lab/blackpearl-host/`](../lab/blackpearl-host/README.md) are an **initial-install** set, not an updater. They deliberately refuse to overwrite an existing Mellon installation or dconf admin profile. **Do not rerun `install.sh` on an already installed machine**; use a separate, versioned upgrade procedure with fresh backups.

### What those scripts actually do

| Script | Effect |
| --- | --- |
| `preflight.sh` | Read-only environment, permissions, GNOME/GDM, dconf, existing extension and photo-pack checks; uses sudo for read-only GDM settings |
| `stage.sh` | Verifies local pack + matching installed VM pack, tests current source, assembles both complete extensions and SHA256 manifests in `~/.local/state/mellon-blackpearl/stage-v1/` |
| `install.sh` | **Root on host:** rechecks checksums, installs rollback first, copies user and system extension directories, writes *new* GDM admin dconf profile and key, compiles `dconf update`; does not restart GDM |
| `rollback.sh` | **Root, works from TTY:** checks backups and installed UUIDs, quarantines Mellon extensions, removes Mellon-created GDM dconf configuration and restores vendor login behavior on next reboot |

The root-owned rollback path is `/usr/local/sbin/mellon-blackpearl-rollback`. The install-time backup is `/var/backups/mellon-blackpearl/host-v1/`. These paths are **specific to the original workstation**.

### Historical first-install order that worked

1. Check that a **text-console login** works before changing GDM.
2. Run the host preflight and stage; stop on any error.
3. Run attended installer; it creates backups, then installs without reboot.
4. Register/enable the user extension for **the next GNOME session**, if the current Wayland session hasn't discovered it yet.
5. Log out and back in; test the lock and GDM.
6. Retain the complete backup and recovery script.

A logged-in GNOME Wayland session may not discover a freshly copied user extension until a new session starts. An error such as `Extension “mellon-lab@local” does not exist` immediately after install is not automatically a broken package—read [Troubleshooting](TROUBLESHOOTING.md).

## Porting to your own workstation

**Do not copy/paste the BlackPearl scripts unchanged.** They are a reference implementation with explicit assumptions:

- hostname `blackpearl`, login `ap0calypse`, uid 1000;
- GDM 50.1, GNOME Shell 50.1, expected Ubuntu vendor dconf profile;
- system GDM extension path under `/usr/share/gnome-shell/extensions/`;
- user extension path under `~/.local/share/gnome-shell/extensions/`;
- existing libvirt VM `mellon-gnome50-lab`, SSH alias `mellon`, guest `test1`;
- approved offline checksum-verified 12-scene bundle outside Git;
- **no existing GDM admin overrides** and **no existing Mellon installation**;
- a specific `/usr/local/sbin/` and `/var/backups/` recovery layout.

The correct approach is to fork this install strategy, **not** remove checks until it runs. Convert the identities/paths into explicit configuration or arguments, re-audit GNOME internals on your distro, and pin expected versions in your own tests. If a GDM admin database or profile already exists, you must *merge* settings safely rather than deleting or overwriting someone else's configuration.

### What a portable installer must preserve

- Keep the `mellon-lab@local` / `mellon-greeter@local` UUIDs aligned with both metadata and directories, or change them coherently everywhere.
- Install M8 as a **user extension** with `session-modes: ["unlock-dialog"]`.
- Install G1.8 as a **system extension** with `session-modes: ["gdm"]`.
- Stage a complete library, scene config, photos, GJS source, CSS and transparent star sprites. Verify SHA256 manifests before publishing.
- Back up all overwritten extension directories **and** the exact original GDM dconf profile/keyfiles/compiled DB; preserve unknown admin config rather than assuming it's empty.
- Install an emergency recovery program **before** any change to GDM.
- Use same-filesystem directory renames for exposing complete extensions, not partial file overwrites.
- Never restart a live production display manager inside an installer; use an attended, planned session transition/reboot.
- A recovery command must work from a TTY/boot rescue shell and must restore the original vendor path without needing the affected graphical login.
- On failure, prefer **fail open** to native GNOME controls rather than hiding them behind a partial overlay.

### Recommended process

```text
clone → source tests → build/verify image pack → isolated GNOME 50 VM
      → VM snapshot + rollback rehearsal → VM login/lock integration
      → host read-only preflight → host backup + checksum stage
      → attended install (no GDM restart) → next-session test
      → retain TTY rescue route
```

There is deliberately **no universal production-install command** at the repository root. The root `./install.sh` belongs to the original obsolete prototype and must not be used for G1.8/M8.4.

## Recovering the original BlackPearl setup

If GDM or unlocking becomes unusable on the **already-installed BlackPearl**:

1. Press `Ctrl+Alt+F3` (or another available virtual console), log in with your normal Linux account.
2. Run:

```bash
(
    set -euo pipefail
    sudo /usr/local/sbin/mellon-blackpearl-rollback
    sudo reboot
)
```

The script checks the exact Mellon UUIDs, quarantines installed files, removes only expected Mellon-created dconf entries, recompiles the GDM dconf DB, and restores native GNOME on reboot. It **refuses to silently delete unknown admin changes**. If the script reports a mismatch, inspect that file instead of manually removing arbitrary GDM settings.

For another machine, this *path and script will not exist* until you've created your own deployment and verified it. A simple `gnome-extensions disable` may be sufficient for a user lock extension, but it does **not** automatically remove a system GDM extension or its dconf activation.

## Updating an already working installation

The supplied BlackPearl scripts are *not* an in-place updater. For an upgrade:

1. Preserve a full copy of the **current installed** GDM and lock extension directories.
2. Preserve **current** dconf/profile files, whether Mellon-managed or modified later.
3. Stage a new versioned bundle in a fresh directory; verify every asset and test.
4. Prepare and rehearse rollback to that exact working version.
5. Install the lock part first and test it in a fresh GNOME session; only then activate the GDM part at a controlled logout/reboot.
6. Do not overwrite `host-v1` backups or the compiled dconf DB in place.
7. Document a way to recover without GNOME Shell working.

A successful GitHub Actions run tests pure code and mocked actors. It cannot verify your physical GDM configuration or guarantee no compositor crash.

## Don't do this

- Restart `gdm.service` from an active Wayland session to "refresh" the extension.
- Delete `/etc/dconf/db` or `/usr/share/gnome-shell/extensions` while troubleshooting.
- Edit GNOME/PAM verifier internals to make a visual effect appear.
- Run the VM-only `stage-g18-to-vm.sh` / `stage-m84-to-vm.sh` against a production host.
- Overwrite unknown GDM keyfiles or disable unrelated GNOME extensions.

## Further reading

[Getting started](GETTING_STARTED.md) · [Security](SECURITY.md) · [Troubleshooting](TROUBLESHOOTING.md) · [BlackPearl deployment record](../lab/blackpearl-host/README.md).
