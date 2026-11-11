# Mellon M7.1 — Radiant Stellar Ignition (GNOME 50.1 VM only)

**Status:** M7.1 source and synthetic CI tests implemented; live GNOME 50.1
guest visual acceptance pending. The M7 code is kept in
`lab/gnome50-m7/`, and the user-tested M6.4 source remains unchanged.

## M7.1: dramatic ignition, stronger completion, sustained brightness

This changes **only** Mellon animation visuals. Native GNOME password
entry, retries, failure detection, **UNAUTHORIZED ACCESS**, and manual
**SHOW LOGIN** are unchanged.

- **Strong initial stellar ignition:** A newly activated photographic star
  now briefly grows by up to **75%** in its core sprite (previously 22%).
  A second, much wider translucent copy of the *same real source-star
  pixels* creates a ~**2.65×** peak bloom. This is NOT a synthetic dot,
  generic white disk, or retouched photograph; the RGB source remains
  unchanged. The ignition flare lasts ~**0.72 s**.
- **Much stronger completion wave:** When all real-star vertices activate,
  the **1.60 s** center-out wave expands cores by up to **48%**, adds a
  wide photographic bloom, and dramatically brightens/broadens the
  original connecting edges. It is triggered by reaching the animation's
  eighth length stage, **not** by GNOME approving authentication.
- **Sustained brilliant finished state:** When the wave ends, **every lit
  star remains visibly larger and brighter** (1.18× core size plus a
  permanently visible photo-derived bloom). All completed connecting
  edges remain thick and luminous (roughly **0.93 opacity, 2 px core**,
  with a soft 5.6 px underglow at native resolution). The drawing timer
  stops automatically; no pulse/animation runs continuously.
- **Clear reset semantics:** A Backspace below the complete eight-stage
  state cancels the completion latch, extinguishes a random active star
  according to M6.4 rules, and restores normal brightness on remaining
  partial edges. Completing the figure again triggers a fresh wave.
  Authentication failure, native SHOW LOGIN, unlocking, and relocking
  clear/hide the effect state, as appropriate.

Transient glow uses two composited copies of the already-verified tiny
26×26 **original-color** star sprite. The 12-scene source photo pack
`~/VMs/Mellon/m6-curated-12-v1/` is reused **without rebuilding**.
There is no constellation search, no altered star coordinates, and no
new image generation.

### Install / test inside the isolated VM

Run **only from BlackPearl**, not inside the VM:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-m7/deploy-from-blackpearl.sh
)
```

The installer validates the tested 12-scene pack, checks the guest's
library fingerprint, backs up the currently installed M7/M6 extension
under `pre-m7-*` inside the VM, verifies transferred files, and replaces
**only the guest extension**. It preserves your current fixed/random
scene choice. It does NOT reboot either system.

Reboot **only** the test VM:

```bash
(
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

### M7.1 acceptance

1. Type one character: newly activated stars should flare prominently,
   then settle back into their usual normal active brightness.
2. Type through eight stages: the center-out completion wave should be
   unmistakably stronger, affecting both source stars and connecting lines.
3. **Wait after the completion animation:** all selected stars and only
   the correctly connected lines must stay **bright and static**, not
   return to dim M7 levels. There should be no continuing CPU/fan activity
   from frame animations.
4. Press Backspace below eight stages: a random selected star extinguishes,
   the bright completed state clears, and lines touching unlit stars vanish.
   Type to completion again: the strong wave should retrigger.
5. Confirm that **UNAUTHORIZED ACCESS** still appears after each wrong
   password, while SHOW LOGIN remains manual and exposes GNOME's native
   prompt. Unlock/relock and confirm no previous animation persists.
6. Test a 9-star and a 17-star scene; both use the same bounded animation
   logic. Visually check that the glow retains original blue/red/gold hues.

**Rollback to the previous working guest extension:**

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m7/rollback-last-guest-install.sh
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

The previously installed guest version is restored from its latest
`pre-m7-*` backup; the replaced version is preserved for debugging.
**Never install M7.1 on BlackPearl's host GNOME shell.**

---

## M7.0 historical design notes



**Status:** M7 code and synthetic CI complete; user-testing inside the
`mellon-gnome50-lab` VM is next. M6.4 is already user-tested and remains
unchanged in `lab/gnome50-m6/`.

M7 is a **visual-only** upgrade. It reuses the EXACT twelve curated original
photographs and source-star overlays from the **verified** local
`~/VMs/Mellon/m6-curated-12-v1/` pack: no new matching, no image enhancement,
no changed source-star coordinates, no additional library download.
Every constellation still has eight or more source stars.

## Effects

1. **Stellar ignition.** Each randomly selected star's original photographic
   sprite briefly grows by up to ~22% and settles. The effect uses the
   same original colored pixels; it never draws a new fake star dot.
2. **Directional energy packets.** When both endpoints of an original
   connecting edge first become illuminated, a short pale cyan segment
   travels for 0.70 seconds from the newly lit star toward the other
   endpoint. If both endpoints are lit in the same step, the direction
   is consistent but not derived from a key. A pulse is canceled
   immediately if either endpoint goes dark.
3. **Constellation completion.** On the transition to *all source stars
   illuminated*, a restrained 1.18-second wave spreads from the figure's
   geometric centre outward. It temporarily enlarges star sprites by up
   to ~11% and subtly brightens the existing connecting edges. It is a
   purely visual milestone after entering enough characters, **not an
   authentication success indication**.
4. **Bounded runtime.** The existing transient drawing timer animates at
   ~16 fps only while star opacity changes, a pulse is in motion, a
   completion wave runs, or the existing failure warning flashes. It
   stops automatically afterward. There is no idle loop, shader, or
   GPU-heavy particle system.
5. **Backspace / failed attempt.** Random Backspace selection from M6.4
   stays untouched. Disconnecting an edge cancels its in-flight packet.
   Failed authentication cancels all transient effects and retains
   the red centered `UNAUTHORIZED ACCESS` message.

**Privacy and recovery remain unchanged:** GNOME exclusively owns
password text, focus, verification, retries, and unlock. Mellon observes
only native buffer length changes and GNOME's failure counter. It does not
inspect raw keys or entered characters. The effects module holds transient
monotonic timestamps for *visual animation scheduling only*; it never logs
or persists password contents, lengths or typing times.
`SHOW LOGIN` reveals the untouched native prompt on demand.
No number of invalid attempts automatically reveals the prompt.
A broken/missing asset must fail open.

## Install in isolated GNOME 50.1 VM

Use BlackPearl's **zsh** terminal:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-m7/deploy-from-blackpearl.sh
)
```

The script explicitly checks the VM name, SSH guest identity `test1`,
GNOME Shell 50.1 and the verified baseline. It validates the installed
guest `library.json` hash against the preexisting local M6.4 pack;
rejects mismatches; copies unchanged photographs and M7 code into
a checksum-verified temporary **guest** directory; preserves the
current guest scene selector (fixed or random-on-lock); backs up
the entire working M6.4 guest extension under
`~/.local/state/mellon/backups/pre-m7-<timestamp>`, then swaps only
`mellon-lab@local` in the test guest. The BlackPearl host GNOME
directories are not touched. The script does **not** reboot.

Reboot **only** the test VM:

```bash
(
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

## Guest acceptance checks

1. Lock the guest and type one character. Watch a random source-colored
   star (or two) briefly expand before settling.
2. When an active star connects to another active star, check that a
   short light pulse travels down the *real connecting line* and ends.
   No pulse may travel toward an unlit star.
3. Press Backspace while a pulse is moving. Random currently active
   star(s) should extinguish, and any disconnected pulse disappear.
4. Enter eight characters (the normal eight-stage completion point).
   All the source stars illuminate and a restrained center-out completion
   flash crosses the constellation. It should end automatically.
5. Wait a few seconds with the lock screen showing. There should be no
   continuing animation or fan/CPU ramp.
6. Try the 17-star Andromeda, 14-star Pegasus/Scorpius, and a 9-star
   figure. All must behave consistently. If you need a fixed scene, run
   `bash lab/gnome50-m6/select-scene-in-guest.sh dust-cloud/08-And`
   then unlock/relock the guest. Restore random selection with
   `bash lab/gnome50-m6/select-scene-in-guest.sh random-on-lock`.
7. Submit two wrong passwords. Verify the large red
   `UNAUTHORIZED ACCESS` warning for every attempt, with no automatic
   native UI reveal. Click `SHOW LOGIN`, verify native login works,
   unlock and relock.

## Rollback — restore the fully working M6.4 VM extension

If M7 looks wrong or the guest lock screen misbehaves, use `SHOW LOGIN`.
For rollback, from BlackPearl:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m7/rollback-last-guest-install.sh
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

Rollback restores the latest `pre-m7-*` guest backup. The replaced M7
version is kept separately for diagnosis. No host GNOME changes.

## Implementation

- `extension.js` — exact M6.4 authentication/scene structure with
  only star scaling, dynamic line packets and transient completion light.
- `stellar-effects.js` — pure deterministic state machine: transient
  birth times, correctly directed packets, cancellation and bounded
  intensity envelopes; no GNOME imports or side effects.
- `scene-data.js`, `failure-tracker.js`, `stylesheet.css` — copied from
  the tested M6.4 release without edits.
- `test-stellar-effects.mjs` — test transient state changes, idle stop,
  8–24-star compatibility, and failure cancellation.
- `test-m7-regression.mjs` — check that native authentication, fail-open,
  manual recovery, scene activation, private verifier and source geometry
  remain present and unchanged.
- `.github/workflows/mellon-m7-checks.yml` — syntax/build logic checks
  and synthetic tests; **never** starts the 558-million-placement Go search
  or installs on any GNOME session.

**M7 is not approved for BlackPearl's real lock screen until explicit later
production-readiness testing and your approval.**
