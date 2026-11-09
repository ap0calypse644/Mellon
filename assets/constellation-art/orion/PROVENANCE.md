# Orion v7 — asset provenance and rights

- `orion-figure.svg`: new editable layered SVG created specifically for the Mellon v7 prototype on 2026-11-09. The vector paths are authored for the nine-point Orion core and are **not** a traced or downloaded third-party SVG. No Wikimedia/OpenClipart artwork is embedded.
- The ancient celestial-atlas/engraving aesthetic (e.g. Bayer, Hevelius, Sidney Hall) informed the broad visual direction; no particular engraving's contours were copied.
- Constellation template: derived from Olaf Frohn's d3-celestial, `constellations.lines.json`, BSD-3-Clause; see `tools/constellations/README.md` for attribution and license. The nine selected image stars are **not** members of the real astronomical constellation Orion; they are measured features from separate background photographs.
- Background photographs are the **existing** six-source Mellon corpus, attributed and hashed individually in `assets/starfield/corpus-v1/catalogs/<slug>/metadata.json`. The actual metadata is authoritative: e.g. `blue-gold-nebula` points to **Arnaud Girault**, `cosmic-wings` to **Beat Schuler** (the handover's photographer/slug summary was mismatched). Check current photo reuse terms prior to public release: https://unsplash.com/license.
- No third-party art license or public-domain status is claimed for the newly authored SVG; the project owner should choose the release license for original work before publishing.
- This is an art-direction prototype pending human quality approval. Pixel-geometric validity is not artistic signoff.
