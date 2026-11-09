# Mellon constellation matcher v3 — expanded astronomical library

This remains an **offline** project: no VM, GNOME Shell, lock screen, passwords, or host system settings are modified.

## What changed from v2?

- **31 total constellation patterns**, up from five. 26 added, including a separately named *full 20-star Ursa Major* (`UMaF`) and the previous seven-star Big Dipper (`UMa`).
- **29 of 31 have at least nine template vertices**. Two deliberate exceptions: Cassiopeia (five-star W) and the Big Dipper (seven stars).
- New star groups include Andromeda, Aquarius, Auriga, Boötes, Canis Major, Capricornus, Carina, Centaurus, Cepheus, Cetus, Crater, Draco, Eridanus, Gemini, Hercules, Hydra, Leo, Lepus, Ophiuchus, Pegasus, Perseus, Pisces, Sagittarius, Taurus and Virgo.
- Every new template is derived from **d3-celestial** constellation line geometry, not invented connecting lines. The source geometry is stored in `reference/constellations.lines.json`, the generated normalized representation in `templates-v3.json`.
- Original **nine-point Orion core without bow/club** is retained. Earlier v2 examples remain reproducible using `templates-v2.json` and `match_constellations_v2.py`.
- The matcher continues to consider **ALL isolated luminous detections** from each image (`--catalog all`); it does **not** prefer bright stars. Images are not warped to make patterns fit.
- Added `--only`, `--min-stars`, `--list-templates` to `match_constellations_v3.py`.

## Explain the controls

`--attempts 20000`: sample **20,000** possible translation/rotation/uniform-scale placements **for each selected constellation, in each image**. It is the search budget, not the number of stars or saved results. The matcher vectorizes initial KD-tree screening, then performs slower unique assignments and similarity-fitting on the best-scoring proposals.

`--instances 12`: retain **up to 12 spatially different matches** per constellation per background. A placement must satisfy the geometric thresholds and de-duplication rules; the output may contain fewer.

`--min-stars 9`: exclude patterns with fewer than nine vertices (currently Cassiopeia and the Big Dipper). This does not restrict how many source-image stars the matcher can consider.

`--only Ori Gem Leo`: process only those named template IDs, in that order. This is useful for development and visual QA.

`--catalog all` is the default. It uses the full detected-star catalogue for each image, regardless of brightness; `--catalog curated` is a smaller, sparser alternative.

## Run on BlackPearl

The prior Python virtual environment should already contain `numpy`, `scipy`, `pillow`.

**List templates and star counts:**

```bash
(
    cd "$HOME/go/src/ap0calypse644/Mellon" &&
    "$HOME/.local/share/mellon-constellations-venv/bin/python" \
        tools/constellations/match_constellations_v3.py --list-templates
)
```

**First, visually validate a diverse short list:**

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    "$HOME/.local/share/mellon-constellations-venv/bin/python" \
        tools/constellations/match_constellations_v3.py \
        --only Ori Gem Leo Peg Sco Cyg \
        --attempts 20000 \
        --instances 12 \
        --output "$HOME/VMs/Mellon/constellation-benchmark-v3-smoke"
)
```

**Then, all constellations with nine or more vertices (29 templates):**

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    "$HOME/.local/share/mellon-constellations-venv/bin/python" \
        tools/constellations/match_constellations_v3.py \
        --min-stars 9 \
        --attempts 20000 \
        --instances 12 \
        --output "$HOME/VMs/Mellon/constellation-benchmark-v3"
)
```

At these parameters, the full six-image, 29-template benchmark explores **3,480,000 proposals** and retains at most **2,088 outputs**. Higher `--attempts` values increase CPU effort substantially, especially with larger templates; try a short list first.

**Visual atlas of the actual reference geometries:**

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    "$HOME/.local/share/mellon-constellations-venv/bin/python" \
        tools/constellations/template_gallery_v3.py \
        --output "$HOME/VMs/Mellon/constellation-reference-atlas.jpg"
    xdg-open "$HOME/VMs/Mellon/constellation-reference-atlas.jpg"
)
```

## Important interpretation

These are **shape matches**, not actual astronomical catalogues mapped onto the photographs. All output vertices are **real detected coordinates from the image**; the names and connecting geometry come from the reference pattern.

The RMS fit score is purely geometric. A low numerical error does not guarantee that the source detection is really a star rather than nebula detail or that the overall visual composition is attractive. Every candidate remains marked for visual review.

## Licensing/provenance

Reference linework: **d3-celestial**, © 2015 Olaf Frohn, `data/constellations.lines.json`, BSD-3-Clause. The full license notice and disclaimer are included in `README.md` in this directory. Reused reference geometry retains that attribution; generated matches select entirely new image-point vertices.
