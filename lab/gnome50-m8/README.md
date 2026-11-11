# Mellon M8.3 — Observatory Arrival Scan (GNOME 50.1 VM only)

**Status:** synthetic tests pending; the actual lock-screen effect needs visual
review in the dedicated `mellon-gnome50-lab` VM. M8.2 is user-approved.

## One-time arrival sequence

On each new guest lock, after GNOME has allocated the HUD, the existing
corner panels fade in over the opening of a **1.05-second** calibration
sequence. A narrow, pale cyan scan line travels left-to-right *inside each
visible HUD panel*, then vanishes. There is **no full-screen sweep**, no
artificial constellation stars and no looping radar.

- One short GLib timer at 50 ms while the intro is running (~20 frames/s),
  then completely removed. No idle animation or timer after 1.05 seconds.
- GNOME's native SHOW LOGIN button stays immediately available and above
  all ordinary visual content; the central red UNAUTHORIZED ACCESS alert
  is kept highest in the actor stack.
- Display resize cancels intro immediately (no positional drift into the
  central star field). No panels at a tiny resolution means no intro.
- SHOW LOGIN, unlock/teardown or an authentication failure cancels the
  decorative intro and returns panels to full opacity.
- The twelve photographic images, M7.1 ignition/completion, M8.2 eight
  mapped segments and all GNOME authentication logic remain unchanged.
- Intro modules are isolated from keys, password buffers and verifier data.

## Implementation

- `hud-intro-state.js` — pure envelope and panel-safe scan positions.
- `observatory-intro.js` — non-reactive scan actors, single bounded timer,
  clear-on-complete/cancel/destroy lifecycle.
- `observatory-hud.js` — creates intro, supplies existing approved layout,
  stops on hide/destroy without changing the approved mapping panel.
- `extension.js` — visual-only cancel on failed authentication; native
  GNOME input and M7.1 effects are unchanged.
- `test-intro.mjs`, `test-m8-regression.mjs` — synthetic checks for
  timing, geometry, teardown, no unsupported GNOME signals and auth
  isolation. GitHub Actions verifies all M8, M7, M6 and M5 checks.

## Deploy from BlackPearl, only to the GNOME 50.1 VM

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    node lab/gnome50-m8/test-intro.mjs
    node lab/gnome50-m8/test-m8-regression.mjs
    bash lab/gnome50-m8/deploy-from-blackpearl.sh
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

The installer verifies VM name, guest identity, GNOME 50.1, original
12-scene pack hashes, and scene-selection mode before using a checksummed
staging directory and atomically replacing **only** the test guest's
`mellon-lab@local`. It backs up the current M8.2 as `pre-m8-*`.
It never reboots either system by itself or installs into host GNOME.

## Guest acceptance checklist

1. After reboot, log in to `test1` first, then lock the **guest**.
   The panels should fade in and a faint line should scan *inside them*.
2. After ~1 second, the animation must stop. The nebula, real stars,
   source-color glow and eight-stage mapping must look unchanged.
3. Type through eight stages, Backspace and retry: M8.2 mapping and
   persistent photographic completion must behave exactly as before.
4. Trigger a wrong-password warning early: scanning should stop;
   UNAUTHORIZED ACCESS must be fully legible and appear above HUD.
5. Press SHOW LOGIN immediately after locking: it must still reveal the
   native prompt and remove all visible Mellon instruments.
6. Change guest resolution during an intro: the scan should stop safely
   and no line should pass into the constellation or recovery button.
7. Unlock and relock the guest several times: one intro per new lock;
   no orphan timer, repeated idle scan or stale panel state.

## Restore screenshot-approved M8.2

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m8/rollback-last-guest-install.sh m8.2
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

The `m8.2` rollback selector checks version metadata, the mapping
module and the GNOME 50 resizing fix. `m8.1` and `m7.1` still exist
for earlier backup points.

**BlackPearl's real GNOME lock screen remains off-limits until a future
explicit approval after M10 safety/performance hardening.**
