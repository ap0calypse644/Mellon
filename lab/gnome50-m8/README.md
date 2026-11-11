# Mellon M8.1 — Observatory HUD (GNOME 50.1 test VM only)

M8.1 overlays **four small, scene-aware observatory instruments** over the
already accepted M7.1 photographic lock-screen visuals. This is a lab milestone,
not a production extension. The BlackPearl HOST GNOME lock screen is off-limits.

The actual selected constellation name, original source-star count, and genuine
scene-graph connection count appear in the top-right. The top-left identifies
MELLON / CELESTIAL OBSERVATORY below the existing SHOW LOGIN control. The
bottom-left displays the real **guest-local** date/time (refreshed every
60 seconds) and a neutral ONLINE label. The bottom-right displays **eight
permanently unlit placeholder segments** until the separate M8.2 milestone.
The map READY label means the scene was loaded, **not authentication**.

The four translucent charcoal/cyan/violet panels use a pure responsive
layout. They never occupy the protected central source-star region or touch
the SHOW LOGIN hit target; when space is insufficient, panels **disappear**
instead of crowding the photo or native-login recovery. Every HUD actor is
non-reactive and keyboard-unfocusable. The red UNAUTHORIZED ACCESS alert
stays higher in the actor stack.

## What did NOT change

- M7.1 dramatic source-pixel ignition, bright post-completion stars/lines,
  edge pulses, center-out wave and eventual timer stop.
- M6.4 original six photos / 12 verified eight-plus-star figures; 8-stage
  random reveal, randomized Backspace, and active-endpoint-only connections.
- GNOME 50.1 password, focus, verification, retries and unlock workflow.
- SHOW LOGIN manual recovery, read-only FailureTracker and fail-open behavior.
- No new star matching, photo edits, raw input hooks, false authentication
  indicators, continuous HUD animation or host GNOME modification.

## Synthetic checks (also run by GitHub Actions)

```bash
(
    set -euo pipefail
    node lab/gnome50-m8/test-hud.mjs
    node lab/gnome50-m8/test-m8-regression.mjs
    node lab/gnome50-m8/test-stellar-effects.mjs
    bash -n lab/gnome50-m8/deploy-from-blackpearl.sh
    bash -n lab/gnome50-m8/rollback-last-guest-install.sh
)
```

## Deploy ONLY to mellon-gnome50-lab (from BlackPearl)

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-m8/deploy-from-blackpearl.sh
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

The installer checks the guest's identity, GNOME 50.1, verified VM baseline,
existing M7.1/M8 version, exact curated 12-scene pack SHA256, assets, current
scene-config and stage files. It transfers a symlink-free pack, verifies
SHA256 checksums in the guest before atomic replacement, and preserves the
previous guest extension under `~/.local/state/mellon/backups/pre-m8-*`.
It does NOT reboot either system itself.

## VM acceptance checks

1. Lock the **guest** at 1920×1080: look for four thin edge instruments
   outside the constellation, with SHOW LOGIN unblocked at the upper left.
2. Verify a fixed Scorpius or Andromeda scene shows its actual name, star
   count (14 or 17), and a genuine connection count, not invented sensor
   readings. Switch back to random-on-lock afterward.
3. Wait past one minute and verify guest-local time advances without animated
   idle effects. Ensure all eight progress placeholders remain UNLIT even
   after completing the visual constellation.
4. Type and Backspace: M7.1's glow, random star selection and live-only
   connecting edges should be exactly as before.
5. Submit several wrong passwords: each should show centered flashing red
   UNAUTHORIZED ACCESS above all HUD instruments. SHOW LOGIN must still
   reveal GNOME's unmodified native login.
6. Resize the guest to 1280×720, 1024×768, 800×600 and tall/narrow: HUD
   must never cover the center or SHOW LOGIN. Hidden panels on small screens
   are intentional.
7. Unlock/relock repeatedly: no stale HUD panels or timers should survive
   the lock session. Check GNOME Shell logs if the HUD fails to appear.

## Restore previous guest extension

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m8/rollback-last-guest-install.sh
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

For a **guaranteed M7.1 rollback** after multiple M8 installs, pass
`m7.1` to the rollback script (the installer saves the original M7.1 in
`pre-m8-*`, and the option selects its metadata rather than the latest
broken M8 backup):

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m8/rollback-last-guest-install.sh m7.1
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

The default `latest` mode restores the last `pre-m8-*`, which can be an
earlier M8 build. Every rollback retains the replaced version in the VM.

## M8.1.1 GNOME 50.1 runtime fix

The first M8.1 guest run failed open with `No signal 'allocation-changed'
on object 'StWidget'`. The HUD now uses the supported
`notify::width` and `notify::height` property notifications, plus
one cancellable idle callback for its first post-parenting layout.
The regression test forbids the unsupported connection and verifies
teardown of those observers and the one-shot idle source.
The actual guest render must still be checked after deployment.

**M8.2** (dynamic stage segments) and **M8.3** (one-shot intro scan) are
separate future steps requiring M8.1 VM visual approval.
