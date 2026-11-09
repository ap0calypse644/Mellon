# Mellon Starfield Corpus v1 — six user-selected Unsplash images

This directory contains the exact six uploaded images, their measured luminous
image features, transformed 1920×1080 variants, and simple constellation matching
examples. No stars are generated, fabricated, or inserted into the backgrounds.

## Data

- `source/`: the six **unmodified uploaded JPEGs**, authoritative source pixels.
- `catalogs/<name>/stars-all.json`: all candidate luminous image features detected
  in the original image. Not all are independently verified physical stars;
  bright nebular details and JPEG artifacts can also produce detections.
- `catalogs/<name>/stars-curated.json`: ~700 spatially distributed, sharp candidate
  features in the **1920×1080 transformed background coordinate system**.
- `catalogs/<name>/graph-curated.json`: short candidate edges for graph search;
  the shape matcher can connect any pair, not just these edges.
- `catalogs/<name>/background-16x9.jpg`: rotated if necessary, center-cropped,
  and resized to 1920×1080, no artificially drawn stars.
- `catalogs/<name>/background-dim-16x9.jpg`: **same geometry** as preceding file,
  brightness multiplied by 0.44. Coordinates remain valid.
- `catalogs/<name>/qa-curated.jpg`: green circles on all curated star locations.
- `catalogs/<name>/pattern-examples.json` and `qa-patterns.jpg`: three arbitrary
  outline shapes approximated only with detected star IDs (no invented positions).
- `catalogs/<name>/metadata.json`: input and output SHA256 digests,
  image sizes, crop box, orientation change and detection/selection settings.
- `catalogs/summary.json`: corpus totals.

## Processing and validation

The benchmark catalogs cover **70,136** isolated luminous candidates in six source
images. The curated, usable per-image subsets contain **4,324** candidate points
in total, with **19,778** unique within-image graph edges. They are deliberately
smaller and better distributed, not claims that 4,324 physical stars were confirmed.

The derived 1920×1080 images use a reversible geometric mapping:

1. Rotate portrait photographs clockwise 90°; do not flip them.
2. Center crop the result to 16:9 without stretching the image.
3. Resize to 1920×1080 with Lanczos, then dim **only RGB pixel values**.
4. Map stars from original pixel centroids using the recorded crop and rotation.

Use the `tools/starfield/corpus/validate_multi.py` tool to verify original hashes,
transformed background hashes, coordinate projections, star IDs, edge references
and pattern references. Coordinates are valid **only for the included image files**
and the recorded rendering transform; a new crop requires a new coordinate map.

## Recreate on BlackPearl (no VM)

After installing the repo's `tools/starfield/requirements.txt` dependencies,
run the scripts from the repository root:

```bash
(
    set -euo pipefail
    python tools/starfield/corpus/build_multi.py \
      --input assets/starfield/corpus-v1/source \
      --output assets/starfield/corpus-v1/catalogs
    python tools/starfield/corpus/match_patterns.py \
      --data assets/starfield/corpus-v1/catalogs
    python tools/starfield/corpus/validate_multi.py \
      --data assets/starfield/corpus-v1/catalogs \
      --originals assets/starfield/corpus-v1/source
)
```

The extraction tool `build_multi.py` imports the included `detector_v1.py` so the
catalog does not depend on the repo's legacy NASA M24 source constants.

## Auth/UI roadmap

These assets are pure offline data. No GNOME extension is modified or installed.
Future Mellon can visually hide the native GNOME unlock widgets **only after**
we preserve the system password entry's focus, verification flow, failure feedback,
accessibility escape hatch and an SSH recovery path. Authentication continues to
be performed by GNOME; Mellon must never capture password text or global keypresses.

## Original image credits

Photos from Unsplash, attribution to:

- Scott Lord — https://unsplash.com/photos/PiqZfESKt3k
- Beat Schuler — https://unsplash.com/photos/9D2WUVsT9_I
- Arnaud Girault — https://unsplash.com/photos/zWOgtUIX7OE
- Aldebaran S — https://unsplash.com/photos/qtRF_RxCAo0
- Scott Lord — https://unsplash.com/photos/KLFP4HwaXyk
- Wallace Henry — https://unsplash.com/photos/qW_OmkbDJVQ

Unsplash general license: https://unsplash.com/license . Confirm individual
photo eligibility before publishing these photos inside a public release;
this is a benchmark corpus, not an Unsplash photo redistributor.
