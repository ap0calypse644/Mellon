# Changelog

Mellon follows working feature milestones. Historical lab modules retain
their original names so existing assets, VM scripts, and troubleshooting notes
continue to be discoverable.

## M9 — multi-monitor observatory (16 November 2026)

**Status:** accepted on BlackPearl, Ubuntu 26.04.1, GNOME Shell 50.1
(Wayland), external 3440×1440 ultrawide plus a 2560×1440 laptop screen at
fractional scaling. Other hardware/distro combinations still need testing.

### Added
- One clipped, locally scaled scene/constellation/HUD per GNOME logical monitor
  in both the user lock screen and GDM greeter.
- Shared lock-screen password observer and shared GDM native-auth controller,
  with presentation actors fanned out to every viewport.
- GDM's account picker and recovery actions anchored on its primary monitor.
- Layout reconfiguration after changes to GNOME's monitor geometry, without
  moving the native login dialog.
- GDM-only atomic upgrade and dedicated previous-install rollback scripts,
  retaining checksum-verified full-package backups.
- Focused multi-monitor viewport and native GDM-account/recovery mock tests.
- [Multi-monitor architecture, customization, deployment and rescue guide](docs/MULTI_MONITOR.md).

### Changed
- Replaced the old timed Cairo sweep with a refresh-synchronized Clutter
  scanning actor, a static Cairo lattice, a 1.85-second edge-to-edge pass and
  a five-second start cadence.
- Updated active CI for the actual M9 actor hierarchy. Earlier single-screen
  regression fixtures remain available as historical milestone tests.
- Updated deployment guidance: a fresh Wayland GNOME Shell process is needed
  to load modified imported JavaScript. Disabling/re-enabling an extension
  does not reliably load changed modules.
- GDM installer no longer tries to execute a user-installed Node binary from
  root's restricted `sudo` environment. Node preflight is unprivileged.

### Unchanged
- GNOME owns all password text, authentication, session choice, and PAM.
- Visual effects see password length only, never the password contents.
- **SHOW LOGIN** can reveal the native UI.
- Images and derived star sprites must remain rights-cleared; source code
  licensing does not automatically grant image rights.
- BlackPearl's old initial installer and full host rollback remain historical
  and are **not** rerun over a working M9 installation.

### Compatibility caveat
This release targets GNOME Shell 50.1 internals. It is hardware-accepted on
one installation, not a universally compatible extension installer. Use a VM
and an attended TTY recovery plan when porting to another machine.

## M8.4 / G1.8 — initial BlackPearl production installation

- Unified eight-stage Observatory mapping and progress pulses.
- Curated source-photographic stars, randomized activation and connection
  strokes, strong completion wave and persistent illumination.
- Four-corner HUD, repeating five-second grid, native GDM user selection,
  and bounded wrong-password feedback.
- GDM login and user lock both confirmed functional on the original host.

See [Project history](docs/HISTORY.md) for older M1–M7/G1 development steps.
