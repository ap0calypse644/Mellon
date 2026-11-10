# Mellon M6 — Six-Scene Observatory Pilot (GNOME 50.1 VM only)

**Status:** Built and pushed to GitHub; GJS syntax checks, scene/selection
unit tests, M5 failure-observer regressions, and synthetic red/blue
photographic-pixel tests pass. **Not yet loaded or tested in a GNOME VM.**
No change has been made to the BlackPearl host lock screen.

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
