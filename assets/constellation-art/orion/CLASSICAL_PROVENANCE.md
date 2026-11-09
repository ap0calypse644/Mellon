# Classical Orion — source, authorship and usage

**Status:** original, editable SVG art-direction study; **pending visual approval**. This does not supersede the original `orion-figure.svg` first direction.

- **Artwork:** `orion-classical.svg`, authored for the Mellon v7 continuation on 2026-11-09. The figure, hairstyle, club, animal pelt and drapery are newly hand-authored as editable SVG Bézier paths. There are no embedded raster images, fetched third-party vector paths or downloaded icon packs.
- **User's reference:** a user-provided image showing a classical celestial-atlas Orion, a right-facing striding figure carrying a raised club and hanging animal hide against a blue night sky. Used as **art-direction guidance only** (gesture, linework, silhouette and palette). No reference pixels or copied contours are present in the SVG. The user-provided image is not bundled or relicensed by this project.
- **Companion computer-generated mood concept:** a separate raster art-direction image was generated during the conversation. It is not used as a star-position source, illustration layer, artwork mask or input to this vector source.
- **Geometric landmarks:** the unchanged nine-point `Ori` core reference from `tools/constellations/templates-v3.json` (derived from d3-celestial, © Olaf Frohn, BSD-3-Clause, with credits in `tools/constellations/README.md`). Stars in the background are separately detected luminous image features, **not** necessarily astronomical Orion stars.
- **Background photos:** the original six-image corpus and its per-image `metadata.json` remain authoritative for photographers, Unsplash photo URLs, source-image hashes and transformed-background hashes. This art addition does not modify or redistribute altered star positions. Confirm photo reuse terms if publishing the project.
- **Artwork licensing:** all paths in `orion-classical.svg` are original new work for this project. The project owner can select the license for those original paths. This statement does not grant rights to relicense the user's reference image or third-party backgrounds.
- **Coordinates:** viewBox `-490 -620 980 1250`, with the nine constellation landmarks embedded in the vector. Apply translation, **uniform** scale and rotation only; do not warp source stars or vector anatomy.
- **Editable layers:** 10 named `<g>` elements with `data-reveal` values for later stroke sequencing. Paths and gradients are editable in Inkscape, Illustrator or a text editor. The group ordering is for future animation exploration, **not an implemented animation**.

The art should be considered a *vector line-art interpretation* of the classical reference rather than an identical copy. Naturalistic anatomy and aesthetic appropriateness remain a human design judgment.
