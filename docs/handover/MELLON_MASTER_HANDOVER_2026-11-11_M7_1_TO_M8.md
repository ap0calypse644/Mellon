# MELLON — MASTER PROJECT HANDOVER
## 11 November 2026 (IST) | M7.1 accepted | NEXT: M8.1 Observatory HUD

> **Read this document first in the next chat.** It consolidates the full development arc from initial experiments through the user-approved M7.1 visual experience, exact paths, current design decisions, current asset library, operational scripts, known safety constraints, remaining work, and a concrete next-milestone plan. For deeper pre-November-10 benchmark and VM setup history, also read **docs/handover/MELLON_FULL_HANDOVER_2026-11-09.md** in the same repo (64,783-byte archive of the early project). That old handover is HISTORICAL: its listed "next task" is superseded by THIS document.

**Repository:** https://github.com/ap0calypse644/Mellon  
**Current working milestone:** lab/gnome50-m7/ — M7.1 Radiant Stellar Ignition  
**Last implementation commit:** 83c5276b135bcabc2f8e430fce90203014158892  
**M7.1 green CI:** https://github.com/ap0calypse644/Mellon/actions/runs/43040908421  
**User confirmation:** M6.4 fully tested and working; M7.1's much stronger ignition and completion plus persistent bright state was deployed in VM and reviewed as **“much better.”**  
**NEXT AGREED GOAL:** **M8.1 static/scene-aware, four-corner futuristic Observatory HUD**, to be built as an isolated milestone and reviewed visually in the VM before M8.2.  
**M8 is NOT yet implemented.** No experimental Mellon version has been authorized for the BlackPearl HOST lock screen.

---

# A. CRITICAL DECISIONS — DO NOT REVERSE

1. **The HOST is off-limits.** All testing/integration happens inside the dedicated GNOME 50 guest, **mellon-gnome50-lab**. BlackPearl's real GNOME lock screen must remain intact until a future explicit production signoff and a rehearsed recovery mechanism.
2. **GNOME performs all authentication.** Password, keyboard focus, retries, account authorization, unlock and PAM/GDM/GNOME security flows are native. Mellon is a visual cover only. No raw key event hook, no passwords read, no authentication overrides.
3. **Privacy:** the visual scene observes only changes in the native password *buffer length*, and the read-only GNOME verifier's failure counter. Never log password text, length, typing times, or failure counts. Transient animation timestamps are only held in memory, not persisted.
4. **SHOW LOGIN is mandatory.** Manual control appears at top left near **(26,22)**. Clicking reveals intact GNOME native login. M8 top-left branding must NOT cover its clickable area. Keep its stack position and hit target.
5. **Failure behavior:** every detected wrong password shows a large, centered, blinking red **UNAUTHORIZED ACCESS** for ~1.5 s. No number of wrong attempts automatically reveals native GNOME. Native UI does reveal on explicit SHOW LOGIN or on an extension/compatibility error (fail-open).
6. **Photographic stars ONLY:** the six backgrounds are actual photos; selected constellation vertices are luminous features detected at their original pixels. Never synthesize white circles or fabricate star anchors; photo-derived RGB enlargements must preserve blue/red/gold hue.
7. **Minimum 8 stars per constellation is a HARD user requirement.** Explicitly rejected 5-star Cassiopeia and 7-star Big Dipper/UMa despite attractive numerical ranking.
8. **Patterns must be large, centered, and edge-safe**, with room for future character artwork. Do not obscure the central nebula or mapped stars with HUD cards.
9. **Random reveal:** input length increase randomly chooses *currently unlit* star indices (without replacement); Backspace chooses *currently lit* indices to extinguish, not necessarily newest; unchanged length does not reshuffle.
10. **Edge rule:** a connection and any traveling light packet exists only when BOTH original source-star endpoints are active. Disconnected edge disappears immediately on Backspace.
11. **M7.1 brightness is intentionally STRONG.** A strong ignition flare and full-completion wave were specifically requested; after the completion wave the complete constellation's stars **AND lines stay brightly illuminated** without an idle animation loop. Do not revert to M7.0's subtle effects.
12. **Completion is VISUAL, not authentication.** Eight input characters can fully map the scene but do NOT establish a correct password. M8 labels can say “CONSTELLATION MAPPED”, NEVER “ACCESS GRANTED” based on visual state.
13. **Performance:** no heavy perpetual shaders, animation loops, particles or needless polling. BlackPearl's customized desktop previously had overheating/fan/CPU issues with overly heavy effects.
14. **Terminal is zsh.** All paste-ready multi-line shell snippets should wrap the entire script in a **( ... ) subshell**, especially if using set -euo pipefail. A bare top-level set -euo pipefail could change/terminate user's interactive shell. Use explicit bash invocation for Bash-specific syntax.
15. **Git security:** laptop was reinstalled after malicious Git post-checkout hook infection. Use **git -c core.hooksPath=/dev/null** when pulling/checking out. Do not suggest restoring old executables/tokens/SSH keys or running untrusted repository hooks.
16. **Do actual work and test it:** use GitHub connector to push verified source changes; user pulls/tests locally. GitHub Actions synthetic success is not live GNOME VM success. Never claim to have executed SSH in the user's actual VM unless that was genuinely done.
17. **Preserve known-good milestone folders:** M6.4 and M7.1 sources remain untouched when starting M8. Create new **lab/gnome50-m8/** and new guest backup/deploy/rollback scripts.
18. **Scene selection and assets are already completed.** Do not spend another day rerunning 558 million proposals just to produce an M8 HUD.

# B. BLACKPEARL AND THE ISOLATED LAB

## Host (DO NOT INSTALL AN EXTENSION HERE)

- Hostname: **BlackPearl**; Linux user **ap0calypse**.
- Ubuntu **26.04.1 LTS**, GNOME Shell **50.1**, Wayland.
- ASUS ROG Strix Scar; RTX 3070 Ti Laptop, about 30 GiB RAM, 1 TB NVMe, dual-boot.
- Root filesystem ~100 GB, home ~498 GB; keep enormous data in home.
- Interactive shell **zsh**. Main Ghostty terminal, Tilix alternate; existing Zellij/Nebula cockpit setup.
- Local repo path: **$HOME/go/src/ap0calypse644/Mellon**.
- Desktop's visual identity: violet/purple nebula wallpaper, subtle transparent spaceship widgets, centered planetary focal point unobstructed.
- User has a strong preference for mature professional digital art and efficient visual rendering; avoid crude or overly pixelated assets.

## Dedicated KVM guest

- Hypervisor URI: **qemu:///system**; VM: **mellon-gnome50-lab**.
- Ubuntu 26.04.1 Desktop, GNOME 50.1 Wayland. Guest Linux user **test1**.
- **4 vCPU / 8 GiB RAM / 64 GB qcow2**, UEFI OVMF and NAT default network.
- No VM autostart by default.
- SSH from BlackPearl via configured alias: **ssh mellon**.
- **Verified recovery baseline:** $HOME/VMs/Mellon/checkpoints/MELLON-BASELINE-001/ (disk + UEFI vars + domain configuration + checksums). Never overwrite it.
- Guest extension UUID: **mellon-lab@local**.
- Guest installed extension: **~/.local/share/gnome-shell/extensions/mellon-lab@local/** (guest test1 home).
- Guest backups: **~/.local/state/mellon/backups/**; M7 installer makes **pre-m7-<timestamp>** copies.
- Pressing host Super+L sometimes locks BlackPearl instead of the VM; use actual guest window/guest key routing or virsh send-key.

### Safe terminal snippets (BlackPearl)

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
)
```

```bash
(
    set -euo pipefail
    virsh -c qemu:///system dominfo mellon-gnome50-lab
    ssh -o BatchMode=yes mellon 'gnome-shell --version'
)
```

Reboot ONLY VM:

```bash
(
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

Lock ONLY VM (if needed, confirm key routing):

```bash
(
    virsh -c qemu:///system send-key mellon-gnome50-lab KEY_LEFTMETA KEY_L
)
```

# C. CHRONOLOGICAL HISTORY, M1 THROUGH M7.1

## Legacy root version (historic, not production direction)

The repository originally experimented with procedural GNOME unlock-dialog starfield and anonymous keypress activity. Early root README speaks about pre-lab hooks and success animations. **Do not copy old raw-key listeners or unlock override logic back into current code.** VM-specific GNOME 50 password-buffer length observer superseded it. Detailed legacy history, old benchmarks and initial VM creation are in docs/handover/MELLON_FULL_HANDOVER_2026-11-09.md.

## M1: GNOME 50 isolated probe — lab/gnome50-m1/

- Established GNOME 50.1 test guest extension, little violet/cyan HUD.
- Observes **notify::length** of GNOME's native password entry, not raw key identity or text.
- Early tests of login prompt lifecycle, user input focus, extension session mode “unlock-dialog”.
- Keeps native authentication fully visible.
- Established SSH + safe VM-only deploy baseline.

## M2 “Nightwatch” — lab/gnome50-m2/

- Procedural deep-space field with ~240 background stars, navigation grid, atmospheric nebula glow, up to 24 schematic active nodes.
- Cairo / St.DrawingArea renderer; GNOME 50 compatibility and initialization fixes (M2.1 / M2.2).
- Brief submit/failure animations; intentionally limited (~8fps) and no idle loop.
- Native auth still stays in GNOME.

## M3 “Observatory” early concept — lab/gnome50-m3/

- More cinematic deep-indigo observatory, layered ambient stars (~426), violet/cyan nebula ambiance, corner instrument framing.
- Three illustrative constellations: Orion, Cygnus/Northern Cross, Cassiopeia.
- **These are schematic/procedural mockups**, NOT precise geometry mapped to photographic source pixels. Style may inform M8, but not these synthetic star placements.

## M4: exact real-photograph stars — lab/gnome50-m4/

- Blue-gold nebula transformed original photo 1920×1080 with a 9-point Orion core.
- Selected v6 candidate #6 (zero-based), ~1.12° rotation, RMS ~4.5622px, span ~70.8% screen height.
- Validated original detected star IDs, exact pixel coordinates and image geometry.
- CSS photo cover plus Cairo source-geometry connections; prototype native GNOME visibility maintained for security.

## M5 → M5.4: visual cover, auth/failure tracking, manual recovery — lab/gnome50-m5/

- Non-reactive visual cover overlays GNOME's clock/avatar/password input without removing native actors or stealing keyboard focus.
- **SHOW LOGIN** in top-left hides visual actors and focuses GNOME's original password prompt.
- M5.2 fixed failed-attempt detection by reading the GNOME 50 **ShellUserVerifier._failCounter** via a read-only **FailureTracker** (older failed signals did not reliably report normal retries).
- M5.3 centered bold flashing red **UNAUTHORIZED ACCESS** alert for ~1.5 seconds per failure.
- M5.4 intentionally removed two-strike automatic native login reveal. Multiple wrong passwords keep showing visual warning; manual SHOW LOGIN is the routine reveal path; incompatible verifier/error still fail open.
- This behavior remains a non-negotiable native-auth safety regression baseline.

## M6.0: six-scene real-star pilot — lab/gnome50-m6/

- Go v9 offline matcher searched 31 schematics against original source luminous features from six user-selected nebula photos.
- User ran **186 background/template jobs × 3,000,000 random placement attempts = 558,000,000 transform proposals** (16 workers). Important: sampled transform attempts, not exhaustive combinations.
- Generated 48 top-ranked QA selections (8 per background); 36 had ≥8 selected source-star vertices and are eligible under user's rule.
- User reviewed actual full-resolution scenes, rejected small-star-count 5-star/7-star favorites.
- Pilot star illumination used transparent **26×26 RGBA sprites derived from each real photographed star's existing local RGB pixels**. No invented white points, no replacement circles; some star-pixel colors red/blue/gold.
- Arbitrary scene size: visually illuminates full N-node constellation across **8 length stages**, without requiring 17 password characters for 17-star Andromeda.
- M6.0 introduced source-checked pack builder/verifier and guest-only installation.

## M6.1 random reveals and connecting edges

- Input length increasing → randomly choose unlit star(s) (without replacement), **not in order**.
- Backspace → randomly extinguish currently lit stars, **not always last activated**.
- Connections ONLY when BOTH endpoints lit; immediately disappear if a vertex is deactivated.
- Original-color star gain ~5.20, size sampling 1.90×. Native authentication untouched.

## M6.2 and M6.3 source-star brightness

- M6.2 photographic RGB source-star residual gain 6.20.
- M6.3 further to **gain 7.20** and **expansion 2.12×**; source remains real star-light pixels, original RGB hue. This photo sprite configuration remains current.

## M6.4 12-scene library — USER TESTED

- Promoted 12 curated figures spanning six backgrounds, min 8 nodes each.
- New pack: **$HOME/VMs/Mellon/m6-curated-12-v1/**.
- Default scene selection random-on-lock, avoids immediate repetition **within same live extension session**.
- Preserved the eight-stage star mapping, brightness, edge rules, M5 auth and alert.
- **User explicitly said M6.4 tests pass/works fine.**
- Source: lab/gnome50-m6/ is a historical known-good fallback and 12-scene pack generator.

## M7.0 visual animation engine

- New separate **lab/gnome50-m7/**, copying M6.4's tested auth and source asset definitions.
- Pure **stellar-effects.js** handles temporary star ignition, directional connection pulses, and center-out completion wave on full visual activation.
- Source animations run ~16fps **only during activity**; stop automatically when idle.
- Pulse travels along actual lit-lit source edges and cancels if either endpoint turns off.
- No image reconstruction or new v9 matcher jobs; reused same 12-scene pack.

## M7.1 “Radiant Stellar Ignition” — CURRENT, USER APPROVED

**Git implementation commit**: 83c5276b135bcabc2f8e430fce90203014158892.  
**CI**: https://github.com/ap0calypse644/Mellon/actions/runs/43040908421 (success).  
**User said**: “much better.”

After the user requested **much stronger initial ignition**, **much stronger completion wave**, and **keep stars and connecting lines brightly lit AFTER the wave**, M7.1 now has:

- **IGNITION_SEC=0.72s**; main original-color photographic sprite scale peaks at **1.75×**, with a wider translucent *same-source-photo-pixel* halo reaching around **2.65×**.
- **PULSE_SEC=0.70s**; newly completed existing edges carry a small moving directional energy pulse, canceled on Backspace.
- **COMPLETION_SEC=1.60s**; a radial center-out wave strongly expands/glows photo stars and broadens/brightens existing real connecting edges. Core size increases up to ~48% during wave.
- **Persistent bright completed state:** once wave ends and all stars lit, core stays **1.18×** source scale, photo-derived halo remains at strength ~0.65, and connecting lines remain strongly luminous (about 0.93 alpha, 2px core + ~5.6px soft underglow in native 1920×1080 units). **No idle animation loop.**
- Backspace below full stage removes random lit star(s) and clears bright-complete latch; fully retyping retriggers wave. Failed attempt clears visual state and shows UNAUTHORIZED ACCESS.
- The completed state is a **visual mapping milestone only**, not a successful password indication.
- User visually evaluated this version in GNOME VM and accepted the strong glow direction. Do not infer exhaustive stress/security QA from their short visual approval.

# D. SIX SOURCE PHOTOS AND MATCHING GEOMETRY

**Repository corpus:** assets/starfield/corpus-v1/

| Slug | Background |
| --- | --- |
| blue-gold-nebula | Blue Gold Nebula |
| chromatic-nebula | Chromatic Nebula |
| cosmic-wings | Cosmic Wings |
| dust-cloud | Dust Cloud |
| rosy-rosette | Rosy Rosette |
| veiled-ring | Veiled Ring |

Each assets/starfield/corpus-v1/catalogs/<slug>/ includes:
- **background-16x9.jpg**: transformed/cropped 1920×1080 full-color source photo.
- **background-dim-16x9.jpg**: exact matching geometry, RGB dimmed ~0.44 for lock screen.
- **stars-all.json**: detected source luminous feature IDs and positions.
- **stars-curated.json**, **graph-curated.json**, **metadata.json**, QA images, etc.
- Original untouched user-selected photographs: assets/starfield/corpus-v1/source/.

Corpus reported ~70,136 luminous source-feature candidates across photos; 4,324 curated distributed points and 19,778 within-image graph edges. Feature ≠ definitely a physical star; bright nebular details/artifacts can be detected.

Original transform: portrait → rotate clockwise 90° if needed, center-crop to 16:9, Lanczos resize to 1920×1080; dim only RGB values. **Do not silently change crop or resize**: source star coordinates/hashes are valid only for existing geometry.

## V9 Go matcher

Code: **tools/constellations/quality-v9/**.  
31 templates: **tools/constellations/templates-v4-orion-bow.json**, including 18-star Orion with bow.

Host local data (not automatically committed to repo):
- **$HOME/VMs/Mellon/constellation-quality-v9/matches-v9.json**
- **$HOME/VMs/Mellon/constellation-quality-v9/qa-index.json**
- **qa/<background>/<rank>-<code>.png** full-resolution original-source-star QA
- **contact-sheets-clean/<background>.png** six accurate 2×4 current QA sheets. Older contact sheets may contain stale result images.
- **checkpoints/<background>/<template>.json** saved per-template jobs, incl. Orion if present.

V9 hard constraints:
- Maximum geometry RMS **13px**, maximum single vertex residual **24px**.
- Actual detected stars inside normalized **14%–86%** for x and y; outer 5% frame reserve plus 9% future art allowance.
- Constellation bounding-box center within **±13%** screen width/height of image center.
- Min pattern span **55%** of a screen dimension; rotation ~±35°.
- One-to-one assignment of source star IDs; NEVER move/invent source stars.
- Per-star brightness score **0.75 × pixel brightness percentile + 0.25 × DoG prominence percentile**.
- Constellation brightness aggregation **0.45 × mean + 0.35 × 25th percentile + 0.20 × dimmest source star**.
- Geometric match is resemblance of detected luminous pixels to schematic constellation, NOT astrophysical identity.

Verification ONLY without search:
```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    "$HOME/.local/bin/mellon-constellation-quality-v9" \
        --corpus "$PWD/assets/starfield/corpus-v1/catalogs" \
        --templates "$PWD/tools/constellations/templates-v4-orion-bow.json" \
        --out "$HOME/VMs/Mellon/constellation-quality-v9" \
        --verify-only
)
```

**Do NOT rerun the 558 million placements for M8.** Reuse existing tested library and source-photo pack.

# E. CURRENT USER-APPROVED TWELVE SCENES

**Manifest:** lab/gnome50-m6/pilot-selection.json  
**Current derived photo pack:** **$HOME/VMs/Mellon/m6-curated-12-v1/**  
**M6.4 library marker:** mellon-m6.4-curated-12-v1  
**Star sprite generation settings:** 26×26 original RGB photo-derived RGBA, gain **7.20**, expansion **2.12×**. M7.1 duplicates this original colored sprite for its glow, no new search/rebuild.

| # | Background | Exact scene ID | Constellation | Source stars |
|---:|---|---|---|---:|
| 1 | Blue Gold | blue-gold-nebula/02-Leo | Leo | 9 |
| 2 | Blue Gold | blue-gold-nebula/07-Crt | Crater | 9 |
| 3 | Chromatic | chromatic-nebula/01-Leo | Leo | 9 |
| 4 | Cosmic Wings | cosmic-wings/01-Leo | Leo | 9 |
| 5 | Cosmic Wings | cosmic-wings/03-Vir | Virgo | 13 |
| 6 | Cosmic Wings | cosmic-wings/05-Cep | Cepheus | 10 |
| 7 | Dust Cloud | dust-cloud/03-Crt | Crater | 9 |
| 8 | Dust Cloud | dust-cloud/08-And | Andromeda | **17** |
| 9 | Rosy Rosette | rosy-rosette/04-Cyg | Cygnus | 9 |
| 10 | Rosy Rosette | rosy-rosette/06-Sco | Scorpius | **14** |
| 11 | Veiled Ring | veiled-ring/03-Gem | Gemini | 12 |
| 12 | Veiled Ring | veiled-ring/08-Peg | Pegasus | **14** |

No Cassiopeia or UMa/Big Dipper (<8 stars). All scene IDs correspond to actual verified v9 star IDs and original graph edges.

The runtime source pack/library JSON contains scene id, background slug, name/code, 1920×1080 dims, photo SHA256, actual source IDs, normalized vertex coordinates, graph edges, paths to 26px RGBA sprites, brightness and provenance. No need to revisit scene geometry in M8.

**Random-on-lock** is the default: all 12 scene IDs eligible; avoid immediate repeat within current extension lifecycle, not across guest reboots. Optional fixed scene mode for QA.

# F. CURRENT M7.1 SOURCE ARCHITECTURE

```text
Mellon/
├── README.md                         # older legacy root README; NOT latest lockscreen behavior
├── docs/handover/
│   ├── MELLON_FULL_HANDOVER_2026-11-09.md   # deep early history (64KB)
│   └── MELLON_MASTER_HANDOVER_2026-11-11_M7.1_TO_M8.md
├── lab/
│   ├── gnome50-m1/ ... gnome50-m5/  # previous experiments; keep
│   ├── gnome50-m6/                  # tested M6.4 source + scene pack builder
│   │   ├── pilot-selection.json
│   │   ├── build-pilot-pack.py
│   │   ├── verify-pilot-pack.py
│   │   ├── select-scene-in-guest.sh
│   │   └── audit-orion-checkpoints.py
│   └── gnome50-m7/                  # CURRENT M7.1
│       ├── extension.js            # GNOME actor lifecycle / scene renderer / native auth bridge
│       ├── stellar-effects.js      # PURE visual state machine and envelopes
│       ├── scene-data.js           # pure scene validation, pick and star mask randomization
│       ├── failure-tracker.js      # native read-only verifier observer
│       ├── stylesheet.css          # SHOW LOGIN and centered red warning
│       ├── metadata.json           # mellon-lab@local, session-mode unlock-dialog
│       ├── deploy-from-blackpearl.sh
│       ├── rollback-last-guest-install.sh
│       ├── test-stellar-effects.mjs
│       ├── test-m7-regression.mjs
│       └── README.md
├── assets/starfield/corpus-v1/      # real source photos/catalogs
├── tools/constellations/quality-v9/ # Go matcher, saved validation and QA
└── .github/workflows/
    ├── mellon-m6-checks.yml
    └── mellon-m7-checks.yml
```

### Runtime scene lifecycle

1. Only in GNOME mode **unlock-dialog**, M7.1 loads verified library + scene-config from its guest-local installed extension directory.
2. Picks one scene (random-on-lock normally), creates background St.Widget CSS cover, St.DrawingArea Cairo connector canvas, original-color star sprite St.Widgets and additional source-colored halo sprite St.Widgets, SHOW LOGIN St.Button at top-left, and centered red warning St.Label.
3. Background + drawing canvas are bound to native dialog dimensions using Clutter.BindConstraint. Coordinates use a cover/center transform consistent with 1920×1080 source image.
4. Native password text's **buffer length changed** notification (notify::length) supplies only count. Target number of lit source stars:
   **target = min(N, ceil(N × min(length,8) / 8))** (and zero for length zero), N=source vertex count. This is visual progression only, not a password verification.
5. Pure **updateActiveStars** randomly switches appropriate number of distinct unlit/on indices; unchanged target causes no reshuffle.
6. Pure **StellarEffects.transition** records new ignitions, new lit-lit edge pulses, and full-map completion. No GNOME auth success state is involved.
7. GJS timer about every **62ms (~16fps)** while fade/flare/wave/warning is changing. Frame source stops when idle. Persistent completion bloom is static St.Widget opacity/scale and completed Cairo line rendering, not a spinning loop.
8. St.Widget sprites keep original photo colors; Cairo renders only existing topology connections where **both active**; pulse canceled when endpoint goes dark.
9. Private read-only ShellUserVerifier._failCounter polled every ~**250ms** via FailureTracker. Each detected wrong password triggers bold central flashing warning and clears visual effect state.
10. Manual SHOW LOGIN hides all Mellon visual actors and lets the original GNOME password prompt show and focus; auth stays GNOME-native.

### M7.1 tested visual constants

- IGNITION_SEC = **0.72**
- PULSE_SEC = **0.70**
- COMPLETION_SEC = **1.60**
- Star core scale = 1 + **0.75×ignition** + **0.48×completion wave** + **0.18×persistent**.
- Halo scale = 1.35 + **1.30×ignition** + **1.15×completion wave** + **0.30×persistent**.
- Halo opacity/strength = min(0.98, 0.98×ignition + 1.05×wave + 0.65×persistent).
- Completed core remains 1.18×; completed line remains bright/thicker plus glow; no idle animation.
- Native GNOME observer and manual recovery were kept unchanged; M7.1 source-level test guards this.
- **M7 completion must not be labeled a valid login.**

### Current source-level tests

- `node lab/gnome50-m7/test-stellar-effects.mjs`: ignition, directional edge pulses, cancellation, completion wave, static bright latch after animation, Backspace/failure reset, 8–24 vertex sizes.
- `node lab/gnome50-m7/test-m7-regression.mjs`: preserved GNOME native auth integration, SHOW LOGIN, no raw key listener/white dot, halo cleanup.
- `node lab/gnome50-m6/test-scene-data.mjs`: twelve scene IDs, 8+ star rule, random reveal/removal and connections.
- `node lab/gnome50-m5/test-failure-tracker.mjs`: native failure observer.
- GitHub Action: `.github/workflows/mellon-m7-checks.yml`, last confirmed **SUCCESS** on commit 83c5276 via run **43040908421**.

### Current accepted VM deployment

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-m7/deploy-from-blackpearl.sh
)
```

The M7 deploy script checks VM identity, test1 user, GNOME 50.1 and baseline, validates local M6.4 12-scene pack, compares guest library.json hash to local pack, preserves fixed/random selection mode, uploads into a checksummed **guest-only** staging directory, backs up previous guest extension inside ~/.local/state/mellon/backups/pre-m7-<timestamp>, atomically installs guest's mellon-lab@local extension, **does not reboot**.

Guest-only reboot:

```bash
(
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

Guest rollback to latest pre-m7 backup:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m7/rollback-last-guest-install.sh
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

**Important nuance:** “latest pre-m7 backup” may represent a prior M7 subversion, not necessarily the M6.4 fallback if multiple deploys occurred; inspect desired guest backup metadata before assuming its precise version. Replaced M7 directory is preserved as replaced-m7-<timestamp>.

Fix a specific QA scene for next lock:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m6/select-scene-in-guest.sh dust-cloud/08-And
)
```

Restore random selection:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    bash lab/gnome50-m6/select-scene-in-guest.sh random-on-lock
)
```

# G. TESTED VS NOT TESTED

**User has confirmed:** M6.4 complete 12-scene version works. M7.1 visually “much better” than M7.0 after stronger ignition/completion/static glow. Previous M5–M7 normal unlock, failed-password alert and SHOW LOGIN workflows have been tested iteratively in VM.

**Automated verified:** M7.1 CI green, static star completion latch in pure tests, source-level authentication invariants unchanged, pack/geometry/selection validation.

**Unverified / do NOT claim otherwise:** full 100s-cycle lock/unlock stress suite; all GNOME Shell crash/fallback paths; long suspend/resume; accessibility/IME and screen reader behavior; multiple monitors and fractional scaling; exact CPU/GPU/battery measurements; host-install compatibility; emergency recovery practice on production. M8 code does not exist yet.

# H. AGREED NEXT MILESTONE: M8 OBSERVATORY HUD

Current user request before this handover: **“excellent. lets move to a new chat. create a detailed handover doc including everything we have done and everything left to do.”** This was immediately after approving the next roadmap below. The next chat should start implementation, not ask the user what the roadmap was.

**M8 design:** immersive spaceship observation-deck feel, extremely restrained edge instrumentation; center dedicated to nebula/constellation; cyan/violet/charcoal translucent palette matching BlackPearl aesthetic. Four corner regions, initially static scene-aware metadata and safe real clock, then dynamic mapping and one-time intro scanning.

### M8 architecture: separate presentation layer

```text
MELLON
├── Constellation engine (reuse M7.1 unchanged)
│   ├── real photo stars, random visual activation
│   ├── lit-lit connecting edges and directional pulses
│   ├── dramatic ignition / completion wave
│   └── persistent completed star+line glow
├── Observatory HUD (NEW M8)
│   ├── four small corner/edge panels
│   ├── actual selected constellation information
│   ├── visual-only 8-stage progress (M8.2)
│   ├── real time/date and neutral observatory info
│   └── one-shot introduction scan (M8.3)
└── Native GNOME integration (unchanged)
    ├── native GNOME auth/input focus
    ├── read-only failure tracking
    ├── centered UNAUTHORIZED ACCESS
    └── manual SHOW LOGIN / fail-open recovery
```

**IMPORTANT: create new `lab/gnome50-m8/` folder** from M7.1 working code rather than modifying the existing tested m7/ files. Add a separate pure HUD metadata/state module and separate GNOME actor composition. M8's HUD does NOT read the password buffer itself; it gets scene metadata and relevant visual-only activation state via narrow interface from the existing controller. Keep the password/FailureTracker observer where it already lives.

## M8.1 — NEXT IMMEDIATE WORK: Four-corner layout, initially static/scene-aware

1. **TOP LEFT:** MELLON / CELESTIAL OBSERVATORY identification and minimalist craft-designation panel. The SHOW LOGIN recovery button already lives at ~x26,y22. HUD branding must be below/right and MUST NOT cover any of its clickable region. Preserving a visible native-reveal fallback is higher priority than aesthetic symmetry.
2. **TOP RIGHT:** genuine selected constellation name (e.g. **SCORPIUS**), actual source star count **14**, and source-graph connection count **scene.edges.length**, plus a neutral mapping status (initially **STAR MAP READY**). Do not invent celestial coordinates, sensor numbers, or physically unverified astronomy claims.
3. **BOTTOM LEFT:** actual local date/time and safe neutral instrument/status label such as “OBSERVATORY ONLINE.” No leaked device identity, secrets, or fake spacecraft measurements. Keep any clock timer slow (e.g. once/minute) or reuse built-in clock updates; avoid 16fps updates for static text.
4. **BOTTOM RIGHT:** reserved minimal progress module/housing for M8.2's eight visual mapping segments. M8.1 can show a static placeholder but must NOT falsely indicate completion.
5. **CENTER:** preserve the nebula and large constellation, including all its source stars, lines, ignition and completion bloom. Centered red UNAUTHORIZED ACCESS must remain on top and fully legible.
6. Material: semi-transparent indigo/charcoal/cyan-violet hairline borders, clean professional typography, no big opaque cards, no toy-like clutter.
7. Responsive: test 1920×1080 and smaller/taller guest windows plus scaling. Corner widgets must not drift into the star-safe area or overlap each other or SHOW LOGIN. If display is too small, hide optional HUD ornamentation before obscuring auth recovery.
8. Input handling: instrument panels should be non-reactive and never consume clicks/keyboard focus; SHOW LOGIN continues to work. All HUD actors hidden/destroyed at same lifecycle as background and stars.
9. Separate renderer and tests; do not modify native verifier data flow, existing visual state machine or M7 light settings.

**Suggested implementation steps for the next assistant:**
A. Inspect current GitHub HEAD and `lab/gnome50-m7/extension.js`, the new handover, existing M7 VM deployment.  
B. Create **lab/gnome50-m8/** copying exact M7.1 dependencies (auth/tested source stays unchanged).  
C. Add observatory-hud.js with creation, layout, responsive constraints, styling and teardown; optional hud-state.js as pure scene metadata/view model.  
D. Bridge selected scene id/name/background/star and edge counts to HUD. No new password reads.  
E. Add synthetic layout/collision tests with top-left SHOW LOGIN area and center-clearance at various resolutions. Add new `.github/workflows/mellon-m8-checks.yml`.  
F. Add **guest-only installer/rollback** that reuse the existing curated-12-v1 pack, verify its SHA256 against current guest, preserve scene selection, back up M7.1 as pre-m8-*, install with checksum verification, and do NOT reboot automatically.  
G. Push directly to GitHub; wait for CI green; provide user one zsh-safe subshell to pull/deploy, guest reboot, and rollback.  
H. Collect visual feedback (screenshots if needed), polish M8.1 before M8.2.

## M8.2 — Dynamic eight-stage visual mapping

- Eight minimal segments represent visual map stages derived from existing activated mask / current visual completion (NOT password verification).
- Typing progressively illuminates segments; Backspace dims appropriate segments; fixed/random star reveal remains unchanged.
- Status text can read **AWAITING INPUT** / **MAPPING CONSTELLATION** / **CONSTELLATION MAPPED**.
- On full visual completion, retained HUD progress should match M7's persistent bright constellation, without claiming successful authentication.
- On wrong password, reset visual status consistently and let UNAUTHORIZED ACCESS take visual priority.
- Avoid showing raw password length or input timestamps/typing rate; no additional raw keyboard event processing.
- Prefer event-driven updates; no separate continuously running fast timer.

## M8.3 — One-time scanning animation / refinement

- Once when a lock begins, a faint scan line and panel fade-in with ~0.7–1.2s duration; NOT perpetual radar.
- Do not obscure SHOW LOGIN or the red failure warning; protect bright constellation.
- Cancel on native reveal/unlock, resolution change or extension teardown; avoid orphan source timers.
- Test contrast on six photos and at multiple aspect ratios, measure CPU/GPU/battery before further visual features.

# I. M9 — MYTHOLOGICAL CONSTELLATION FIGURES (UNIMPLEMENTED)

Desired eventual immersive reveal: constellation geometry gradually transforms into a mythological silhouette, e.g., **Scorpius as a scorpion**, **Pegasus as winged horse**, **Orion as hunter with bow**.

**Strict principle:** rendered art must be anchored to the ACTUAL constellation selected source-star geometry, scale and orientation; never arbitrary pasted full-screen illustration. Keep individual source stars visible, honor ~14% inset/outer 5% margin and future 9% art allowance. High-quality restrained engraved/celestial hologram style. Implement structured editable SVG paths/groups with an explicit anchor transform and visibility/crop verification. Start with **one** truly convincing candidate, get user visual approval, then build more.

Existing offline art experiments (NOT GNOME runtime):
- **assets/constellation-art/orion/orion-figure.svg** and associated anatomical-anchors/stroke-sequence JSON.
- **tools/constellations/render_orion_v7.py** and **verify_orion_v7.py**.
- **tools/constellations/ORION_ARTWORK_V7.md**.
Those were created for an early **9-star Orion concept**. Not automatically compatible with current library or new 18-star bow.

### Pending Orion with 18-star bow

18-vertex curved-bow Orion template exists in `tools/constellations/templates-v4-orion-bow.json`, but did not make top-eight selections in v9 and is NOT in current 12 scene pack. Per-template checkpoints may contain suitable candidates that were ranked below other figures.

Read-only audit (verify tool compatibility with local saved JSON):
```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    python3 lab/gnome50-m6/audit-orion-checkpoints.py
)
```

Require full 1920×1080 visual review and user approval before adding Orion; **no expensive re-search unless really needed**.

Optional later feature: constellation rarity weighting/discovery. It was floated and received interest as a concept, but not implemented or numerically specified.

# J. M10 — PRODUCTION HARDENING BEFORE HOST

**Not started. Hard blocker for any BlackPearl host install.**

Test and document:
- Hundreds of lock/unlock cycles including successful/failed attempts and manual SHOW LOGIN after failures.
- Broken/missing JSON, missing photo/sprite, wrong file permissions, asset hash mismatches, exception during actor creation, private verifier API missing, GNOME extension reload and corrupted scene configuration.
- Suspend/resume after long sleeps; screen power off/on, session restart, GNOME crashes, display manager restart and guest reboot.
- Multi-monitor, mixed-DPI, 1920×1080, non-16:9, fractional scaling, monitor rotation and hotplug.
- Accessibility, screen readers, alternate keyboard layouts and IMEs; native focus and tab order.
- CPU/RAM/GPU/battery profiling at idle, during rapid typing and repeated completion; no orphan GLib timers/actor leaks.
- SECURITY: strictly read-only verifier observation and no password input capture; no false auth success prompts.
- Emergency disable via TTY/SSH, verified reinstall rollback without login being blocked, recovery from broken GNOME private API after an update.
- Revisit packaging, licensing and attribution for six user-supplied Unsplash photos and possible mythological artwork.
- Document supported GNOME Shell versions / fail-safe compatibility checks and deployment approvals.
- **Only with an explicit later user instruction** consider installing on BlackPearl's actual lock screen.

# K. WHAT IS ALREADY APPROVED / STILL OPEN

**Approved in guest:**
- Source-photo fidelity, at least eight stars per constellation, large centered geometry.
- Random add/remove star selection and only-lit-lit edges.
- M6.4 full twelve-scene library with random-on-lock.
- M7.1 dramatic ignition/completion and bright-static after wave.
- Native GNOME retry, centered warning, manual SHOW LOGIN (worked during prior validation).
- Progression uses max eight visual stages even for 17-star figures.

**Pending or unverified:**
- M8 all components (start with M8.1).
- M9 graphical mythological figures.
- 18-star Orion saved checkpoint visual approval, rarity design.
- M10 production safety/performance and host approval.
- No detailed long-run benchmarks, crash recovery matrix or full accessibility checks yet.
- Root README still describes legacy behavior; eventually update it to point to current lab milestone/docs.

# L. NEXT-CHAT START INSTRUCTION

**The next assistant should immediately:**
1. Read this handover and old November 9 historical handover (for deep old benchmark context if needed).
2. Inspect GitHub `ap0calypse644/Mellon` current HEAD; verify `lab/gnome50-m7/` source and M7.1 commit; read current actor stack/SHOW LOGIN positioning.
3. Develop new **`lab/gnome50-m8/`** independent of the working M7.1 code, implementing a restrained, scene-aware four-corner **M8.1 Observatory HUD**, ensuring SHOW LOGIN and the center are unobstructed.
4. Keep the existing photographic corpus, curated 12 library, random-star/Backspace mapping, brightly glowing completed state, and native GNOME auth unchanged.
5. Add tests for HUD state, layout collisions, layering, teardown and scene metadata; add CI; push working source directly to GitHub.
6. Create guest-only deployment/rollback with checksummed staging and a backup of current M7.1.
7. Give the user safe subshell-wrapped BlackPearl commands to pull, install to **mellon-gnome50-lab**, reboot ONLY guest, test, and roll back.
8. Solicit visual refinement feedback, and only then proceed to M8.2 and M8.3.

**ABSOLUTE RULE:** M8 is a visual HUD project. It does not justify intercepting keys, changing GNOME authentication, rerunning 558 million constellation attempts or touching BlackPearl's actual lock screen.

---

_This file is an engineering handover, not a claim that M8 or host integration is complete. The authoritative source is the repo's latest GNOME VM milestone and the user's actual VM test feedback._