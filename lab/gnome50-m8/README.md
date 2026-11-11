# Mellon M8.2 — Dynamic Constellation Mapping (GNOME 50.1 test VM)

**M8.1.1 has been visually approved in the VM.** This iteration keeps the
same four-corner layout, photo colors, original constellation geometry, native
GNOME login, SHOW LOGIN button, failure warning and strong M7.1 finish.

## Changes

The bottom-right eight slim segments now represent the *existing illuminated
photographic star mask*. The HUD never sees password text, key events, a
password-length observer, typing timestamps or verifier state. A pure
`hud-progress.js` function inverts M6.4's eight-stage activation curve:
`ceil(starCount × stage / 8)`. It works for all 8–24-star figures, including
9-star and 17-star scenes, and respects randomized star activation.

- Empty constellation: eight dim segments, **AWAITING INPUT**.
- Partial: 1–7 cyan segments, **MAPPING CONSTELLATION**.
- All original stars active: eight cyan segments,
  **CONSTELLATION MAPPED**. This describes the *visual scene only*.
- During M7.1's original 1.60-second completion effect, a brief glint passes
  through the eight bars using the **existing** M7.1 animation source.
- After M7 settles, eight bars remain brightly lit without any HUD animation
  timer. Backspace removes the appropriate progress; a failed authentication
  clears it immediately while the red **UNAUTHORIZED ACCESS** alert remains
  in front. The status never claims access granted or login success.

No new animation timer, idle shading loop, photo rebuild, constellation
search, input observer, native-verifier change or host installation is added.
The original tested M7.1 `stellar-effects.js`, M6.4 `scene-data.js`, and
`failure-tracker.js` are copied byte-for-byte. M8.1's layout is unchanged.

## Automated checks

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    node lab/gnome50-m8/test-hud.mjs
    node lab/gnome50-m8/test-mapping.mjs
    node lab/gnome50-m8/test-m8-regression.mjs
    node lab/gnome50-m8/test-stellar-effects.mjs
    bash -n lab/gnome50-m8/deploy-from-blackpearl.sh
    bash -n lab/gnome50-m8/rollback-last-guest-install.sh
)
```

These are synthetic tests, **not** proof of functioning GNOME guest actors.

## Deploy ONLY to mellon-gnome50-lab

Run on the BlackPearl host's **zsh terminal**; only VM contents are changed:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-m8/deploy-from-blackpearl.sh
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

The installer verifies the 12-scene pack SHA256, guest GNOME identity, VM
baseline and scene selection; copies all M8 runtime modules and original
photos into a checksummed guest staging folder; backs up M8.1.1 under
`~/.local/state/mellon/backups/pre-m8-*`; swaps only the guest extension,
and does not reboot itself.

## Visual acceptance tests

1. Lock the logged-in **guest** at 1920×1080; check the same static panels,
   correct constellation metadata and unobstructed SHOW LOGIN.
2. Type 1–7 characters: progress tracks eight mapping stages; 9 and
   17-star constellations illuminate proportionally without extra HUD stages.
3. Backspace randomly extinguishes actual stars and retracts the number of
   active HUD segments. No connection remains attached to an unlit star.
4. At eight stages, the existing strong photo-star completion wave also
   produces a sequential glint along all eight bars; they then stay
   **bright and static** without additional CPU/fan activity.
5. Backspace below a complete constellation cancels the persistent glow and
   dims the final segment; completing it again retriggers the wave.
6. Submit wrong passwords multiple times: HUD resets and the prominent
   red warning remains on top. No failed-attempt count reveals native login.
7. Click SHOW LOGIN; GNOME's unmodified password prompt remains usable.
   Unlock/relock; check that every mapping indicator resets.
8. Narrow the VM display: original M8.1 panel-hiding rules remain intact.

## Roll back directly to screenshot-approved M8.1.1

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m8/rollback-last-guest-install.sh m8.1
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

The `m8.1` selector explicitly looks for a *fixed* M8.1 guest backup
with GNOME 50 compatible width/height observers and rejects the earlier
broken `allocation-changed` variant. `m7.1` remains available for the
original known-good photographic version. Regular `latest` rollback may
choose a previous M8.2 build, so prefer `m8.1` after a failed visual test.

## Previous M8.1.1 acceptance and history

The first M8.1 guest run failed open with `No signal 'allocation-changed'
on object 'StWidget'`. The HUD now uses the supported
`notify::width` and `notify::height` property notifications, plus
one cancellable idle callback for its first post-parenting layout.
The regression test forbids the unsupported connection and verifies
teardown of those observers and the one-shot idle source.
The actual guest render must still be checked after deployment.

**Next milestone:** M8.3 one-time scanning intro; no perpetual radar.
