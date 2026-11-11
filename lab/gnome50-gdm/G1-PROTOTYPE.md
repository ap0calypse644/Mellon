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
