# Mellon v4 — Constellation Composition Engine

**Status:** Offline benchmark/QA; **not integrated into GNOME or Mellon lock screen**.

The v3 matcher finds many geometrically accurate placements, but rendering all 31
constellations produces an unreadable maze of lines. **v4 composes a small,
visually separated group of candidates per scene** from the existing
`matches-v3.json` without repeating star detection or constellation matching.

## Algorithm

1. Read v3 matches, preserve exact **source-image star IDs, normalized coordinates,
   and edges**. Validate basic integrity and reject poor geometry.
2. Score individual candidates by:
   - RMS and maximum point-to-template errors;
   - orientation (soft preference for the original constellation orientation);
   - reasonable rendered size and number of vertices.
   **No star-brightness weighting** is used.
3. Shortlist good, spatially diverse placements within each constellation.
4. Use randomized multi-start greedy packing over the entire pool to select
   multiple distinct constellations. Enforce spacing between their **whole
   bounding boxes**, not merely between their centres. Disallow shared stars
   and repeated constellation names *within a scene*.
5. Across scenes, penalize reusing placements **and** constellation names.
6. Produce JSON scenes plus readable image previews for human QA.

This is a **heuristic composition engine**, not a globally optimal
combinatorial solver. Bounding-box clearance is intentionally conservative;
some safe arrangements may be rejected. A low RMS does **not** guarantee that
the image detection is a genuine astronomical star, a scene is attractive, or
the constellation is recognizable.

## Full run on BlackPearl (no VM)

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main

    PYTHON="$HOME/.local/share/mellon-constellations-venv/bin/python"
    MATCHES="$HOME/VMs/Mellon/constellation-benchmark-v3-full/matches-v3.json"
    OUTPUT="$HOME/VMs/Mellon/constellation-compositions-v4"

    "$PYTHON" tools/constellations/compose_constellations_v4.py \
        --matches "$MATCHES" \
        --corpus assets/starfield/corpus-v1/catalogs \
        --output "$OUTPUT" \
        --scenes 6 \
        --target 3 \
        --trials 600 \
        --min-stars 9 \
        --spacing 48

    xdg-open "$OUTPUT/overview-first-scenes.jpg"
)
```

This reads the **existing v3 benchmark**, not the 18.6-million-attempt
matching algorithm. It requires only Pillow (already installed in the
constellation virtual environment).

## Outputs

- `compositions-v4.json`: image -> scenes -> constellation templates,
  v3 candidate indices, original star IDs, vertices, edges and fit scores.
- `<image>/scene-01.jpg` through `scene-06.jpg`: separate scenes for QA.
- `overview-first-scenes.jpg`: first scene from each of the six backgrounds.

No generated images/JSON are automatically committed to the repository.
Review them before deciding which scenes belong in the lock screen.

## Configuration

- `--scenes 6`: aim for six different arrangements per image.
- `--target 3`: maximum constellation figures shown together.
- `--trials 600`: independent randomized packing searches *per scene*;
  increasing it spends more CPU seeking good, separated compositions.
- `--min-stars 9`: exclude short reference shapes (Cassiopeia / Big Dipper).
- `--spacing 48`: bounding boxes must have at least 48 pixels between them.
- `--pool-per-template 15`: keep up to 15 candidate instances per shape.
- `--max-rms 7`, `--max-vertex 18`: candidate-fit rejection thresholds.
- `--protect-center`: reserve a central region for GNOME's **visible**
  native password/clock interface during VM tests. The final design intends
  to hide *visuals* while retaining GNOME authentication.
- `--no-labels`: render clean scene previews without template name tags.
- `--seed`: deterministic selection (default `20261109`).

Star brightness does not affect candidate selection. Rotation preferences are
soft, so a rotated configuration can still be chosen when composition warrants
it. The underlying constellations are recognizable **templates**, not actual
astronomical sky reconstructions from these astrophotography images.

## Validation and test run

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    "$HOME/.local/share/mellon-constellations-venv/bin/python" \
        tools/constellations/test_compose_v4.py
)
```

A local test using the uploaded v3 full benchmark found **36 scenes across
six images**, with **three separated constellations in each** and **18
different template names used per image across its six scenes**. All 108
placements were structurally validated; their 1,346 star references were
confirmed present in the six original `stars-all.json` catalogues. These
figures describe *this test run*, not guaranteed results for every future
dataset or set of parameters.

**No VM work or host GNOME configuration changes were performed.**
