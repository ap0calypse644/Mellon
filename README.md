# Mellon ✦

**Your login screen, somewhere among the stars.**

Mellon turns the **GNOME 50 lock screen and GDM login screen** into a photographic constellation observatory. Pick a nebula, watch stars light up as you enter your password, and keep all the good parts of GNOME authentication underneath. The old login UI is still one **SHOW LOGIN** click away.

Originally built for an Ubuntu 26.04.1 workstation nicknamed *BlackPearl*. Now documented so you can explore it, fork it, and build your own version—without having to reconstruct months of experiments.

> **Project status:** G1.8 (GDM) + M8.4 (lock screen) are running successfully on BlackPearl. The source is tailored to **GNOME Shell 50.1**, not a cross-version GNOME extension or a general-purpose theme. Test in a VM before changing your login manager. Mythological figure artwork is planned, **not** part of the current build.

## What you get

- **Two coordinated interfaces:** a themed GDM greeter and a matching user-session lock screen.
- **12 curated scenes** across six nebula photographs, each with an actual-source-pixel constellation of 8–24 selected luminous points.
- **Visual-only password feedback:** randomized source-star illumination/removal on password *length* changes, with connecting lines appearing only when both endpoints are lit.
- **Eight-step Observatory mapping:** a small pulse for each reached stage and a strong 1.6-second completion wave, followed by a stable, bright constellation.
- **Cockpit HUD:** four corner instruments and a cyan grid sweep every five seconds.
- **Native recovery:** **SHOW LOGIN** reveals GNOME's normal authentication UI. Invalid attempts display an **UNAUTHORIZED ACCESS** visual warning without modifying the verifier.
- **GDM account flow:** one eligible user is selected through GNOME's own account activation event; multiple eligible users get a Mellon-themed selector (multi-user behavior is source-tested, but needs broader real-hardware testing).
- **Failure-aware lifecycle:** bounded retries, signal/timer cleanup, checksum-verified bundles, and an offline recovery plan.

Mellon **does not authenticate anyone**, replace PAM, read password text, or log raw keys. The eight-step visual completion is **not proof of a correct password**.

## Start here

| I want to… | Read |
| --- | --- |
| Understand what runs where | [Architecture](docs/ARCHITECTURE.md) |
| Find a specific source file / actor | [Component map](docs/COMPONENTS.md) |
| Try it safely on another machine | [Getting started & VM-first setup](docs/GETTING_STARTED.md) |
| Change scenes, effects, HUD, timings, or accounts | [Customization cookbook](docs/CUSTOMIZATION.md) |
| Understand images, matching, and attribution | [Scene & asset pipeline](docs/SCENES_AND_ASSETS.md) |
| Run tests or contribute a change | [Development & testing](docs/DEVELOPMENT.md) |
| Install or recover from an installation | [Deployment & recovery](docs/DEPLOYMENT.md) |
| Debug a black screen or missing extension | [Troubleshooting](docs/TROUBLESHOOTING.md) |
| Review the threat model | [Security & privacy](docs/SECURITY.md) |

Browse the [full documentation index](docs/README.md) for more.

## Two builds, one repository

```text
lab/gnome50-m8/                  ← M8.4: lock screen (unlock-dialog)
lab/gnome50-gdm/greeter-extension/ ← G1.8: GDM login screen (gdm)
lab/blackpearl-host/             ← hardware-specific deployment & rollback
tools/starfield/                 ← offline image catalog generation
tools/constellations/            ← offline constellation fitting / QA
assets/starfield/                ← sources, catalogues, previews, provenance
docs/                            ← newcomer, internals, recipes, recovery
```

**Do not start with `./install.sh`.** The root-level `extension.js`, `metadata.json`, `install.sh`, and `uninstall.sh` belong to the **2016-style** *(original experimental)* `mellon@nibir.local` prototype, **not** the current two-extension system. They remain only as historical reference. See [the project evolution](docs/HISTORY.md).

### Try the logic without touching GNOME

Clone and run the synthetic tests (Node.js and Python; a running GNOME session is not required):

```bash
(
    set -euo pipefail
    git clone https://github.com/ap0calypse644/Mellon.git
    cd Mellon
    node lab/gnome50-m8/test-mapping.mjs
    node lab/gnome50-m8/test-stellar-effects.mjs
    node lab/gnome50-m8/test-intro-runtime.mjs
    node lab/gnome50-gdm/test-g18-hud-runtime.mjs
    node lab/gnome50-gdm/test-g17-parity-performance.mjs
)
```

These tests check algorithms and mocked lifecycle behavior; **they do not prove your GNOME build is compatible**.

### Want it on your workstation?

Read [Getting started](docs/GETTING_STARTED.md) and [Deployment](docs/DEPLOYMENT.md) before running an installer. The scripts under `lab/blackpearl-host/` intentionally check for **`ap0calypse`, `blackpearl`, a particular GDM configuration, and a local VM/photo corpus**. They are examples to *adapt and test*, not something to execute unmodified on another computer.

## How the visual part works

```text
GNOME-owned PasswordEntry
       │
       └── buffer length only ──→ activationCount(length, scene size)
                                         │
                                         ▼
                                randomized active-star mask
                                         │
                       ┌─────────────────┼──────────────────────┐
                       ▼                 ▼                      ▼
                  source sprites     connected lines       eight-stage HUD
                       │                 │                      │
                       └─────────── existing effect engine ──────┘

GNOME verifier / GDM / PAM ───────────────→ actual authentication
```

No part of the star display decides whether access is allowed. Details: [Architecture](docs/ARCHITECTURE.md).

## Make it yours

The repository separates **pure functions** (scene selection, star masks, HUD progress, geometry, animation envelopes) from **GNOME-specific actors** (lock screen and GDM). You can tune a glow without rebuilding GDM, change a scene without changing authentication, or build an alternative frontend around the data model. See [Customization](docs/CUSTOMIZATION.md).

The included image corpus contains third-party photographs and attribution obligations. See [Assets and licensing](docs/ASSETS_AND_LICENSES.md). Source code is under the [MIT License](LICENSE), excluding third-party media and any material under separately stated terms.

## Contribute

Ideas, fixes, and carefully scoped experiments welcome. Check [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). If you touch GDM, bring a VM test and rollback story with the pull request. Don't put passwords, tokens, personal logs, or screenshots containing private information in issues.

The name comes from the old riddle: *Speak, friend, and enter.* This time, the door has constellations.
