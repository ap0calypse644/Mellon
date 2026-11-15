# Customization cookbook

**M9 visual tuning:** each GNOME monitor owns a complete independent viewport. The live scan is a Clutter animation, **not** the older Cairo repaint timer. See [Multi-monitor rendering](MULTI_MONITOR.md) before editing geometry, beam width/gradients, timings, or primary-monitor controls.

The idea is to make the stars yours **without accidentally rewriting GNOME authentication**. Most changes can be made to the scene data or pure visual functions and validated in seconds with Node/Python before trying them in a VM.

## Before changing anything

- Work from a Git branch; commit the currently working configuration.
- Back up your **running extension directory and scene assets**, not just the .js files.
- Test in a VM. **SHOW LOGIN** and a known-working TTY rollback are mandatory.
- For pure modules copied between lock and GDM, keep the two copies in sync and run `test-g17-parity-performance.mjs`. After changes to imported GJS files, begin a **new Wayland GNOME session**; disable/enable alone may keep stale modules.
- Avoid changing the UUID, GDM's vendor profile, auth prompt, or PAM unless your goal is specifically to port to a new GNOME version (which needs separate auditing).

## Choose a fixed constellation or random rotation

The **lock** extension reads `scene-config.json` beside `library.json` at startup. Supported current shape:

```json
{
  "mode": "random-on-lock",
  "stages": 8
}
```

For a fixed scene:

```json
{
  "mode": "fixed",
  "scene_id": "veiled-ring/08-Peg",
  "stages": 8
}
```

The `scene_id` must **exactly** match one in the installed `library.json`; do not guess from a display label. The built-in picker excludes the previous scene ID when possible. To list real IDs from a pack:

```bash
(
    set -euo pipefail
    PACK="$HOME/VMs/Mellon/m6-curated-12-v1"
    python3 - "$PACK/library.json" <<'PY'
import json,sys
library=json.load(open(sys.argv[1]))
for scene in library["scenes"]:
    print(f'{scene["id"]:<28} {scene["name"]} ({len(scene["vertices"])} stars)')
PY
)
```

This example path is from the **original project workspace**; use your own pack path. After a config change, revalidate it and use a new session/lock to reload. The GDM implementation **currently hardcodes a random scene** in its entrypoint rather than consuming the lock config—see `pickScene(this._library, {mode: 'random-on-lock'})` in `greeter-extension/extension.js`. To support fixed GDM scenes, add an explicit, separately validated GDM config instead of silently reusing a home-directory file under the restricted greeter account.

## Change the number of visual stages (advanced)

The current runtime uses **eight stages everywhere**, on purpose. Relevant files:

- `scene-data.js`: `activationCount(length, n, stages = 8)`, which maps a length bucket to `ceil(n × bucket / stages)` real source stars.
- `hud-progress.js`: `MAPPING_STAGES = 8`, `mappingStage(mask)`, `mappingReadout()`, `stagePulseStrength()`.
- `hud-state.js`: `stageCapacity: 8`.
- `observatory-hud.js`: creates and renders that many stage rectangles; completion feedback also depends on full count.
- `scene-config.json`: `stages: 8`.
- All regression tests and packaging validators expect eight.

**This isn't a one-number change.** `mappingStage` explicitly rejects other capacities; changes must be coordinated and tested across scene lengths of 8–24. This display is a visualization of *input-length buckets*, not a password-strength meter and not GNOME's authentication state.

## Tweak star ignition and final glow

`stellar-effects.js` controls time envelopes; the lock `extension.js` and GDM `greeter-starfield.js` apply these envelopes to photographic star sprites and lines.

Look for:

- initial ignition peak and duration (currently about 0.72 s),
- RGB-preserving photo sprite core/bloom scaling,
- the center-out completion wave (currently about 1.60 s),
- final settled brightness and line glows,
- `FRAME_MS = 62` (a temporary frame interval, not a permanent idle renderer).

Make changes to **both** relevant renderers if their display behavior should remain identical. Source-derived sprites use the **original star RGB**; replacing them with generic white circles would abandon one of Mellon's design constraints.

Run:

```bash
(
    set -euo pipefail
    node lab/gnome50-m8/test-stellar-effects.mjs
    node lab/gnome50-m8/test-mapping.mjs
    node lab/gnome50-gdm/test-g14-starfield.mjs
    node lab/gnome50-gdm/test-g18-hud-runtime.mjs
)
```

## Tune Observatory mapping text and pulses

`hud-progress.js` is pure JavaScript:

- `mappingReadout()` currently displays `MAPPING 01 / 08` … `07 / 08`;
- `STAGE_PULSE_SEC = 0.56` controls the brief segment flare;
- `stagePulseStrength(elapsed)` is a sinusoidal envelope in [0,1];
- `segmentWaveStrength()` drives the final completion glint.

`observatory-hud.js` chooses pulse *scale*, applies label text, draws the segments, and resets the transforms on Backspace. Keep all scale and opacity resets; a leaked transform can hide text or move UI over recovery controls.

## Rearrange the four HUD corners

The geometry is in `hud-layout.js`, where `hudLayout(width, height, recovery)` computes panels.

The defaults deliberately reserve a **14% center-safe inset** (`SOURCE_SAFE_INSET = 0.14`) for the photographic constellation and hide optional panels when the viewport is smaller than 900×600. The recovery rectangle is **not optional**. GDM's account-selection layout differs from its password-cover layout; use the GDM `setRecoveryLayout(enabled)` path instead of copying lock coordinates directly.

Customize CSS in `stylesheet.css` to change borders, typography, translucency, panel glows, and recovery button styling. GNOME `St` styles are not the same as a browser's full CSS feature set; test the result under GNOME Shell 50.

## Change the five-second scan

- `hud-intro-state.js`: `INTRO_REPEAT_MS = 5000` and the pure 1.85-second sweep envelope/geometry.
- `observatory-intro.js`: one `St.DrawingArea`, per-sweep 50 ms tick, stop/reflow/destroy logic.

If you make a sweep longer than its repeat interval, define overlapping behavior explicitly; the current implementation assumes a bounded visible sweep and an idle gap. Always keep cleanup after destruction and after a native SHOW LOGIN reveal.

```bash
(
    set -euo pipefail
    node lab/gnome50-m8/test-intro.mjs
    node lab/gnome50-m8/test-intro-runtime.mjs
    node lab/gnome50-gdm/test-g16a-scan.mjs
)
```

## Change which accounts GDM shows

Only the GDM `greeter-account-chooser.js` should know about native user-list items. `MAX_CUSTOM_ACCOUNTS = 8` is a **safe UI capacity**, not a limit on Linux accounts. Unsupported rosters get native GDM instead of a truncated display. `AUTO_STABLE_TICKS = 5` waits for the native list to settle; `STARTUP_MAX_TICKS = 32` bounds the early loading curtain.

To restyle the selector, start with `.mellon-gdm-account-panel` and `.mellon-gdm-account-option` in the **GDM** stylesheet. Selecting a user must continue through `item.emit('activate')`. Do not create a homegrown authentication or session-selection flow.

## Make a new scene

For a truly different background or constellation, you must produce a new coherent photo, star catalog, graph and source-pixel sprites. The runtime manifest is **validated to exactly twelve scenes and six backgrounds**, and every scene currently has 8–24 stars with strict IDs and a 1920×1080 image. A new scene must replace or be integrated into this validated set, or you must intentionally update validation code and tests. See [Scenes & assets](SCENES_AND_ASSETS.md).

## Creative experiments

The `tools/constellations/` pipeline includes brighter-star ranking, centered shape matching, a figure-safe 14% center boundary, and unpublished Orion figure-art experiments. These are **offline design tools**, not overlays automatically installed into GDM. Mythological outlines are deliberately saved for a later milestone.

## What **not** to customize

Do not read passwords, install event interceptors, log keycodes, overwrite PAM, or claim an eight-stage completion means authentication success. Don't delete SHOW LOGIN to gain a few pixels. See [Security](SECURITY.md).
