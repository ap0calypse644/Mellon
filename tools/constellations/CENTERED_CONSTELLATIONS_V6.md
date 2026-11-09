# Mellon v6 — centered constellations with character-art clearance

This is an **offline** matcher. It never modifies GNOME, the Mellon VM, the user's lock screen, the image's existing stars, or the security/authentication flow.

## Goal

Find many large, recognizable constellations near the center of the screen, while leaving enough blank space **around the entire constellation** to later draw a figure (e.g., an illustrated Orion) during an unlock animation. Only one constellation is displayed at a time, so overlap between different candidate matches is allowed.

## Two nested regions (default)

On the image's 1920 × 1080 coordinate plane:

- **Outer 5% frame margin** (`--frame-margin 0.05`): never used even by later artwork.
- **Additional 9% for character illustration** (`--figure-room-x 0.09`, `--figure-room-y 0.09`): reserved around each matched star bounding box.
- **Inner star-safe area**: the constellation vertices must be within **14% and 86%** of the width and height. This constraint is applied to the **actual matched stars**, not just the template projections.
- **Center tolerance** (`--center-tolerance-x 0.13`, `--center-tolerance-y 0.13`): the center of the star bounding box must be within ±13% of the screen center along either axis. The bounding-box center is measured, not the template origin.

These are configurable independently. They ensure an **axis-aligned artwork envelope** surrounding the constellation remains within the outer frame. They do *not* prove a particular Orion illustration fits: the future figure's SVG/animation will need its own geometry, transformations, and containment validation.

Large patterns are still preferred, with `--min-span 0.55` requiring at least 55% span along one image dimension. For the default 14% inset, the theoretical maximum single-axis span is 72%.

### QA image guides

- **Cyan rectangle**: the inner star-safe bounds.
- **Amber rectangle**: the selected constellation's bounding box expanded by the reserved character-art allowance.
- **Small amber cross**: actual selected constellation center.
- **Cyan connected stars**: existing detected image points, never invented points.

These guides appear in *offline QA images only*, not in the lock screen.

## Run full six-image / 31-template search from BlackPearl

```bash
(
    set -euo pipefail

    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main

    PYTHON="$HOME/.local/share/mellon-constellations-venv/bin/python"
    OUTPUT="$HOME/VMs/Mellon/constellation-benchmark-v6-centered"

    "$PYTHON" tools/constellations/match_centered_constellations_v6.py \
        --catalog all \
        --attempts 100000 \
        --refinements 1200 \
        --limit 0 \
        --min-span 0.55 \
        --frame-margin 0.05 \
        --figure-room-x 0.09 \
        --figure-room-y 0.09 \
        --center-tolerance-x 0.13 \
        --center-tolerance-y 0.13 \
        --rotation-limit-deg 35 \
        --qa-per-template 3 \
        --output "$OUTPUT"

    "$PYTHON" tools/constellations/verify_centered_matches_v6.py \
        --report "$OUTPUT/matches-v6.json"

    xdg-open "$OUTPUT"
)
```

Run on a smaller subset by adding `--only Ori Sco Cyg`. Use `--qa-per-template 8` to draw additional standalone previews per constellation. Output `matches-v6.json` is unlimited by default (`--limit 0`), subject to the finite placement search budget.

## New output metadata

Each match includes:

- `coverage.bbox_px`: original star bounding rectangle;
- `center_offset_fraction`: its displacement from screen center;
- `figure_room_px`: reserved width and height (per side);
- `figure_envelope_bbox_px`: the star bounding rectangle expanded by those allowances;
- `rms_error_px`, `max_error_px`, normalized `vertices`, original `star_ids` and original template `edges`.

There is no brightness weighting, no cross-constellation overlap rejection, and no fabricated or moved star positions.

## Validation

On a **small, locally executed two-image / three-template test**, with 5,000 attempts and 150 refinements per constellation-image combination, the matcher found **461** qualifying placements. A separate validation script checked every returned source star ID and normalized coordinate against the catalogue, that each image-point bbox remained within the inner region, and that the reserved illustration envelope stayed within the outer frame; all **461 passed**.

The test's largest single-axis span was approximately **71.7%** and its median was **65.3%**. These are smoke-test figures, not results for the full 31-template search.

The source code and local smoke-test script were syntax-checked. The original v5 matcher and v4 composition engine are preserved unchanged.

## Future GNOME integration

Do not replace GNOME authentication. A success-only illustrated unlock transition will need separate lifecycle analysis: GNOME Shell may destroy the native unlock dialog immediately when authentication succeeds, so a guaranteed multi-second character reveal *before* unlock is **not implemented or promised** by this offline matching milestone.
