# Mellon M8.3.1 — Full-Screen Grid Sweep (GNOME 50.1 test VM)

**M8.2 is the visually accepted baseline.** M8.3.1 replaces M8.3's
short corner-only calibration beam with a larger, cinematic *full-screen
translucent grid* lighting up from left to right. The display returns to the
existing Observatory and real photographic constellation after one pass.

## New visual

- A grid of approximately **23 × 14 cells at 1920 × 1080**, sized from
  the actual guest viewport (12–36 columns, 5–24 rows).
- The faint cyan grid appears over the **whole screen**, including the
  central nebula; columns light up consecutively **left to right**,
  with a subtle stagger inside each column. Already scanned cells retain
  a soft afterglow until the whole grid disappears.
- One slightly brighter leading scan line, cool cyan cell borders, and
  lightly tinted cell fills. The approved photo/stars remain visible
  throughout; no artificial stars or changes to constellation geometry.
- The HUD instruments fade in as before and are drawn above the grid.
  A small rectangular region around **SHOW LOGIN** is deliberately
  excluded from the grid to preserve immediate visual recovery.
- Exactly **one 1.85-second intro on each lock**, with a single 50ms
  transient GLib timer and one St.DrawingArea. No separate actors for
  each cell, no shader, no perpetual rendering loop.
- The drawing area is non-interactive and cannot intercept keystrokes,
  focus, clicks or GNOME authentication. Failed authentication, SHOW LOGIN,
  resizing or unlocking immediately terminates its timer and hides it.
- Grid still scans on small viewports even if M8.1's optional corner
  instruments are hidden. Resizing *during* scanning stops it safely.

## Preserved

M8.2 mapping indicators and completion glint, M7.1 strong star ignition,
random activation/Backspace and connection geometry, all 12 vetted original
photographs, native GNOME authentication, read-only failure observation,
central UNAUTHORIZED ACCESS alert, and manual SHOW LOGIN recovery.

Original M7.1 stellar-effects, M6 scene-data, and FailureTracker remain
byte-identical. **Never install on the BlackPearl host GNOME.**

## Run synthetic verification

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    node lab/gnome50-m8/test-intro.mjs
    node lab/gnome50-m8/test-m8-regression.mjs
    node lab/gnome50-m8/test-mapping.mjs
    node lab/gnome50-m8/test-hud.mjs
    bash -n lab/gnome50-m8/deploy-from-blackpearl.sh
    bash -n lab/gnome50-m8/rollback-last-guest-install.sh
)
```

CI runs all above plus earlier M5/M6/M7 regression suites. This
does **not** substitute for real GNOME 50.1 guest visual testing.

## Deploy from BlackPearl ONLY to the guest

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

The installer verifies guest identity/GNOME 50.1, the VM baseline, all
original twelve-scene assets with checksums, and existing scene selection.
It stages and verifies transferred files, backs up the previous VM
extension under `pre-m8-*`, and atomically swaps only the VM's
`mellon-lab@local`. It does not touch host GNOME or reboot anything.

## In-guest acceptance

1. Reboot guest, log into `test1`, then lock the *guest session*.
2. On lock, see a faint cyan grid across the whole guest screen.
   Left columns brighten before right columns; rows stagger slightly.
3. The scan reaches the right edge, fades away and **does not loop**.
4. The existing photographic nebula and stars remain visible behind it;
   SHOW LOGIN remains legible and clickable throughout.
5. Once scanning is done, M8.2 mapping (0–8 stages), Backspace,
   completed-star bloom, and native wrong-password warning still work.
6. Lock/relock several times; no stale grid or retained animation.
7. Resize during the sweep; it must stop without covering recovery or
   freezing the guest. Verify a narrow viewport still produces a grid.

## Recovery: screenshot-approved M8.2

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m8/rollback-last-guest-install.sh m8.2
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

`m8.2` selects a verified M8.2 backup (not M8.1 or an intermediate M8.3).
Other `m8.1` and `m7.1` rollback choices remain available.

**Status:** synthetic source CI validation is required; VM visual acceptance
is pending. This iteration is for the VM lab only.
