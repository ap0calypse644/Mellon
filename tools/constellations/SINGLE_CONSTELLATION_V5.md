# Mellon v5 — large, single-constellation search

## Corrected product requirement

A Mellon lock screen will display **exactly one constellation at a time**.
Different candidate constellations can overlap; this is irrelevant to their
quality and must not reduce the number of matches we retain.

The system should favor **large, recognizable, image-aligned constellations**
that span a substantial portion of the display. Brightness is **not** a
selection criterion: all extracted star candidates are eligible.

**v4's multi-constellation scene composition is preserved for experiments, but
it is not the production selection algorithm.**

## How v5 differs from v3

| Behavior | v3 | v5 |
|---|---|---|
| Search scale | Fixed 270–620 px | Screen-aware, often much larger |
| Position sampling | Fixed central rectangle | All placements that fit with margin |
| Candidate selection | Primarily geometric RMS | Coverage first, after passing geometric thresholds |
| Candidate overlap | Spatial exclusion | **Allowed** |
| Max number of matches | `--instances` cap | `--limit 0`: no fixed output cap |
| QA presentation | Multiple shapes together | **One constellation per preview image** |
| Star brightness | Ignored | Still ignored |
| Star positions | Detected image coordinates | Still exact detected image coordinates |

The search dynamically computes the largest allowable scale for each sampled
rotation, respecting the image boundaries. It preferentially samples large
scales; promising placements undergo a one-to-one nearest-star assignment and
rigid similarity refinement. The output ranking rewards the fraction of the
screen spanned, plus the fraction of the screen area covered, with a small
penalty for residual geometric error and for extreme orientations.

It never stretches individual vertices or invents stars. A 'large' candidate
still has to satisfy the matching thresholds. Geometric RMS is **not** proof
that every image detection corresponds to a genuine astronomical star.

Near-identical placements (same center, scale, orientation within tolerances)
are suppressed so the output does not contain repeated copies of one match.
**Overlap between separate placements/templates is allowed.**

### Why there is still a CPU limit

`--limit 0` means *retain every distinct qualifying match evaluated in the
search*, not infinitely many mathematically possible arrangements.
`--attempts` controls the randomized placement budget; `--refinements`
controls how many promising placements receive the expensive assignment and
Procrustes refinement. Increase both to explore more of the search space.

### Orientation

The default is `--rotation-limit-deg 35`, to favor recognizable, fairly
upright figures. Set `--rotation-limit-deg 180` to allow all orientations.
A sideways Orion can be mathematically accurate but less recognizable.

## Run from BlackPearl (offline, NO VM)

```bash
(
    set -euo pipefail

    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main

    PYTHON="$HOME/.local/share/mellon-constellations-venv/bin/python"
    OUTPUT="$HOME/VMs/Mellon/constellation-benchmark-v5-large"

    "$PYTHON" tools/constellations/match_large_constellations_v5.py \
        --corpus assets/starfield/corpus-v1/catalogs \
        --catalog all \
        --attempts 100000 \
        --refinements 1200 \
        --limit 0 \
        --min-span 0.55 \
        --rotation-limit-deg 35 \
        --qa-per-template 3 \
        --output "$OUTPUT"

    xdg-open "$OUTPUT"
)
```

### Output

- `matches-v5.json` — all unique qualifying matches, grouped by image and
  constellation, including exact source star IDs, normalized coordinates,
  template connections, geometric errors, rotation and coverage metrics.
- `<background>/qa/<constellation>/match-001.jpg`, `match-002.jpg`,
  `match-003.jpg` — one constellation overlay per image. These are
  **diagnostic images**, not final lock-screen rendering.
- To render more previews per type use `--qa-per-template 10`. This does not
  change how many matches are stored in JSON.
- `--only Ori Sco Gem` narrows a local test; `--min-stars 9` selects only
  templates with nine or more vertices (all templates by default).

If you want a longer or more aggressive batch, increase both
`--attempts` and `--refinements`; for example
`--attempts 200000 --refinements 2500`. This is CPU-intensive.

## Validation performed before commit

With six backgrounds and three templates (Orion, Cygnus, Scorpius), an initial
5,000-attempt/150-refinement test found multiple independent large matches on
every background. With the full-rotation run, Orion and Cygnus achieved ~91–95%
maximum single-axis span in the best ranked examples. Restricting the
orientation to 65 degrees still produced matches spanning roughly 90–95% of
one screen dimension. The 890 retained candidates in that smoke test were
checked against their original detected-star IDs and normalized coordinates,
their RMS/maximum vertex errors and edge indices. No mismatches were found.

These are **smoke-test observations**, not proof that all 31 templates will
successfully fill every background. The full batch can be run using the
command above.

The older `match_constellations_v3.py` and
`compose_constellations_v4.py` remain unchanged.
