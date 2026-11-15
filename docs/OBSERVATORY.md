# Observatory HUD and light engine

The Observatory is the cockpit-style layer around the constellation. It is deliberately **visual-only**: the star mask drives all four instruments; GNOME continues to authenticate.

## Four edge panels

`hudMetadata(scene)` provides name, number of actual photo-star vertices, connections, status and eight-stage mapping capacity. `hudLayout(w,h,recovery)` computes top-left, top-right, bottom-left and bottom-right rectangles with a **14% safe central inset**. Optional panels hide at <900×600. The recovery rectangle must not collide with a panel.

GDM has an intentional layout variant because native account and password-cover modes have different button needs. Do not copy lock-screen coordinates into GDM without testing both.

## Eight-stage mapping

A `Uint8Array` of N source-star bits is the only input to `mappingStage()`. `activationCount()` maps input length to star count; `mappingStage()` inverts that mapping from visible stars without receiving password length.

`mappingReadout()` displays `AWAITING INPUT`, `MAPPING 01 / 08` through `07 / 08`, then `CONSTELLATION MAPPED`. When a stage rises, the HUD stores previous/new stages and monotonic time. Its `stagePulseStrength()` envelope lasts **560 ms**, driven by the *existing* 62 ms stellar renderer. On Backspace, the trailing segments and their scales reset immediately. The last stage uses the original 1.60-second completion wave, then settles bright.

A completed stage is **not evidence of successful authentication**.

## Full-screen grid

One transparent `St.DrawingArea` represents the whole lattice—no actor per cell. `gridGeometry()` sets approximately 23×14 cells at 1920×1080, `introFrame()` calculates the left→right sweep and fade, and `gridCellStrength()` computes deterministic cell brightness.

- New scan start every **5,000 ms**
- Temporary drawing frames every **50 ms**
- Each sweep lasts **1,850 ms**
- Approximately **3,150 ms idle** between sweeps, with no active high-frequency grid frame timer

`ObservatoryIntro.onLayout()` handles resizing; `stop()` and `destroy()` must cancel both GLib timer IDs. Incorrect passwords do **not** permanently disable scanning in M8.4/G1.8; native SHOW LOGIN exposure still hides the overlay.

## Real-pixel star glow

`StellarEffects.transition(mask, now)` initiates source-star ignition and edge pulses only for fully illuminated edge endpoints. `sample(now)` returns the current animations and `busy`, so a 62 ms frame loop exists only when needed. Source-derived **26×26 RGBA** star pixels are composited over the dim photo, duplicated for a halo while preserving original RGB. No synthetic white star circles are inserted.

Parameters to tune:
- `IGNITION_SEC=0.72` in `stellar-effects.js`;
- `PULSE_SEC=0.70` for newly connected edges;
- `COMPLETION_SEC=1.60` for the center-out wave;
- `STAGE_PULSE_SEC=.56` in `hud-progress.js`;
- `INTRO_REPEAT_MS=5000` and `INTRO_DURATION_MS=1850` in `hud-intro-state.js`;
- CSS in each `stylesheet.css` for panel translucency, labels, borders and recovery.

Keep the same scene crop transform for photo, stars and lines; even a few pixels of mismatch makes the effect look wrong.

## Verify a tweak

```bash
(
    set -euo pipefail
    node lab/gnome50-m8/test-stellar-effects.mjs
    node lab/gnome50-m8/test-mapping.mjs
    node lab/gnome50-m8/test-intro-runtime.mjs
    node lab/gnome50-gdm/test-g18-hud-runtime.mjs
)
```

Then verify the actual screen in a GNOME 50 VM: CSS, blending, timing, resize, SHOW LOGIN and teardown are not fully modeled in Node. **Don't add an endless high-frequency repaint loop** to fix a static style; the existing idle-power behavior is intentional.
