# Component reference

This is a quick-reference map for **current M9**, not every historical prototype. Source links below are relative to the repository root.

## Shared visual engine

| File (in `lab/gnome50-m8/`) | Responsibility | Safe modification points |
| --- | --- | --- |
| `scene-data.js` | Validates 12-scene manifests, selects a scene, maps length to star count, randomizes binary star masks, filters live edges, computes cover crop | Scene-selection strategy and visual progress curve; keep validation and no-secret invariant |
| `stellar-effects.js` | Pure ignition, edge light, and 1.6 s completion envelopes | Peak glow, durations, easing; must preserve frame-bound completion and no idle loop |
| `hud-state.js` | Builds scene-based immutable Observatory captions/counters | Display text and metadata validation |
| `hud-progress.js` | Inverts the active-star mask into eight HUD stages; formats `MAPPING 01 / 08`; computes 560 ms stage pulse and completion sweep | Progress text, pulse envelope; eight stages are currently an enforced contract |
| `hud-layout.js` | Pure rectangle placement and center-safe inset for four edge panels | Band spacing, size cutoffs, margins; test recovery/control collisions |
| `observatory-hud.js` | Four `St` panels, progress rectangles, clock, and mapping pulse; owns intro/grid helper | CSS names, panel content, pulse scale, metadata |
| `hud-intro-state.js` | Pure lattice geometry, 1.85s / 5s timing and legacy scan math | Grid geometry and duration; live movement uses Clutter instead of the legacy tick |
| `observatory-intro.js` | Static `St.DrawingArea` grid + refresh-synchronized `St.Widget` scanning beam; bounded 5s start cadence | Gradient/beam styling, duration, startup and teardown |
| `failure-tracker.js` | Read-only GNOME verifier counter deltas | Keep counter observation only; never read credential buffers |
| `stylesheet.css` | Existing St/CSS styles for photo overlays, HUD, warning, and recovery | Typography, borders, spacing, glows; verify compatibility with GNOME Shell St CSS |

For the six **identical** pure/shared files named in [Architecture](ARCHITECTURE.md), update **both** `lab/gnome50-m8/` and `lab/gnome50-gdm/greeter-extension/` copies and run the parity test. Other files deliberately diverge by session.

## Lock extension: `lab/gnome50-m8/`

### `extension.js`

This is the GNOME-facing entrypoint for `unlock-dialog`. It:

1. Loads `library.json` and `scene-config.json`, verifying that all twelve photos and all selected source sprites exist.
2. Watches the active native unlock prompt and its password-buffer **length**.
3. Keeps a randomly selected binary mask of real source stars, then updates glow, connections, and HUD on changes.
4. Hosts `MellonMonitorViews` with a clipped `MVPScene` per monitor and shared **SHOW LOGIN** recovery.
5. Observes failed attempts without replacing verification.
6. Tears down old timers, signals, and actors when the dialog changes or the extension is disabled.

Important entry points to locate: `loadM7Library()`, `MVPScene`, `setLength()`, `onFailed()`, `_startFrames()`, `_invalidateSignals()` and `destroy()`. The class name `MVPScene` is historical, not a separate renderer.

### `metadata.json`

UUID `mellon-lab@local`; `session-modes: ["unlock-dialog"]`; GNOME Shell 50 only. **Do not reuse this metadata for GDM.** Extension names/UUIDs must match the installed directory.

## GDM extension: `lab/gnome50-gdm/greeter-extension/`

| File | What it does |
| --- | --- |
| `extension.js` | Mounts a single `GreeterVisuals` group in native GNOME 50 `_lockDialogGroup`, coordinates one chooser, password cover and length observer; bounds attempts and rebind |
| `greeter-visuals.js` | Owns all clipped, independent GDM monitor viewports and their photo/stars/HUD actors; one visual ordering group, GNOME logical coordinates |
| `greeter-account-chooser.js` | Primary-monitor startup curtain, 1.25 s single-user roster stabilization, up to eight themed account tiles, native `activate` event, fail-open SHOW LOGIN |
| `greeter-length-observer.js` | Attaches to the actual native `_passwordEntry` only, reads `get_length()`, disconnects old buffer signals; avoids username/OTP fields |
| `greeter-password-cover.js` | Masks only recognized password prompts; controls SHOW LOGIN, wrong-password label, focus and failure feedback |
| `greeter-starfield.js` | GDM-specific photo-derived sprite actors, drawn connections, effects, and frame timer; invokes HUD stage/completion updates |
| `metadata.json` | UUID `mellon-greeter@local`; `session-modes: ["gdm"]` |
| `stylesheet.css` | M8 styles plus GDM-only account-card styles |

The greeter has the same scene JSON model but currently chooses a random scene in `extension.js`. Its choice is cached during native `LoginDialog` recreation. This differs from the lock screen, which uses `scene-config.json`.

## Offline tools

| Location | Job |
| --- | --- |
| `tools/starfield/download_source.py`, `build_catalog.py`, `validate_catalog.py` | Original NASA M24 reference image experiment |
| `tools/starfield/corpus/` | Build/validate six-image nebula catalogues from original photos |
| `tools/constellations/match_*.py` | Search for real source-star arrangements resembling constellation graph templates |
| `tools/constellations/verify_*.py`, `test_*.py` | Check assignments, geometry, QA and provenance |
| `lab/gnome50-m6/` | Assemble and validate the currently used 12-scene photographic sprite pack |
| `assets/starfield/` | Source images and extracted metadata (not automatically the installed runtime library) |
| `assets/constellation-art/orion/` | Work-in-progress figure art, **not** part of the current runtime |

## Operational scripts

`lab/gnome50-gdm/stage-g18-to-vm.sh` and `lab/gnome50-m8/stage-m84-to-vm.sh` are pinned to the original isolated `mellon-gnome50-lab` VM and validate existing prior releases. Their installer/rollback pairs are for **that VM only**.

`lab/blackpearl-host/` historically bundled the first-install runtime for one workstation; the **M9 upgrade and rollback** live at `lab/gnome50-gdm/m9-{upgrade,rollback}-blackpearl.sh`. See [Multi-monitor guide](MULTI_MONITOR.md). `lab/blackpearl-host/` `preflight.sh` is read-only; `stage.sh` assembles hashes; `install.sh` changes on-disk extensions and GDM dconf; `rollback.sh` restores native login configuration. Review [Deployment](DEPLOYMENT.md) before porting.

## Where a change should go

- **Different scene or star order:** `scene-config.json` / `scene-data.js`, then an offline assets test.
- **Stronger ignition or slower completion:** `stellar-effects.js`, plus tests on the affected renderers.
- **Move HUD panels:** `hud-layout.js`, **both modes** as appropriate.
- **Change corner metadata or stage captions:** `hud-state.js`, `hud-progress.js`.
- **Adjust scan interval or geometry:** `hud-intro-state.js` and `observatory-intro.js`.
- **Change account selection:** GDM `greeter-account-chooser.js`, preserve GNOME's native `activate` path.
- **Change recovery/failure UI:** lock `extension.js` or GDM `greeter-password-cover.js`; never modify verifier, PAM, or password contents.
