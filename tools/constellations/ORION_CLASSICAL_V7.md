# Mellon v7 — classical celestial-atlas Orion (second art direction)

This **offline** alternative takes the user's illustrated reference as an art-direction guide (not a copied asset): an ancient hunter with raised wooden club, natural human profile/anatomy, windblown cloak and tunic, and a hanging animal hide. The linework is pale blue-lilac rather than metallic gold / sci-fi armor. **This variant is NOT artistically approved yet.** No GNOME host/VM settings were touched, no login authentication modifications were made, and no constellation search was rerun.

## Files

- `assets/constellation-art/orion/orion-classical.svg`: hand-authored transparent editable vector; 10 separate ordered, named groups; no raster embedded.
- `assets/constellation-art/orion/classical-selection-v7.json`: four deterministic v6 placement choices, stable candidate IDs, source star IDs and hashes.
- `assets/constellation-art/orion/CLASSICAL_PROVENANCE.md`: rights and reference-use disclosure.
- `tools/constellations/render_orion_v7.py`: now supports optional `--variant`, defaulting to original `v7` for backwards compatibility. It still fits with translation + rotation + uniform scale only.
- `tools/constellations/verify_orion_v7.py`: accepts a per-scene output suffix, checks rendered overlay hash when present, original stars, image transforms, art bounds, full-resolution images and v6 identity.

## Reproduce locally without rerunning v6 matching

Use the original v6 report already on BlackPearl (`~/VMs/Mellon/constellation-benchmark-v6-centered/matches-v6.json`) and the existing corpus committed to Mellon:

```bash
(
  set -euo pipefail
  cd "$HOME/go/src/ap0calypse644/Mellon"
  git -c core.hooksPath=/dev/null pull --ff-only origin main
  PY="$HOME/.local/share/mellon-constellations-venv/bin/python"
  REPORT="$HOME/VMs/Mellon/constellation-benchmark-v6-centered/matches-v6.json"
  OUT="$HOME/VMs/Mellon/orion-classical-v7"
  "$PY" tools/constellations/render_orion_v7.py \
    --report "$REPORT" \
    --art assets/constellation-art/orion/orion-classical.svg \
    --variant v7-classical \
    --output "$OUT"
  "$PY" tools/constellations/verify_orion_v7.py \
    --report "$REPORT" \
    --manifest "$OUT/fit-results.json" \
    --corpus assets/starfield/corpus-v1/catalogs \
    --art assets/constellation-art/orion/orion-classical.svg \
    --output "$OUT"
)
```

The selected matches are found from **already computed v6 candidates**, not a fresh geometric search. The matcher returns one constellation per scene; the precise image-star IDs remain unmodified. For the original armoured variant, run the renderer with the old SVG and without `--variant`.

## Current QA (2026-11-09)

| Source | V6 index | RMS (px) | Art anchor max deviation (px) | Artwork bbox (px, glow padded) |
|---|---:|---:|---:|---|
| blue-gold-nebula | 138 | 3.12 | 4.35 | `[522, 71, 1169, 887]` |
| veiled-ring | 127 | 2.58 | 4.45 | `[724, 119, 1338, 915]` |
| dust-cloud | 118 | 3.90 | 7.13 | `[729, 110, 1379, 943]` |
| cosmic-wings | 152 | 3.72 | 5.95 | `[531, 141, 1176, 963]` |

The independent validator confirms four pixel-exact nine-star matches, hard source hashes, proper figure/art envelope clearance and 1920×1080 clean/QA images. 18px extra bloom padding is included in its visible-SVG-bound check.

**Limits:** visually illustrated anatomy isn't proven by coordinate RMS; the historical atlas aesthetic needs user approval before stroke animation or lock-screen integration. The v6 space reservation is a **geometric** contract, not an assurance of good art. Orion is not necessarily a true astronomical plate in any of the image sources.
