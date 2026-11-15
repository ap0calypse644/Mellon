# Constellations, photography, and the runtime scene pack

The stars in Mellon aren't randomly sprinkled over a picture. Each one is a **measured luminous feature in a source photograph**, and each glow sprite is made from that feature's **own RGB pixels**. This guide follows data from photograph to working GNOME overlay.

## Three different data sets

| Data | In Git? | Purpose |
| --- | --- | --- |
| `assets/starfield/corpus-v1/source/` | Yes | Six original input photographs (see credits/terms) |
| `assets/starfield/corpus-v1/catalogs/` | Yes | Image-aligned 1920×1080 backgrounds, detected/curated star IDs, graph and QA previews |
| `~/VMs/Mellon/constellation-quality-v9/` | **No** | Original workstation's expensive Go match database, `matches-v9.json`, `qa-index.json` and QA images |
| `~/VMs/Mellon/m6-curated-12-v1/` | **No** | Fully packaged deployment `library.json`, `scene-config.json`, photos and transparent 26×26 pixel sprites |
| `lab/gnome50-m6/pilot-selection.json` | Yes | Exactly twelve chosen IDs referencing the v9 quality database |
| `assets/constellation-art/orion/` | Yes | Experimental mythological figure artwork; **not deployed** |

**Replicability note:** code, originals, processed catalogs, and pinned scene selection are public, but the verified v9 quality database and derived runtime sprite pack were generated locally and have **not been committed**. A fresh clone therefore cannot simply run the current production installer. Build and visually review a compatible v9 database, then package your own scene set.

## Pipeline

```text
Original photos in assets/starfield/corpus-v1/source/
          │
          ▼
tools/starfield/corpus/build_multi.py
  ├─ image rotation / 16:9 center crop / Lanczos 1920×1080
  ├─ source-feature detection → star IDs, image coords, quality metrics
  └─ background-16x9.jpg + background-dim-16x9.jpg
          │
          ▼
tools/constellations/quality-v9/  (Go)
  ├─ template rotation/scale/translation
  ├─ assignment exclusively to EXISTING detected features
  ├─ quality, brightness, centered/illustration-safe ranking
  └─ matches-v9.json + qa-index.json + QA previews
          │
          ▼
lab/gnome50-m6/pilot-selection.json
  └─ pin 12 visually accepted scene IDs
          │
          ▼
lab/gnome50-m6/build-pilot-pack.py
  ├─ library.json (scene IDs, stars, edges, image hashes)
  ├─ scene-config.json (default: random-on-lock)
  ├─ dim backgrounds
  └─ RGBA sprites sampled from ORIGINAL star RGB pixels
          │
          ▼
lab/gnome50-m6/verify-pilot-pack.py
          │
          ▼
M8.4 + G1.8 GNOME extension bundles
```

## Rebuild the source catalogs

Use **a separate Python environment** for the original corpus tooling; its dependency pins differ from the newer star-sprite environment:

```bash
(
    set -euo pipefail
    python3 -m venv .venv-starfield
    .venv-starfield/bin/python -m pip install -r tools/starfield/requirements.txt

    .venv-starfield/bin/python tools/starfield/corpus/build_multi.py \
      --input assets/starfield/corpus-v1/source \
      --output assets/starfield/corpus-v1/catalogs

    .venv-starfield/bin/python tools/starfield/corpus/match_patterns.py \
      --data assets/starfield/corpus-v1/catalogs

    .venv-starfield/bin/python tools/starfield/corpus/validate_multi.py \
      --data assets/starfield/corpus-v1/catalogs \
      --originals assets/starfield/corpus-v1/source
)
```

**Caution:** this writes into `assets/starfield/corpus-v1/catalogs/`. On a clean working branch, inspect the changed files and verify asset permissions/credits before committing; don't overwrite a trusted catalog in your main checkout without a backup.

## Rebuild the quality matcher database

`tools/constellations/quality-v9/` is the later Go matcher: six backgrounds × many constellation templates, one-to-one image-feature assignment, brightness-aware ranking, no invented star coordinates.

The original author's helper:

```bash
(
    set -euo pipefail
    bash tools/constellations/rebuild_quality_v9.sh
)
```

is *computationally expensive* and assumes Go, the existing `~/VMs/Mellon` workspace, and a local output path. Its default search budget is **1,000,000 random placements and 4,000 refinements per image/template**. It saves resumable checkpoints and produces `matches-v9.json` and `qa-index.json` under `~/VMs/Mellon/constellation-quality-v9/`. For a first experiment, read its arguments and reduce the budgets on a copy; a reduced run will **not necessarily contain all twelve IDs** in `pilot-selection.json`.

The next step is **visual QA**, not blindly picking the numerically best score. Inspect at native resolution, including how the constellation sits behind the central lock/login UI and whether the star identities correspond to visible pixels.

## Package twelve scenes

With compatible verified v9 output available:

```bash
(
    set -euo pipefail
    .venv-mellon/bin/python lab/gnome50-m6/build-pilot-pack.py \
      --index "$HOME/VMs/Mellon/constellation-quality-v9/qa-index.json" \
      --database "$HOME/VMs/Mellon/constellation-quality-v9/matches-v9.json" \
      --corpus assets/starfield/corpus-v1/catalogs \
      --out "$HOME/VMs/Mellon/m6-curated-12-v1"

    .venv-mellon/bin/python lab/gnome50-m6/verify-pilot-pack.py \
      --pack "$HOME/VMs/Mellon/m6-curated-12-v1"
)
```

The build refuses an existing destination or unsupported rank IDs, so **do not repurpose the same pack name for an unrelated scene set**. Make an explicitly named output for your own project. Its `pilot-selection.json` is the pinned source; replace the IDs intentionally when generating different matches.

The sprite builder calculates a local background baseline around each selected pixel, extracts its original RGB residual, scales it with gain **7.20** and expansion **2.12×**, feathers the edge, and stores a **26×26 transparent RGBA** patch. It does not paint generic circular stars onto the scene.

## Runtime schema and constraints

`library.json` declares `schema: "mellon-m6-scene-library-v1"` and exactly 12 `scenes`. Each scene has:

```json
{
  "id": "veiled-ring/08-Peg",
  "background": "veiled-ring",
  "name": "Pegasus",
  "constellation": "Peg",
  "image": "assets/veiled-ring/background.jpg",
  "image_sha256": "<SHA256 of dim background>",
  "image_size": [1920, 1080],
  "star_ids": ["S000001"],
  "vertices": [[0.5, 0.5]],
  "edges": [[0, 1]],
  "sprites": ["assets/veiled-ring/08-Peg/star-00.png"],
  "sprite_size": [26, 26]
}
```

This is **illustrative structure, not a valid scene**: a production entry has 8–24 matching IDs/vertices/sprites and at least `N−1` valid edges. Keep all paths relative to `assets/` and all coordinates strictly between 0 and 1. The `scene-data.js` runtime validator enforces that schema, six distinct backgrounds, and exact counts.

**Never edit `vertices` without regenerating/reverifying corresponding `sprites`.** A point must be placed over the original source pixel. Each line should connect the selected real vertex indices; it is drawn only if both are currently active.

## The cover transform

Mellon aligns the original 1920×1080 pixel coordinate system to CSS `background-size: cover`:

```text
scale = max(viewportWidth / imageWidth, viewportHeight / imageHeight)
dx = (viewportWidth  - imageWidth  * scale) / 2
dy = (viewportHeight - imageHeight * scale) / 2
displayX = sourcePixelX * scale + dx
displayY = sourcePixelY * scale + dy
```

Star sprite placement, canvas lines, and background crop **must use the same transform**, otherwise rotating the display, resizing the VM, or changing aspect ratio will misalign the constellation.

## Third-party media

The included corpus credits six Unsplash photographers. A separate NASA Hubble M24 experiment also exists, as do derived constellation templates and Orion artwork. The MIT source-code license does **not** automatically grant rights to redistribute or relicense those source photos. Read [Assets & licenses](ASSETS_AND_LICENSES.md) before rehosting a compiled media pack.
