# Mellon M8.3.2 — Grid sweep every five seconds (GNOME 50.1 VM only)

**Status:** code and synthetic tests ready for a new guest visual test.
M8.3.1's visually approved full-screen cyan grid remains exactly the same
in appearance. **Only its scheduling changes.**

## Behavior

The first full-screen sweep starts when the lock scene appears. Subsequent
sweeps **start every 5 seconds**, measured from the start of the previous
sweep: 0, 5, 10, 15 seconds, etc. Each complete left-to-right grid pass
runs for **1.85 seconds**, leaving approximately **3.15 seconds idle** with
the grid actor hidden and no animation-frame timer.

On the FIRST sweep only, the existing corner instruments fade in as before.
On all following sweeps, the Observatory HUD remains fully visible and
opaque; the translucent grid moves across the photo behind the panels,
except for the deliberately excluded SHOW LOGIN visibility region.

This uses **one lightweight recurring 5,000ms GLib scheduling source**
and a **short-lived 50ms GLib animation source active only during a sweep**.
There is no continuous 20fps idle render loop and no new star processing.

The grid remains a *single*, non-reactive `St.DrawingArea`, not hundreds
of cell actors. The 23×14 grid at 1920×1080 keeps its existing geometry,
cool cyan lighting, left-to-right order, trailing afterglow and fade.

### Safety and lifecycle

- `SHOW LOGIN`, guest unlock, extension destroy, an incorrect-password
  warning or resizing **cancels both timers permanently** for that lock.
  No repeat sources are left running after the native login is exposed.
- The native GNOME password prompt is untouched. M8.2's mapping stages,
  M7.1 source-photo sprites and connectors, and the red center warning
  are unmodified. No keyboard or password data enters the grid code.
- Subsequent lock sessions create a fresh sequence as usual.
- BlackPearl host GNOME is **never modified**; test only in
  `mellon-gnome50-lab`.

## Verification

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    node lab/gnome50-m8/test-intro.mjs
    node lab/gnome50-m8/test-intro-runtime.mjs
    node lab/gnome50-m8/test-m8-regression.mjs
    node lab/gnome50-m8/test-mapping.mjs
    node lab/gnome50-m8/test-hud.mjs
    bash -n lab/gnome50-m8/deploy-from-blackpearl.sh
    bash -n lab/gnome50-m8/rollback-last-guest-install.sh
)
```

`test-intro-runtime.mjs` simulates GNOME's GLib timers and an inert
drawing-area actor. It checks 0/5/10s starts, disappearance at 1.85s,
no high-frequency work in the 3.15s idle interval, stable HUD opacity
after the first sweep, and cancellation during scans, between scans,
on resize and on extension destruction.

GitHub Actions runs all M8 tests plus the earlier M7/M6/M5 regression
suite. Passing CI does not replace an actual GNOME 50.1 guest test.

## Deploy to test VM only

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    node lab/gnome50-m8/test-intro-runtime.mjs
    node lab/gnome50-m8/test-m8-regression.mjs
    bash lab/gnome50-m8/deploy-from-blackpearl.sh
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

Installer checks guest identity/version and original 12-scene photo pack,
transfers checksum-verified runtime sources, and backs up the previous
guest M8 release. It does not touch the host GNOME lock screen.

## Guest acceptance

1. Log into `test1` inside the VM, then lock that guest session.
2. Observe sweeps beginning on lock, then around 5s, 10s and 15s.
   Each is identical to the approved left-to-right full-screen grid.
3. Verify the HUD is *not* repeatedly faded out; it remains steady
   and legible after its initial appearance.
4. Wait between sweeps: the grid must completely disappear for about
   3.15s and no continuous frame rendering should persist.
5. Click SHOW LOGIN or submit a wrong password early in a sweep:
   the grid disappears and never restarts during that lock.
6. Verify Backspace, eight-stage constellation completion, the red
   failure overlay and native GNOME login are unchanged.
7. Resize the guest during a sweep: both animation and repetition
   should stop safely rather than covering the center or recovery.

## Roll back directly to the previous one-shot M8.3.1

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m8/rollback-last-guest-install.sh m8.3.1
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

The `m8.3.1` selector validates both the metadata and absence of the new
repeat-timer code. The screenshot-approved M8.2 fallback is still
available as `.../rollback-last-guest-install.sh m8.2`.

**Approval for BlackPearl host deployment has NOT been given.**
