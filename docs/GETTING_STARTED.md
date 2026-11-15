# Getting started: try Mellon safely

**Start with a VM, even if you plan to use Mellon on your daily machine.** The verified target is **GNOME Shell 50.1** with Ubuntu GDM 50.1. A GNOME Shell extension executes in the same process responsible for showing the login or unlock UI. "It's only visual" does *not* make a broken overlay harmless.

## Compatibility at a glance

| Item | Known-good development target |
| --- | --- |
| Linux | Ubuntu 26.04.1 |
| GNOME Shell | **50.1** |
| GDM | Ubuntu gdm3 **50.1** |
| Desktop | GNOME, Wayland |
| Test VM | QEMU/KVM + libvirt, guest with 4 vCPU / 8 GiB RAM / 64 GiB disk |
| Guest name in original scripts | `mellon-gnome50-lab` |
| Guest SSH alias / account | `mellon` / `test1` (uid 1000) |
| Developer languages | GJS (JavaScript), Bash, Python; Go for quality-v9 matching |
| Needed for synthetic tests | Node.js (modern ESM; CI uses GitHub Actions Node) |

Different Linux distributions, GNOME versions, GDM implementations, SELinux/AppArmor policies, display layouts, and users **are not automatically supported**. The known-good configuration is a starting point, not a compatibility guarantee. The included installer scripts hard-code these details and have strict fail-closed checks.

## 1. Explore without installing

```bash
(
    set -euo pipefail
    git clone https://github.com/ap0calypse644/Mellon.git
    cd Mellon
    node lab/gnome50-m8/test-mapping.mjs
    node lab/gnome50-m8/test-intro-runtime.mjs
    node lab/gnome50-gdm/test-g18-hud-runtime.mjs
    node lab/gnome50-gdm/test-g17-parity-performance.mjs
)
```

That verifies the source algorithms and mock GNOME lifecycles. The tests do not need GDM, root or a VM. For the full test matrix, see [Development](DEVELOPMENT.md).

## 2. Create an isolated GNOME 50 VM

Use your preferred VM manager (virt-manager / libvirt is what this project was built against). Install GNOME Shell 50.x and GDM 50.x. Prefer a nonproduction disposable guest with snapshots/checkpoints and an **independently usable SSH or console path**.

Before doing anything to its login manager:

1. Confirm the guest starts into **native GDM** and a normal desktop login succeeds.
2. Confirm you can enter an alternate TTY from the guest and use it to log in if GDM fails.
3. Save a **powered-off VM checkpoint** of the guest disk and UEFI NVRAM (if using UEFI).
4. Record `gnome-shell --version`, `dpkg-query -W gdm3`, user UID, guest hostname, and GDM dconf profile location.
5. Work in a separate branch; keep your host's GDM/lock installation untouched.

The original automated VM staging scripts are hard-pinned to the author's guest name, SSH alias, paths, exact Ubuntu package versions, and *previously installed* Mellon milestones. They **cannot perform an initial fresh install in an arbitrary VM**. Treat them as a well-tested reference for preflight/backup/atomic swap behavior, not as an instant one-line installer.

## 3. Build the source photo corpus (included) and runtime pack (not bundled)

The Git repository contains the six-image original/cropped [photo corpus](../assets/starfield/corpus-v1/README.md), the matching tools, and the twelve **pinned scene IDs** in [`pilot-selection.json`](../lab/gnome50-m6/pilot-selection.json). It does **not** contain the final 12-scene `library.json` + generated transparent star sprites in ready-to-install form.

The exact runtime pack was assembled offline from a quality-v9 match database. Reproducing it involves an expensive matcher, visual review, and packaging; see [Scenes & assets](SCENES_AND_ASSETS.md).

To create a Python environment for offline image work:

```bash
(
    set -euo pipefail
    python3 -m venv .venv-mellon
    .venv-mellon/bin/python -m pip install -r requirements-v7.txt
    .venv-mellon/bin/python -m pip install scipy
    .venv-mellon/bin/python lab/gnome50-m6/verify-pilot-pack.py --help
)
```

**Important:** `tools/starfield/requirements.txt` pins an older NumPy/OpenCV/SciPy combination for the original catalog builder. For reproducible catalog rebuilds, use a **separate virtual environment** rather than installing both requirements files into one environment.

The matching engine in `tools/constellations/quality-v9/` is written in Go. `rebuild_quality_v9.sh` uses **one million proposals and 4,000 refinements per image/template**; it is substantial CPU work, not a lightweight install step. It also assumes an existing `~/VMs/Mellon` workspace. Read the pipeline guide first; for experimentation, reduce the budgets and review all chosen star placements before packaging.

## 4. Stage an installation to your VM

A current runtime bundle has roughly:

```text
lock extension (mellon-lab@local)/
  extension.js
  metadata.json
  scene-data.js
  stellar-effects.js
  failure-tracker.js
  hud-state.js        hud-progress.js
  hud-layout.js       observatory-hud.js
  hud-intro-state.js  observatory-intro.js
  stylesheet.css
  library.json        scene-config.json
  assets/             ← 12 vetted backgrounds + source-pixel sprites

GDM extension (mellon-greeter@local)/
  extension.js
  metadata.json
  greeter-starfield.js
  greeter-length-observer.js
  greeter-password-cover.js
  greeter-account-chooser.js
  [matching visual engine modules]
  stylesheet.css
  library.json
  assets/
```

`lab/blackpearl-host/stage.sh` shows how to combine the current source tree with the validated photo pack and produce per-file SHA256 manifests. It **requires** the original BlackPearl/VM and is *not* portable as-is. For a new machine, fork or create a new staging script that receives explicit paths and checks for source/guest identity before writing anything. Do not bypass failures by deleting guards; replace them with checks appropriate for your guest.

For the first guest install, follow the guarded process described in [Deployment](DEPLOYMENT.md): verify native login settings, build checksum-verified bundles, back up vendor state, publish the user extension separately from GDM, prepare a recovery script, and only then restart the **guest**.

## 5. What to check in the VM

- Initial greeter: a photo backdrop, early **ESTABLISHING UPLINK** transition, and one-user account handoff without automatic authentication.
- Password entry: source-star glows activate in randomized order; Backspace removes currently lit stars (not a fixed last-in-first-out star); a line is visible **only if both endpoint stars are lit**.
- Eight stages: the HUD reads `MAPPING 01 / 08` … `CONSTELLATION MAPPED`; reaching all eight produces visual completion, not login success.
- Observatory scan: cyan grid left→right about every five seconds, while the source photo remains visible.
- Recovery: SHOW LOGIN exposes usable native GNOME controls; a wrong password gives a red warning but doesn't prevent retry.
- Lock the guest after logging in: M8.4 should match GDM's visuals.
- Test three lock/unlock and login/logout cycles; check the console and journal for exceptions.

If a test fails, restore the VM snapshot or extension backup. **Do not proceed to a physical host while your recovery route is untested.**

## 6. Real-machine installation

The [BlackPearl deployment README](../lab/blackpearl-host/README.md) records a successful **single-workstation** installation with strict identity and GDM database checks. It is not a generalized package manager. Learn the [deployment model](DEPLOYMENT.md), adapt preflight/stage/install/rollback *together*, and rehearse the rollback from a TTY before carrying it to another device.

For GNOME Shell on Wayland, a newly copied user extension might not appear in `gnome-extensions` until the next desktop session. **Don't force-restart the running GNOME Shell.** Validate recovery access, add only your extension UUID to the next session's enabled list if needed, and log out/re-enter in your test guest.
