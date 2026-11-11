# Mellon M6 — Six-Scene Observatory Pilot (GNOME 50.1 VM only)

**Status:** The six-scene M6.0 pilot was tested successfully in the
GNOME 50.1 guest. M6.1 adds brighter original-color star light and randomized
star activation/Backspace removal, with edges gated on BOTH lit endpoints.
The updated code passes CI synthetic tests; **M6.1 guest testing is pending**.
No change has been made to BlackPearl's host lock screen.

## M6.1: brighter original stars, randomized illumination and edge gating

M6.0 passed guest testing. These are intentional cosmetic-only follow-ups:

- **Stronger source-photographic illumination.** The generated transparent
  26×26-pixel star textures now use an RGB-residual gain of **5.20** (was
  2.65) and original-pixel sampling expansion of **1.90** (was 1.60).
  Shared RGB scaling prevents independent channel clipping that could make
  a blue/red star turn white. The tiny PNG remains based on the *real*
  photographed light profile; it is **not** a drawn white disk or an
  invented brighter source catalog star. The actual source JPG is unchanged.
- **Randomize newly lit stars.** On each GNOME password-*length* increase,
  sample from currently inactive real-star indices *without replacement*.
  With nine stars, the first character can light any two positions (for
  example indices 3 and 7), not always stars 0 and 1.
- **Randomly remove lit stars on Backspace.** On each password-*length*
  decrease, sample only from **currently active** stars, not the last
  activated one. Other illuminated stars remain unchanged. Each subsequent
  insertion is a fresh random choice among the remaining inactive stars.
- **Only connect two illuminated stars.** Connector rendering now checks
  the current active mask on **both** endpoints. A line disappears
  immediately when either endpoint is switched off, even while the source
  star's light smoothly fades. A line is never drawn to an unlit star.
- **Same eight stages.** The number of illuminated stars still depends on
  password **length only**; complex constellations illuminate multiple
  randomly chosen stars on each early keystroke. After eight characters
  all selected source stars are on; deleting characters past that stage
  doesn't extinguish a star until the count drops below eight.
- **Same authentication and recovery.** Never intercept key codes or raw
  password content; no input history or random choices are persisted.
  The GNOME-native password verification, centered flashing
  `UNAUTHORIZED ACCESS` alert, and **manual-only SHOW LOGIN** remain
  unchanged. The original M5.4 source is untouched.

### Rebuild only the derived photo assets and upgrade the VM

Because the earlier `m6-pilot-pack` already exists, M6.1 creates
`~/VMs/Mellon/m6-pilot-pack-v2`. The installer **rejects** an old
pack even if `MELLON_M6_PACK` points to it. It does **not** rerun
constellation matching, overwrite v9, or modify the host shell.

Run on BlackPearl:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-m6/deploy-from-blackpearl.sh
)
```

This checks the existing v9 library, generates stronger original-color
sprites only once, validates the pack, and backs up the currently working
guest extension under `~/.local/state/mellon/backups/pre-m6-*`
**inside the VM**. The new pack defaults to the fixed Blue Gold / Leo
scene; reselect `random-on-lock` if desired. Reboot **only the guest**.

After reboot, lock the VM and perform these acceptance checks in order:

1. Type one character: two randomly chosen source stars should light,
   noticeably brighter than M6.0; try multiple locks for different pairs.
2. Continue typing: existing lit stars remain lit as new random stars
   illuminate. Check that no duplicate/drawn markers appear.
3. Backspace: randomly selected currently lit stars fade out; their
   removal is not the reverse of the original activation order.
4. Only lines joining **both lit stars** appear. Extinguishing either end
   removes its line immediately. No edge points to an unlit source star.
5. Try a larger constellation (e.g., 13-star Virgo); it completes in the
   existing eight stages, with nonsequential/randomized star picks.
6. Deliberately submit wrong passwords; verify the large centered alert
   still appears, no number of failed attempts automatically exposes
   GNOME, and manual SHOW LOGIN still works. Confirm normal unlock/relock.

**Rollback:** repeat the M6.0 deployment from a trusted previous Git
revision or restore the guest-local `pre-m6-*` backup. Do not install
either version on BlackPearl's host GNOME shell.

## Scope

This is an independent `lab/gnome50-m6/` extension build, retaining the same
`mellon-lab@local` UUID **only inside the existing test guest**. The working
`lab/gnome50-m5` source is unchanged, and the deploy script backs up the
entire installed guest extension before swapping it.

The pilot is pinned to six actual v9 matches (one from each background).
Every scene contains **at least eight unique detected source features**:

| V9 ID | Name | Real matched vertices |
| --- | --- | ---: |
| `blue-gold-nebula/02-Leo` | Leo | 9 |
| `chromatic-nebula/01-Leo` | Leo | 9 |
| `cosmic-wings/03-Vir` | Virgo | 13 |
| `dust-cloud/03-Crt` | Crater | 9 |
| `rosy-rosette/04-Cyg` | Cygnus | 9 |
| `veiled-ring/03-Gem` | Gemini | 12 |

The local v9 JSON provides star IDs, vertices, and connecting edges.
Nothing is inferred from contact-sheet thumbnails, and no search is run.
The installer verifies the full v9 database first using its already-built
Go binary in `--verify-only` mode.

### Appearance and activation

1. The unmodified **dimmed photographic JPEG** fills the background using
   the same cover/center transform as the known-good M5 renderer.
2. Each source star gets a tiny **26×26 RGBA image derived from its own
   photographic light profile**. The builder samples the original star's
   local RGB excess above background, magnifies it modestly, and builds a
   sparse alpha texture. The texture blends over the original dimmed image
   to brighten and slightly expand **existing star pixels**. It does not
   synthesize new white nodes, arbitrary disks, or colored pin markers.
3. The GNOME renderer changes only each tiny non-reactive sprite's opacity,
   plus low-opacity thin lines joining the original vertices. Unlike the
   M5 Orion prototype, it does **not** draw white circles at star positions.
4. Screen scaling and cropping use the exact same transform for the original
   photo, the Cairo connector lines, and the star sprites.
5. The count of illuminated stars is a function of native password
   **length only**, capped at eight progression stages. Nine-star Leo
   reaches all nine by stage eight; 13-star Virgo activates 2,4,5,7,9,10,
   12,13 stars over stages one through eight. Backspace lowers the count.
   Nothing reads the actual password, raw keys, key names or password text.
   No password-length information is logged or saved.
6. Wrong passwords still flash the centered **UNAUTHORIZED ACCESS** alert,
   and their star animation decays. Multiple wrong attempts **never
   automatically reveal native GNOME login**.
7. **SHOW LOGIN** remains the only intentional manual recovery control;
   an internal error or unsupported GNOME API can still fail open to
   GNOME's own underlying UI.

The default M6 selection is **fixed** to Blue Gold / Leo. Changing the
selection takes effect on the next lock. Random selection is optional and
never occurs unless you explicitly choose `random-on-lock`.

## ONE command: build the scene pack and install in the isolated VM

Do **not** run this on the guest itself or on your normal GNOME lock screen.
Run it in BlackPearl's interactive zsh terminal:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-m6/deploy-from-blackpearl.sh
)
```

The script:

- Checks the VM identity `mellon-gnome50-lab`, guest user `test1`,
  GNOME Shell `50.1` and the verified baseline checkpoint.
- Re-verifies the **existing v9 database** and all original photo hashes,
  star IDs, geometry, safe zones and current QA images. **No searching**.
- Constructs `~/VMs/Mellon/m6-pilot-pack` exactly once if absent.
  It refuses to overwrite an existing pack or any intermediate staging
  directory. If the pack already exists, it validates and reuses it.
- Copies only the six source-color photographs, sparse PNG sprites,
  read-only scene metadata, and M6 extension source to a temporary
  directory **inside the VM**.
- Computes a SHA256 manifest on BlackPearl and verifies every copied
  guest file before performing the switch.
- Moves the previous guest extension into
  `~/.local/state/mellon/backups/pre-m6-<timestamp>`.
- Installs and enables the new `mellon-lab@local` source **only inside
  the test guest**. The host GNOME directories are never written.
- Does **not** reboot either machine. Reboot **only the test VM** to
  load the extension update, and lock the VM to test.

The matching output remains under
`~/VMs/Mellon/constellation-quality-v9/` and is not changed.

## Test all six scenes

First reboot the VM, not BlackPearl. On BlackPearl:

```bash
(
    set -euo pipefail
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

After the guest is back and you can see its desktop, lock **only** the guest
via its window or send the VM key sequence:

```bash
(
    virsh -c qemu:///system send-key mellon-gnome50-lab KEY_LEFTMETA KEY_L
)
```

The default Blue Gold / Leo should appear. Test typing and backspace
(including stage eight), a wrong-password attempt and its big red alert,
manually revealing the native login and unlocking correctly. Relock and
verify the scene resets; confirm no automatic login reveal after two
wrong attempts.

Switch the NEXT lock to each other scene **on the guest only**:

```bash
(
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m6/select-scene-in-guest.sh chromatic-nebula/01-Leo
    bash lab/gnome50-m6/select-scene-in-guest.sh cosmic-wings/03-Vir
    bash lab/gnome50-m6/select-scene-in-guest.sh dust-cloud/03-Crt
    bash lab/gnome50-m6/select-scene-in-guest.sh rosy-rosette/04-Cyg
    bash lab/gnome50-m6/select-scene-in-guest.sh veiled-ring/03-Gem
)
```

**Important:** Running all five commands immediately will select only the
**last** one. Run **one command, relock and test that scene**, then run the
next. The selection script atomically modifies only the guest copy of
`scene-config.json`; no guest restart is needed for selecting the next
scene.

Once all six have passed, optionally test random selection (no immediate
repeat across lock cycles):

```bash
(
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m6/select-scene-in-guest.sh random-on-lock
)
```

For now, leave it fixed if you want deterministic, reproducible bug reports.

## Fail-safe and rollback

If M6 causes an authentication problem, **SHOW LOGIN** should reveal the
untouched native prompt. If it does not, SSH access to the VM remains
available even when the graphical lock screen is unusable.

The original M5.4 source and its deploy script are preserved in the repo.
Restore M5.4 **only in the VM**:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m5/deploy-from-blackpearl.sh
)
```

Then reboot **only** the guest. Guest-local `pre-m6-*` backups are retained
as another recovery option; the M6 installer never deletes them.

## Verification and limitations

- Code/logic tested on GitHub CI: see
  `.github/workflows/mellon-m6-checks.yml`. It runs **no photo matching**,
  modifies no VM, and has no access to native GNOME authentication.
- The scene pack is generated and validated on **your BlackPearl**, since
  the full verified `matches-v9.json` and `qa-index.json` are your local
  run artifacts, not committed to GitHub.
- GNOME 50.1 rendering, actor positioning, transparent CSS texture handling,
  repeated locks, UI resizing, and native recovery must be **tested in the
  actual VM**. Source-level tests are not runtime acceptance.
- Physical star positions are only source **photograph** detections. The
  geometrically matching constellation schematics are not claims of true
  astrometric correspondence.
- No scene images, source stars, templates, or full v9 databases are
  committed by this lab code. Future M6 approvals can then be packaged
  reproducibly from the same original verified data.
