# Contributing to Mellon

Mellon is a fairly unusual GNOME Shell experiment: some parts are just neat visual math; other parts run on the login screen. Contributions are welcome, but the second category gets extra care.

## Good first contributions

- Better documentation, screenshots with private details removed, accessibility improvements.
- New `hud-progress.js` animation envelopes with tests.
- A scene pack using **rights-cleared** images and reproducible star coordinates.
- GNOME 50 test harness improvements and stronger timer teardown tests.
- Hardware-independent staging/rollback code **without weakening the current BlackPearl safeguards**.
- Fixes for GDM account selection or SHOW LOGIN recovery, demonstrated in a VM.

## First steps

1. Read the [README](README.md), [Architecture](docs/ARCHITECTURE.md), and [Security](docs/SECURITY.md).
2. Fork and create a descriptive branch.
3. Run the [fast test loop](docs/DEVELOPMENT.md) before changing anything.
4. Keep visual changes in pure modules where possible.
5. Include tests and a screenshot/short GIF only when the visual difference needs demonstration. **Remove usernames, secrets, or host details.**

## Style

Prefer readable GJS/JavaScript over clever abstractions, short comments explaining private GNOME assumptions, and tiny one-purpose pull requests. Keep the GDM and unlock paths separate where they genuinely differ. Shared pure modules need identical copies in both installed extensions and matching tests.

For a PR that touches the login manager, describe:
- the exact GNOME/GDM distro version;
- which session mode(s) change;
- which private GNOME fields/API assumptions change;
- test commands and whether a VM acceptance test passed;
- whether native SHOW LOGIN still works and what happens on failures;
- how the user can roll back **without a working graphical login**.

A passing Node mock is not an acceptable replacement for trying a changed GDM actor in an attended VM or on recoverable test hardware.

## Photos, templates, and licenses

Don't submit image packs without source links, author credit, license/permission, and proof that vertex positions and sprites match the source pixels. See [Assets & licenses](docs/ASSETS_AND_LICENSES.md). Original project source code is [MIT](LICENSE); third-party photos and derived sprites are not automatically MIT.

## Security reports

Don't post credentials, an exploitable GDM bypass, or private host details in a public issue. Follow [SECURITY.md](SECURITY.md) for reporting. Regular bug reports are fine with redacted logs and steps to reproduce on a test VM.

## Project conventions

Current accepted build is **M9 on both lock screen and GDM**. See [the multi-monitor guide](docs/MULTI_MONITOR.md) before changing any viewport or native GDM actor ordering. Earlier milestone tests are historical; use the current M9 test suite. Root `install.sh` and `extension.js` are historical; new functionality belongs under `lab/gnome50-m8/`, `lab/gnome50-gdm/greeter-extension/`, and the supporting tools/docs. Please don't turn the old single-extension prototype into a new install path.
