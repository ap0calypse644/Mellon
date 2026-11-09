# Mellon Starfield Atlas — image-aligned constellation coordinates

**Scope:** construct a database from an existing, internet-sourced background image. This does **not** modify GNOME, BlackPearl's desktop or the Mellon virtual machine.

## Chosen background

**NASA/ESA Hubble photograph of Messier 24 (Small Sagittarius Star Cloud)**: a wide, extremely crowded starfield. The choice is driven by visible point density, not by whether a named astronomical constellation appears in it. Digital art is also an acceptable future input as long as it has a clear source and reuse permission.

- Source page: https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-24/
- Selected image: https://assets.science.nasa.gov/dynamicimage/assets/science/missions/hubble/stars/star-cloud/Hubble_M24_1_flat_FINAL_A_rot90.jpg?crop=faces%2Cfocalpoint&fit=clip&h=2022&w=3775
- Credit: **NASA, ESA, and R. Sahai (Jet Propulsion Laboratory); processing: Gladys Kober (NASA/Catholic University of America).**
- NASA reuse terms: https://www.nasa.gov/nasa-brand-center/images-and-media/ — credit the source; don't imply agency endorsement. NASA pages sometimes contain third-party images; use only the selected NASA/ESA Hubble asset.

## Outputs

The GitHub Actions workflow downloads the NASA file, runs the detector, validates the pixel mapping, and commits these assets when successful:

| File | Contents |
| --- | --- |
| assets/starfield/m24-original.jpg | Unmodified image bytes used as coordinate reference |
| assets/starfield/stars.json | IDs, x/y (0–1), original px/py, prominence, brightness, color, radius, heuristic quality |
| assets/starfield/graph.json | Nearby-node adjacency + candidate edges; not a restriction on all possible connections |
| assets/starfield/metadata.json | Image SHA256, source attribution, detector settings, counts |
| assets/starfield/detections-preview.jpg | Downsampled QA overlay with green rings on detected peaks |

Every catalog point is measured from the **actual downloaded image**. We do not add stars, use random coordinates, or claim those objects were individually confirmed as real stars. In dense photography some detections may be galaxies, artifacts, or overlapping sources. The quality_score is *not* a calibrated probability.

The independent validator checks the source SHA256, image dimensions, every coordinate transform, star separation, graph references and spot-checks luminous maxima at 3,000 sampled positions.

## Run locally on BlackPearl (not in the VM)

Python 3.12 with internet access:

~~~bash
(
    set -euo pipefail

    python3 -m venv .venv-starfield
    . .venv-starfield/bin/activate

    python -m pip install -r tools/starfield/requirements.txt

    python tools/starfield/download_source.py \
        --output assets/starfield/m24-original.jpg

    python tools/starfield/build_catalog.py \
        --image assets/starfield/m24-original.jpg \
        --out assets/starfield \
        --threshold 5.6 --min-separation 5 --limit 25000

    python tools/starfield/validate_catalog.py \
        --image assets/starfield/m24-original.jpg \
        --out assets/starfield
)
~~~

The GitHub workflow uses the same scripts to create and commit the image/catalog automatically. Its output commit does not trigger another run.

## What patterns can we produce?

We do not enumerate every possible constellation. Given N detected stars, there are 2^N subsets *before* choosing lines. Instead we store the full star vertex set with precisely registered coordinates. A later pattern engine can choose any subset and construct arbitrary lines, silhouettes, runes, symbols, geometric or branching patterns. The nearest-neighbor graph is an optional guide for aesthetically short connections, not a definition of all permissible constellations.

## Coordinate transform

The source image pixels are authoritative. The background and line overlays **must use the same scale and crop offsets**. If cover fits an image of W×H into a viewport of w×h:

- scale = max(w / W, h / H)
- offsetX = (w - W×scale) / 2
- offsetY = (h - H×scale) / 2
- drawnX = px×scale + offsetX
- drawnY = py×scale + offsetY

No GNOME runtime detection: we index stars once at build time and only load the precomputed data during locking.
