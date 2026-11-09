# Mellon constellation matcher v2 — brute-force multi-instance atlas

This is an **offline** matcher. Do not run it in GNOME Shell or the Mellon VM.

The old `match_constellations.py` and `templates.json` are preserved as v1.
Use `match_constellations_v2.py` and `templates-v2.json` for the new search.

## What's different

- **Multiple matches** of the *same* constellation per image. Twelve spatially
  distinct placements per shape by default, rather than just one.
- **All detected luminous features** (`stars-all.json`) instead of the ~700
  brightest/most widely spaced curated features. No brightness/prominence term
  in the cost function. Faint points are as eligible as bright points.
- **20,000 candidate placements** per image/template (editable with
  `--attempts`). KD-tree proximity queries are batched for performance.
- Each promising placement is refined through unique source-star assignment
  (Hungarian algorithm) and repeated similarity fitting (translation, rotation
  and UNIFORM scale). No per-vertex warping, stretching, mirroring or invented
  overlay points.
- Sorts proposals by **final** rigid-fit RMS error; spatial non-maximum
  suppression keeps different locations, suppressing copies of the same
  source-star cluster.
- **Orion is fixed**: nine iconic stars (head, shoulders, three-star belt,
  sword and legs). Its bow and club have been removed. All template edge
  topology is explicitly preserved.
- Default orientation is within 65 degrees of the reference to make the
  shapes visually recognizable. Set `--rotation-limit-deg 180` for arbitrary
  rotation.
- Produces `matches-v2.json`, one overview per background, and
  `qa/<constellation>-top.jpg` comparison sheets with the reference template
  alongside three independent placements.

Star coordinates are mapped from the *original* source detections through the
recorded 90-degree rotation, crop, and 1920×1080 resize. The numerical mapping
was checked against the image's curated star coordinates (within 0.01px).
Dimming does not affect alignment.

## BlackPearl command

From the Mellon repo:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main

    VENV="$HOME/.local/share/mellon-constellations-venv"
    if [[ ! -x "$VENV/bin/python" ]]; then
        python3 -m venv "$VENV"
        "$VENV/bin/python" -m pip install numpy scipy pillow
    fi

    "$VENV/bin/python" tools/constellations/match_constellations_v2.py \
        --corpus assets/starfield/corpus-v1/catalogs \
        --output "$HOME/VMs/Mellon/constellation-benchmark-v2" \
        --attempts 20000 \
        --instances 12

    xdg-open "$HOME/VMs/Mellon/constellation-benchmark-v2"
)
```

For a more aggressive search:

```bash
(
    cd "$HOME/go/src/ap0calypse644/Mellon" &&
    "$HOME/.local/share/mellon-constellations-venv/bin/python" \
        tools/constellations/match_constellations_v2.py \
        --output "$HOME/VMs/Mellon/constellation-benchmark-v2-heavy" \
        --attempts 80000 --instances 20
)
```

The search is repeatable: set `--seed` to change the random proposal sequence.
Other useful options: `--catalog curated` for the old input set,
`--min-separation-px`, `--threshold-px`, and `--max-vertex-error-px`.

## Benchmark on the six supplied images

Run on the 6 × 1920×1080 backgrounds using `--catalog all`,
`--attempts 20000`, `--instances 12`, seed `20261109`.
All **360 requested slots** were populated (6 backgrounds × 5 templates ×
12 matches). Each constellation vertex is mapped to a distinct star ID.

| Image | Available detected features in crop | Orion best RMS | Cassiopeia best RMS | Ursa Major best RMS | Cygnus best RMS | Scorpius best RMS |
|---|---:|---:|---:|---:|---:|---:|
| blue-gold-nebula | 6,572 | 2.66 px | 1.29 px | 2.08 px | 2.13 px | 3.66 px |
| chromatic-nebula | 7,350 | 2.51 px | 1.08 px | 1.88 px | 2.40 px | 2.94 px |
| cosmic-wings | 9,226 | 2.05 px | 0.88 px | 1.70 px | 2.21 px | 3.11 px |
| dust-cloud | 10,332 | 1.72 px | 1.05 px | 1.71 px | 2.11 px | 2.70 px |
| rosy-rosette | 7,867 | 2.31 px | 1.32 px | 1.63 px | 2.50 px | 3.02 px |
| veiled-ring | 14,692 | 1.77 px | 1.03 px | 0.78 px | 1.75 px | 2.30 px |

This is a *geometric* measure, not a verified astronomical-identification
metric: input detections can include false-positive luminous image features.
Low RMS alone does not guarantee aesthetic quality. The side-by-side QA
sheets are required before promoting any match to the live lock screen.

## Source and licensing

The template reference positions/topologies come from d3-celestial, Olaf
Frohn (BSD-3-Clause); full attribution and license are preserved in the
parent directory README. The `Ori` template uses a 9-star subset of real
astronomical star positions including Iota Orionis (the sword). Other
templates are retained from v1.

No source images are altered, and no GNOME extension or host settings are
modified by this pipeline.
