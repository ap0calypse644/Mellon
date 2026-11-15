# API reference: scene math and effects

Most of Mellon's behavior can be understood and tested without GNOME. The **pure modules** under `lab/gnome50-m8/` are also copied into `lab/gnome50-gdm/greeter-extension/`; parity tests keep their implementations identical.

## `scene-data.js`

| Function | Input and output | Key invariant |
| --- | --- | --- |
| `validateLibrary(library)` | Manifest → same validated manifest | Exactly 12 scenes, six backgrounds, 8–24 vertices/scene, matching sprites, safe paths |
| `activationCount(length, n, stages=8)` | Native password character count + source-star count → target number lit | `ceil(n * min(max(floor(length),0),8)/8)`; visual only |
| `updateActiveStars(mask, target, random?)` | `Uint8Array` mask → **new** mask | Picks randomly without replacement from currently off/on stars; Backspace is not LIFO |
| `activeEdges(edges, mask)` | Scene topology + mask → visible edge list | Both endpoints must be illuminated |
| `pickScene(library, config, lastId?, random?)` | Library and `fixed`/`random-on-lock` mode → scene | Fixed ID validated; random selector avoids previous ID when possible |
| `coverTransform(w,h,W,H)` | Viewport/image size → `{scale, dx, dy}` | Matches CSS `background-size: cover` exactly |

For a scene of 13 stars, lengths 1–8 map to star counts `2,4,5,7,9,10,12,13`. The eight visual stages saturate at length ≥8; they say nothing about successful authentication.

## `stellar-effects.js`

A stateful **visual** model with no GNOME imports, no password values, and no I/O.

- `new StellarEffects(count, edges)`: checks 8–24 real stars and up to 48 valid edges, initializes transition state.
- `transition(mask, monotonicSeconds)`: records new star ignition, newly lit edges and the moment the entire mask becomes lit. Clearing a star cancels the completed state.
- `sample(monotonicSeconds)`: returns `{ignition, pulses, completion, settled, busy}`. Render at ~62 ms **while busy**; stop the high-frequency source afterward.
- `reset()`: clears all effects.
- `completionWave(progress, radialFraction)`: center-out wave intensity.
- `completionLevel(frame)`: bright static completion latch; **not a GNOME authentication result**.
- `starLightProfile(flare,wave,completion)`: core/halo scale and halo intensity.
- `connectionLightProfile(wave,completion)`: line/glow alpha and width.

Durations: `IGNITION_SEC=0.72`, `PULSE_SEC=0.70`, `COMPLETION_SEC=1.60`. All glows use RGB pixels from the original photograph, not generated stars.

## `hud-progress.js`

- `MAPPING_STAGES=8` is enforced.
- `mappingStage(mask)` counts lit stars and returns stage 0–8, without seeing the native buffer.
- `mappingReadout(stage)`: `AWAITING INPUT`, `MAPPING 01 / 08`…`07 / 08`, `CONSTELLATION MAPPED`.
- `mappingStatus(stage)`: original coarse status format.
- `STAGE_PULSE_SEC=0.56` and `stagePulseStrength(elapsed)`: new partial-segment glow envelope.
- `segmentWaveStrength(progress,index)`: final completion segment glint.

The HUD invokes these pure functions and applies scales to existing `St` actors; the stage pulse **does not create another timer**.

## `hud-state.js` and `hud-layout.js`

`hudMetadata(scene)` validates names, source-star/edge counts and returns immutable captions/stage capacity. `hudLayout(width,height,recoveryRectangle?)` returns four optional panel rectangles and protects a central 14% inset. Optional panels hide on small viewports; SHOW LOGIN remains the emergency escape. GDM has its own layout version.

## `hud-intro-state.js`

`gridGeometry(w,h)` calculates columns/rows (roughly w/82 by h/78, bounded). `introFrame(elapsedMs)` returns fade/sweep state. `gridCellStrength(frame,column,row,geometry)` returns deterministic brightness for a left→right scan.

Timers are owned by the **actor adapter** rather than these functions: 5,000 ms repeat interval, 1,850 ms visible sweep, 50 ms temporary frame samples.

## `failure-tracker.js`

`new FailureTracker().observe(verifier)` returns `{supported, failures}` using only the private GNOME `_failCounter`. It never reads a password. Unsupported verifier state must trigger native fallback instead of invented feedback.

## GNOME-specific APIs

These are **GJS actor adapters**, not Node imports:

| Component | Important methods |
| --- | --- |
| Lock `MVPScene` in `extension.js` | `setLength()`, `onFailed()`, `revealNative()`, `_startFrames()`, `destroy()` |
| GDM `GreeterLengthObserver` | `sync(dialog,isGdm)`, `destroy()` |
| GDM `GreeterStarfield` | `setLength()`, `clear()`, `destroy()` |
| GDM `GreeterPasswordCover` | `sync()`, `onLength()`, `observeFailure()`, `revealNative()`, `destroy()` |
| GDM `GreeterAccountChooser` | `sync()`, `revealNative()`, `destroy()` |
| Both `ObservatoryHUD` | `setMapping()`, `setCompletion()`, `destroy()` |

Read [GDM internals](GDM_INTERNALS.md) and [Observatory](OBSERVATORY.md) before changing actor lifecycles.

## Example: test a helper with Node

```js
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile('lab/gnome50-m8/hud-progress.js', 'utf8');
const moduleUrl = 'data:text/javascript;base64,' +
  Buffer.from(source).toString('base64');

const {mappingReadout} = await import(moduleUrl);
assert.equal(mappingReadout(3), 'MAPPING 03 / 08');
```

This is how the existing harnesses work around GNOME-specific `gi://` imports.
