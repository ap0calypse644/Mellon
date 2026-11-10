# Mellon v9 — concurrent, quality-first real-star constellation search

**Status:** Go source, deterministic synthetic tests, independent saved-database
verification, and a BlackPearl-only rebuild runner. The assistant has **not run
the actual constellation search**. M5.4 and its existing Orion lock scene are
untouched. This tool produces candidate scenes for later manual review and M6.

## Goals and limits

We have six independent astronomy-themed **photographs**, each with thousands
of existing detected luminous points. The real astronomy-inspired constellation
line patterns (31 in total, including the 18-point Orion with its curved bow)
are schematics. The algorithm geometrically matches schematic figures to
**actual pre-existing luminous coordinates within each photograph**. This is
**not** an astrometric claim that those photographed features physically
belong to those constellations.

The old v6/v8 matcher emphasized candidate count. **v9 emphasizes quality**:

- Default CLI: **500,000** random placement attempts × 31 patterns × 6
  images = **93 million** tested rigid-placement proposals.
- Recommended full runner: **1,000,000** attempts × 31 × 6 =
  **186 million** proposals; up to 4,000 expensive unique-star/rigid-fit
  refinements per combination. These are sampled transformations followed by
  combinatorial star assignments, **not** literal exhaustive enumeration of
  every subset of 5,000–15,000 source stars (which is intractable).
- Several **concurrent Go workers** (runner defaults to eight), with
  independent deterministic seeds per background/template. Changing
  `--workers` does not affect candidate assignments.
- Keep just the **five best spatially distinct** results per template in
  resumable checkpoints, then select the **best eight distinct
  constellations** per background for the actual database. If fewer pass
  the original hard limits, save fewer rather than inventing a fit.

The input star-catalog JSON and original JPEG backgrounds are read-only and
are checked by SHA256; all generated files go under your home directory.

### Brighter stars, but still strict geometry

The same detected-star brightness model introduced in v8:

```text
per-star score = 0.75 × percentile(pixel brightness)
               + 0.25 × percentile(local DoG prominence)
```

V9 applies a stronger preference and explicitly penalizes constellations
that contain several faint points:

```text
constellation brightness =
    0.45 × average star score
  + 0.35 × 25th-percentile star score
  + 0.20 × dimmest star score

overall rank = original v6 size/geometry/center/orientation merit
             + 0.34 × constellation brightness
```

The old v8 rank bonus default was only **0.08**. The new **0.34** default
makes visual brightness a much more important preference without bypassing
any acceptance rules.

Candidate generation checks up to **4 nearby real source features** per
projected vertex; exact brightness-biased Hungarian star assignment
considers **8 nearby features** for each template vertex. Assignment is
one-to-one (no duplicated image stars in the same constellation).
All source points remain at their original measured coordinates.

**Hard limits are unchanged from v6/v8:**

| Setting | Default |
|---|---:|
| Max RMS of projected geometry | 13 px |
| Max individual vertex error | 24 px |
| Actual star-safe inset | 14% from each edge |
| Outer screen margin | 5% |
| Extra room around constellation for future art | 9% per side |
| Bbox center offset | ±13% screen width/height |
| Minimum span on either dimension | 55% |
| Initial rotation sample | ±35° |
| One-to-one source-star mapping | Required |
| Faked/shifted source points | Forbidden |

If the algorithm cannot find eight good different constellations for a
particular background, it will retain fewer and report that honestly.

## QA preview rendering: source star pixels, not fake circles

Each preview starts from an **unchanged, original-color JPEG background**
(`background-dim-16x9.jpg`), decoded to a fresh in-memory image.
The only changes in the output PNG are:

1. A **thin, roughly one-pixel, antialiased** connector between the exact
   selected star pixels, with restrained cyan opacity.
2. Gentle local enlargement and brightening of the **original selected star
   light profile**: bilinear sampling of the star's own photographed pixels,
   subtraction of local background measured around that source feature,
   bounded shared RGB gain, and feathering. The renderer does **not draw new
   circular markers, artificial stars, white dots, labels, or stylized
   flares**. A tiny blue point stays blue; a red point stays red.
3. The output is a **lossless PNG** so tiny source-pixel changes and their
   colors aren't obscured by JPEG re-encoding.

The original photo is never modified. The preview JSON index records actual
source star IDs and brightness values for independent inspection.

## One-command full rebuild on BlackPearl

**Only run locally on BlackPearl; no need to boot the Mellon VM.**

```bash
(
    set -euo pipefail

    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main

    bash tools/constellations/rebuild_quality_v9.sh
)
```

The script checks your local Go toolchain, runs **synthetic-only Go tests**,
compiles the Go matcher under `~/.local/bin`, performs the full 186-million-
proposal search with an eight-worker pool, independently verifies the saved
database and validates the PNG dimensions.

**The script is intended to do serious compute work.** The exact runtime
depends on CPU, cache behavior, detected feature density and number of
successful Hungarian refinements. There is no artificial wall-clock cutoff.

Change concurrency without editing source:

```bash
(
    cd "$HOME/go/src/ap0calypse644/Mellon"
    MELLON_QUALITY_WORKERS=12 bash tools/constellations/rebuild_quality_v9.sh
)
```

For even more brute force, pass flags after the runner filename:

```bash
(
    cd "$HOME/go/src/ap0calypse644/Mellon"
    MELLON_QUALITY_WORKERS=10 bash tools/constellations/rebuild_quality_v9.sh \
        --attempts 3000000 --refine 7000
)
```

That requests **558 million sampled placements** across all 186
background/template combinations. Additional search does not relax fit,
centering or artwork margins.

To search just Orion's new 18-star bow for diagnosis:

```bash
(
    cd "$HOME/go/src/ap0calypse644/Mellon"
    MELLON_QUALITY_OUTPUT="$HOME/VMs/Mellon/quality-v9-orion-only" \
        bash tools/constellations/rebuild_quality_v9.sh \
            --only Ori --per-background 1
)
```

The command's output directory defaults to
`~/VMs/Mellon/constellation-quality-v9`, controlled by the environment
variable `MELLON_QUALITY_OUTPUT`. A different `--only`, search budget or
ranking preference causes incompatible checkpoints to be **recomputed**
with a new search signature.

### Resume and verification

The matcher atomically saves each successful background/template job to
`checkpoints/<background>/<template>.json`. If interrupted or the host
reboots, **rerun the identical command**: completed jobs with matching input
SHA256s, templates and search settings are validated and reused. No
`--resume` flag is necessary. Use `--force` only when you intentionally
want to recompute every selected job.

Run **validation alone** without another search using the compiled binary:

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

Validation independently recomputes the rigid-fit errors from the original
detected image coordinates, checks image and catalog hashes, verifies
brightness metadata, original topology and central safe bounds, and opens
every QA PNG to verify dimensions. It does **not** run any placements.

### Files produced

```text
~/VMs/Mellon/constellation-quality-v9/
├── matches-v9.json        # Final few high-quality, distinct candidates
├── qa-index.json          # Review order, star IDs and brightness metadata
├── qa/
│   ├── blue-gold-nebula/
│   │   ├── 01-Ori.png     # Actual selected photo pixels subtly amplified
│   │   └── ...           # Only chosen constellations have previews
│   └── ...
└── checkpoints/           # Per-image/per-template atomic resume state
    ├── blue-gold-nebula/
    │   ├── Ori.json
    │   └── ...
    └── ...
```

**Important:** A QA directory may contain old previews after a new run with
different settings; only paths listed in the current `qa-index.json` count
as current selections. The original star catalog is **not overwritten**:
this is a new constellation-match database built from its existing source
star IDs. All results still require human visual review before being added
to Mellon's runtime scene selector.

## Collision with old GitHub artifact extraction

The old `gh run download ... --dir "$OUTPUT"` failed because some
`match-001.jpg` files were already there; the CLI refuses to overwrite
them during ZIP extraction. Do **not** delete your old directory simply
to download those files. Use a brand-new directory instead:

```bash
(
    set -euo pipefail
    TARGET="$HOME/VMs/Mellon/orion-bow-review-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$TARGET"
    gh run download 42674929551 --name mellon-orion-bow-v8 --dir "$TARGET"
    echo "$TARGET"
)
```

That older artifact is optional; v9 reconstructs matches from the
original image catalogs directly. This version has **no dependency**
on the previous 1,156 Orion matches.

## Implementation and testing

All Go source lives in this directory (standard library only). The
pinned GitHub Actions workflow `quality-v9-go.yml` runs `gofmt`,
**toy/synthetic-only** `go test`, `go vet` and `go build`.
The CI workflow never invokes the real six-image matcher or generates
user-visible constellation results. It does not access GNOME or credentials.

This algorithm is a configurable quality-first heuristic, not a globally
optimal proof. More attempts improve exploration but don't guarantee
that every possible star assignment is evaluated.

**Security:** the run executes only from the trusted Mellon repo and
requires no downloaded binaries, PAM changes, Git hooks, tokens or
permissions beyond the existing source checkout. M5.4 on BlackPearl/VM
is never installed, updated or disabled by these commands.
