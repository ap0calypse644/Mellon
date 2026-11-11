# Mellon M6.4 — Twelve-Scene Observatory (GNOME 50.1 VM only)

**Status:** GitHub source and synthetic CI checks only. The user-verified M6.3
guest remains unchanged until the VM deployment below is run. **Do not
install the extension on BlackPearl's actual lock screen.**

## M6.4 — the curated constellation library

M6.4 promotes the prior six-scene pilot to a 12-scene library. **All selected
figures have eight or more real photographed source stars.** Coordinates,
source-star identities, connecting edges, and brightness metadata are read
only from the previously verified local v9 database; there is **no
constellation search**, no new placements, and no fabricated nodes.

| Background | Pinned constellation | Stars |
| --- | --- | ---: |
| Blue Gold Nebula | Leo (02-Leo) | 9 |
| Blue Gold Nebula | Crater (07-Crt) | 9 |
| Chromatic Nebula | Leo (01-Leo) | 9 |
| Cosmic Wings | Leo (01-Leo) | 9 |
| Cosmic Wings | Virgo (03-Vir) | 13 |
| Cosmic Wings | Cepheus (05-Cep) | 10 |
| Dust Cloud | Crater (03-Crt) | 9 |
| Dust Cloud | Andromeda (08-And) | 17 |
| Rosy Rosette | Cygnus (04-Cyg) | 9 |
| Rosy Rosette | Scorpius (06-Sco) | 14 |
| Veiled Ring | Gemini (03-Gem) | 12 |
| Veiled Ring | Pegasus (08-Peg) | 14 |

The scene pack includes the **same M6.3 photographic-light renderer**:
source-pixel gain 7.20, expansion 2.12×, RGB-preserving transparent
26×26 sprites, thin lines drawn only between **both currently lit** stars,
and nonsequential random star activation/removal as password length changes.
The approved GNOME native authentication, flashing **UNAUTHORIZED ACCESS**
warning, and manual **SHOW LOGIN** recovery are unchanged.

### Random selection by default

The freshly generated M6.4 configuration sets `random-on-lock`, and
the existing random selector chooses one of all twelve scene IDs. In
one extension lifetime it excludes the immediately previous scene ID
if available. There is no input/password logging or secret handling.
You can still choose any specific scene using the existing
`select-scene-in-guest.sh` tool.

**Intentional upgrade behavior:** unlike previous visual-only M6 upgrades,
M6.4 changes the default scene mode to `random-on-lock` even when the
previous guest was left in fixed mode. To keep an intentionally fixed
scene during installation, set `MELLON_M64_PRESERVE_MODE=1` when running
the deployer.

### Build a separate, verifiable 12-scene pack and install it in the VM

Run on BlackPearl's terminal (this does **not** install an extension on
BlackPearl):

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-m6/deploy-from-blackpearl.sh
)
```

M6.4 first verifies the existing `matches-v9.json` and source files
without running any placements. It builds only derived photo sprites
and scene JSON in the **new** directory
`~/VMs/Mellon/m6-curated-12-v1/`, without overwriting M6.3's pack.
It refuses missing, under-eight-star, duplicated, stale, or improperly
aligned scenes. It validates the whole pack and its SHA256 checksums,
backs up the installed guest extension inside the VM under
`~/.local/state/mellon/backups/pre-m6-*`, then installs the twelve-scene
version into **only** the GNOME 50.1 guest. **No automatic reboot**.

Reboot only `mellon-gnome50-lab`:

```bash
(
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

Lock/unlock the guest repeatedly to sample the library. Check that its
six original pilot scenes still work, that Andromeda (17), Pegasus (14)
and Scorpius (14) illuminate fully in eight password-length stages,
that star-on/Backspace choices remain randomized, and that lines never
connect to an unlit star. Verify red wrong-password warning, native
SHOW LOGIN and normal unlocking unchanged.

To choose a particular scene for the **next** lock:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m6/select-scene-in-guest.sh dust-cloud/08-And
)
```

To return to library-wide random mode:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m6/select-scene-in-guest.sh random-on-lock
)
```

To restore the previous guest version, use the copied
`pre-m6-*` backup in the guest, or check out the last known-good
M6.3 version in a separate trusted local worktree and deploy its
VM-only installer. Do not update BlackPearl's host extension.

**Orion's eighteen-star bow is not included automatically.** It didn't
pass into the top-eight v9 matches for any background. Its original
per-template checkpoints remain available for a future visual review;
this release does not arbitrarily promote a lower-ranked Orion.

---

## Historical M6.0–M6.3 documentation (superseded for installation)


**Status:** M6.1 behavior was user-tested successfully on the GNOME
50.1 guest. M6.2 added brightness; M6.3 further increases illuminated
photographic star brightness and size without changing native authentication,
random star selection or line-connection logic. Automated tests are tracked
in CI; M6.3 runtime testing in the GNOME VM remains pending. The BlackPearl
host lock screen remains untouched.

## M6.3: another small brightness and star-size increase (2026-11-11)

The original photographic RGB star residual now uses **gain 7.20** (up
from 6.20 in M6.2) and **expansion 2.12×** (up from 1.90×). This makes
each *illuminated* source star modestly brighter and larger, while preserving
the underlying photograph, the star's red/blue/gold color, its exact
source-star position and the soft edge feathering. No replacement circles
or white markers are drawn. The tiny RGBA sprites remain 26×26 pixels.

This is **derived-image regeneration only**, not an astronomy search and
not a modification to the M6 extension's authentication or star-selection
logic. Random star activation, random Backspace removal, and connectors
only between two lit stars continue working as before.

The M6.3 pack is generated separately at
`~/VMs/Mellon/m6-pilot-pack-v4/`. Older packs remain untouched. The
guest installer backs up the *currently installed* GNOME extension inside
the VM before swapping it, and the pack validator rejects stale assets.

Run from **BlackPearl**, installing exclusively into the test VM:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-m6/deploy-from-blackpearl.sh
)
```

Then reboot **only** `mellon-gnome50-lab`; do not reboot BlackPearl.
Verify illuminated stars are a little larger/brighter in both a
blue/gold and a red-toned scene, and test typing, randomized Backspace,
two-lit-endpoint line gating, wrong-password alert and manual SHOW LOGIN.
Synthetic CI tests check source-color preservation, luminosity improvement
and footprint growth relative to M6.2; live GNOME verification is still
required.

## M6.2: a slightly brighter star-light profile (2026-11-11)

M6.1 was confirmed working in the GNOME 50.1 VM. M6.2 is **only** a
brightness adjustment. In the existing original-photograph pixel renderer:

- Increase hue-preserving RGB residual gain from **5.20 to 6.20** (~19%).
- Keep expansion at **1.90×**, sprite dimensions at **26×26**, and the
  same real-star source pixels, feathering, shared RGB clipping, image
  positions, 8-stage activation and smooth fade.
- Keep random lit/unlit star selection and the two-active-endpoints
  line rule completely unchanged.
- Preserve GNOME-native authentication, manual SHOW LOGIN and centered
  UNAUTHORIZED ACCESS warning without modification.

The previous installed M6.1 is backed up in the **guest** during
deployment. M6.2 generates the independent local derived asset directory
`~/VMs/Mellon/m6-pilot-pack-v3/`; old v1/v2 packs are not overwritten or
accepted as the new version. No constellation matching/search is rerun.

From BlackPearl (install **only into the Mellon VM**):

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-m6/deploy-from-blackpearl.sh
)
```

Then reboot **only** `mellon-gnome50-lab`, lock the VM, type and erase
several characters, and check that stars are visibly a little brighter
without losing their original blue/red/gold tint. Lines still require
**both** stars to be active, and wrong-password/manual-login behavior
should be unchanged. CI checks compare the synthetic source-light
profile against the previous M6.1 gain. **Live M6.2 VM QA is pending.**

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
