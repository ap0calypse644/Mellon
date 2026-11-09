# Mellon six-image starfield corpus

All six supplied Unsplash photos are retained as **benchmark inputs**. No one
photo is designated the final lock-screen background.

- 70,136 isolated luminous *candidate image features* from the six exact
  uploaded JPEGs (not 70,136 individually confirmed astronomical stars).
- 4,324 more widely distributed candidate points after 16:9 transforms.
- 19,778 candidate graph edges, optional for pattern generation.
- All stars refer to measured source pixels. No random fabricated star points.
- Background variants use 1920×1080, portrait rotation by 90 degrees,
  center crop (no stretching), and a 44%-brightness variant. Exact pixel/crop
  mapping and SHA256s are recorded beside each dataset.
- Patterns can be arbitrary: vertex IDs are selected from image observations;
  line edges are selected by a separate matching algorithm.

## Source assets and local processing

Place the exact six original Unsplash JPEGs in
\`assets/starfield/corpus-v1/source/\`. The six filenames and their expected
photographer names are in \`tools/starfield/build_corpus.py\`.

Install existing \`tools/starfield/requirements.txt\` in a Python venv, then
generate offline on BlackPearl (NOT in the GNOME VM):

\`\`\`bash
(
    set -euo pipefail
    python tools/starfield/build_corpus.py \
      --input assets/starfield/corpus-v1/source \
      --output assets/starfield/corpus-v1/catalogs
)
\`\`\`

The complete run using the user's exact six uploads has already been executed
outside the repository and its QA images/datasets packaged as an importable ZIP.
The ZIP also contains additional shape matching and coordinate-validation
scripts. Import it to preserve source-byte hashes and validated catalog files.

## Licensing

The images are by Scott Lord (two photographs), Beat Schuler, Arnaud Girault,
Aldebaran S and Wallace Henry. Source: Unsplash. See
https://unsplash.com/license for the standard image reuse terms; confirm
individual image eligibility before publishing bundled original images.
This is **not** a collection of interchangeable stock photos.

## GNOME UI and password security

These processing scripts are **entirely offline**. M3 GNOME extension remains
untouched. The eventual production UI may hide the *visuals* of the GNOME
password prompt but must keep GNOME's native password-entry focus and
authenticator, preserve the usual unlock and error/recovery behavior, and
never intercept global keyboard events or read passwords.
