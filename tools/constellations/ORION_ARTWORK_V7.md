# Mellon v7 / Orion — first vector-art direction prototype

Status: **offline artwork prototype, awaiting visual review**. No GNOME host/VM changes.

## Deliverables

- `assets/constellation-art/orion/orion-figure.svg`: original editable nine-layer engraving. Each group has a stable ID for a possible future stroke-reveal; not a raster wallpaper.
- `anatomical-anchors.json`: nine named template-to-figure placements; the head is index 0, shoulders 1–2, belt 3–5, feet 6–7, hanging sword 8.
- `stroke-sequence.json`: **draft storyboard**, not an implemented verified-login animation.
- `render_orion_v7.py`: reads existing v6 results, selects safe art-fitting candidates, makes four clean 1920×1080 previews, four separate QA overlays, four fitted editable SVG overlays and JSON manifest.
- `verify_orion_v7.py`: separate fail-closed audit of exact source IDs/image coordinates, transform, stable report matches, hashes, anchor residuals, SVG raster extent and 18px glow allowance.

## Working with the existing v6 data

Do NOT rerun the 18.6-million-attempt v6 search. You already have:

`~/VMs/Mellon/constellation-benchmark-v6-centered/matches-v6.json`

Re-use the v6 report and six source corpus committed to GitHub:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    PYTHON="$HOME/.local/share/mellon-constellations-venv/bin/python"
    "$PYTHON" -m pip install --upgrade 'cairosvg>=2.7,<3'
    OUT="$HOME/VMs/Mellon/orion-artwork-v7"
    V6="$HOME/VMs/Mellon/constellation-benchmark-v6-centered/matches-v6.json"
    "$PYTHON" tools/constellations/render_orion_v7.py --report "$V6" --output "$OUT"
    "$PYTHON" tools/constellations/verify_orion_v7.py \
        --report "$V6" --manifest "$OUT/fit-results.json" \
        --corpus assets/starfield/corpus-v1/catalogs \
        --art assets/constellation-art/orion/orion-figure.svg \
        --output "$OUT"
)
```

Four example backgrounds are `blue-gold-nebula`, `veiled-ring`, `dust-cloud`, `cosmic-wings`; override `--slugs` for others. Each final scene has **one constellation only**.

## Safety contract

1. Reference stars stay at their actual measured pixels. Never warp or synthesize them to fit the drawing.
2. SVG gets only rigid uniform scaling, rotation, and translation; anchors are deliberately close to reference points and placement may be rejected.
3. Art including stroke/bloom must remain within the v6 actual image-star bounding box enlarged by **9% of width and height per side**, and the outer screen still reserves **5% per edge**.
4. Validate exact source-image SHA256 and matching transformed source-star IDs.
5. Candidate status is `pending` until human aesthetic review. A geometric pass does NOT mean finished professional art.
6. Nothing in v7 changes GNOME settings, native authentication, or runs in `mellon-gnome50-lab`. The success-only reveal depends on a later GNOME-50 lifecycle investigation.

## Known artistic limitations / review points

This deliberately begins with line-art armor and mythological equipment; the graphic style, silhouette, degree of detail and contrast must be approved before attempting animation. This is **not** a substitute for an expert illustrator's polished final pass. If the figure feels too schematic, update the existing named SVG groups and regenerate previews; preserve the nine anatomical anchor positions.

## Source

For the complete history and constraints see `docs/handover/MELLON_FULL_HANDOVER_2026-11-09.md`. See `PROVENANCE.md` for attribution and rights.
