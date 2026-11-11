# Mellon M7 — Stellar Ignition Lab (VM ONLY)

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
inspect or record keys, timestamps of typing, or entered characters.
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
