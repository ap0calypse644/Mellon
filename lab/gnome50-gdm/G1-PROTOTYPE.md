# Mellon G1.1/G1.2 — GDM photographic background prototype

**Source ready for review, NOT INSTALLED.** Do not enable any
system extension until GDM activation and emergency rollback are
independently verified in `mellon-gnome50-lab`.

## Confirmed guest facts

- Ubuntu 26.04.1, GNOME Shell 50.1, gdm3 50.1.
- Actual live greeter: `gnome-shell --mode=gdm`, account `gdm-greeter`
  with ephemeral home `/run/gdm3/home/gdm-greeter`.
- Original M8.3.2 extension is user-scoped as `mellon-lab@local`.
- Offline checkpoint **MELLON-GDM-PREINSTALL-001** is verified with
  matching hashes for qcow2, OVMF vars and libvirt XML.

## Implemented, source-only

- `greeter-extension/metadata.json`: separate system UUID
  `mellon-greeter@local`; `gdm`-only GNOME 50 session.
- `greeter-extension/extension.js`: uses original selected photograph,
  creates one **non-reactive** actor in
  `Main.screenShield._dialog._backgroundGroup`. The native LoginDialog
  username/password UI is in a different actor layer and stays visible.
  Does not inspect any user input. A bounded mount retry expires after
  90 × 350ms rather than polling the login screen forever.
- `greeter-extension/scene-data.js` is copied **byte-for-byte** from
  M8.3.2's approved pure scene validation/selection module.
- `test-g1.mjs`: verifies session mode, native UI layering, input
  isolation, source identity and teardown.
- `stage-pack-on-blackpearl.sh`: validates the existing approved
  12-scene photo pack and assembles a deterministic, checksummed
  local **staging bundle**. NO VM writes or elevated privileges.

**This G1.1/G1.2 prototype shows the photographic background only.**
G1.3 will later add source-photo stars and HUD to the GDM background
layer; G1.4 adds the five-second scanner; G2 adds an audited read-only
visual mapping adapter.

## Next pre-install preparation

Run from the BlackPearl terminal:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    node lab/gnome50-gdm/test-g1.mjs
    bash lab/gnome50-gdm/stage-pack-on-blackpearl.sh
)
```

This prepares the bundle under
`$HOME/VMs/Mellon/gdm-stage/MELLON-G1-PREVIEW-001/` with
`SHA256SUMS`. It intentionally does **not** install/enable a system
extension, modify GDM/dconf/PAM, restart the VM, or touch BlackPearl
GNOME. We'll first inspect the actual greeter's enabled-extensions
configuration and build a VM-only reversible installation procedure.

## Design guardrails

- Never touch PAM, GDM source, GNOME Shell resources, default greeter
  session files or the user extension.
- System greeter assets MUST be root-owned, readable by `gdm-greeter`.
  `test1` home directories should not be used at runtime.
- No greeter-side `SHOW LOGIN` overlay: the native GDM password and
  user-selection controls remain visible.
- Fail open: if a background asset or expected actor is missing,
  leave the native GDM background unchanged.
- An installation/activation stage requires tested emergency uninstall
  over SSH/TTY and a restart plan; no live GDM restarts for early trials.

## G1.0: inspect GNOME 50 greeter extension enablement (required next)

The earlier preflight confirmed that
`/etc/dconf/profile/gdm` is **absent**. That is not sufficient to
know the running greeter's actual dconf profile, because Ubuntu also
ships a system vendor profile. Before enabling the system extension,
inspect *both* the vendor profile and any existing GDM overrides.

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-gdm/audit-extension-enablement.sh
)
```

This is **read-only**: it prints profile locations, vendor file paths,
admin extension defaults and metadata about the greeter's seat user DB.
It does NOT edit any profile, run `dconf update`, modify assets,
restart GDM, or touch either the guest login state or BlackPearl.

Importantly, the output labelled `test1 + DCONF_PROFILE=gdm` is
**not** the greeter user's effective settings. GNOME 50 uses a dynamic
`gdm-greeter` account with its own `XDG_CONFIG_HOME`.
We must not assume a dconf setting read as `test1` applies to the
actual running greeter.

GNOME admin guidance recommends the GDM profile entries:
`user-db:user`, `system-db:gdm`, and the correct vendor
`file-db:...` entry. The vendor file-db entry is particularly critical
to preserve on GNOME 50; incomplete profiles have caused broken GDM
login screens. Do NOT create a custom profile without reviewing the
VM's vendor file-db location.

Only after inspecting that output should we implement a strictly
VM-only **reversible** system-extension installer and SSH/TTY
uninstaller, with the verified preinstall qcow2 checkpoint as last resort.

## G1.0.2: VM-only reversible installation

**Before installing**, verify the actual greeter's dconf settings. The
`test1 + DCONF_PROFILE=gdm` result in the earlier audit was the WRONG
account for deciding whether the dynamic `gdm-greeter` account has
disabled extensions. The new audit obtains the live GNOME Shell process
UID and its whitelisted dconf config paths, then reads GSettings as that
specific UID. It requires `sudo -n` in the VM. If sudo credentials
aren't configured for non-interactive use, STOP; use interactive guest
sudo rather than weakening permissions or editing the greeter user-db.

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-gdm/audit-effective-greeter-settings.sh
)
```

This audit is read-only. **Do not run installer** if it cannot read the
real greeter's `enabled-extensions`, `disabled-extensions`, and
`disable-user-extensions` settings, or if they differ from defaults.

The installer is intentionally split into a non-privileged transfer and
an interactive privileged guest-only operation, avoiding privilege
escalation on BlackPearl.

Once the audit passes and the recovery checkpoint has been verified,
upload the verified bundle from BlackPearl into only the TEST VM's
`test1` staging directory:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-gdm/stage-g1-to-vm.sh
)
```

This step is **staging only**, not an install. GDM is unchanged.

To actually install into the VM (sudo may ask for the guest
`test1` password over SSH TTY):

```bash
(
    set -euo pipefail
    ssh -tt mellon \
      'sudo bash /home/test1/.local/state/mellon-gdm/g1-incoming/install-g1-in-guest.sh'
)
```

Installer hard guards:
- GNOME Shell 50.1, GDM3 50.1, guest `test1` UID 1000, VM detected,
  greeter `gdm-greeter` and running `--mode=gdm` verified.
- The versioned source pack has good checksums, safe unlinked files,
  GDM system-extension directory is root-owned, and all new install
  paths were absent.
- GDM vendor profile is **exactly** Ubuntu 26.04's existing
  `user-db:user` + `file-db:/var/lib/gdm3/greeter-dconf-defaults`.
- The new admin profile preserves both lines, adding
  `system-db:gdm` between them.
- Creates `/etc/dconf/db/gdm.d/95-mellon-greeter` with only the
  Mellon UUID in `enabled-extensions`; updates dconf without editing
  the vendor file-db. Refuses to overwrite existing admin profiles.
- Greeter GSettings are checked as the LIVE `gdm-greeter` account
  before any system changes; nondefault settings cause an abort.
- Installs root-owned readable assets under
  `/usr/share/gnome-shell/extensions/mellon-greeter@local/`
  via an atomic directory rename, separate from the user extension.
- A root-owned emergency rollback command is installed **first** at
  `/usr/local/sbin/mellon-greeter-g1-rollback`.
- Does NOT restart GDM or reboot either computer. A restart of the
  **TEST VM only** is required to assess the greeter extension visually.

### Emergency recovery if the VM's GDM greeter fails

From BlackPearl, still using SSH into `test1`:

```bash
(
    set -euo pipefail
    ssh -tt mellon 'sudo /usr/local/sbin/mellon-greeter-g1-rollback'
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

Rollback refuses to delete any unexpected profile/keyfile or extension.
It removes only known G1 files and reruns `dconf update`, leaving the
vendor profile and the user's `mellon-lab@local` untouched. If SSH and
TTY recovery both fail, the verified offline
`MELLON-GDM-PREINSTALL-001` snapshot remains available; restore is a
separate deliberate operation, never automatic.

**G1.2 remains a PHOTO-ONLY greeter prototype.** It does not yet
introduce star activation, edge connections, mapping, HUD or the 5-second
grid, and has not yet passed an actual GNOME greeter visual test.
