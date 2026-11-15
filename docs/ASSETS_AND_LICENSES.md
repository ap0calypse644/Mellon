# Assets, credits, and licensing

**Code and imagery are different licensing questions.** The repository's [MIT License](../LICENSE) covers original Mellon source code. It does **not** relicense third-party photographs, catalog sources, contributed artwork, or externally sourced constellation templates. Before distributing a new compiled scene pack or screenshots with embedded photography, review each asset's actual terms.

## Six-photograph nebula corpus

The working catalog is under `assets/starfield/corpus-v1/`. Its six images are derived from third-party Unsplash photographs, credited in the corpus [README](../assets/starfield/corpus-v1/README.md). Source/credits as recorded there:

| Photographer | Original link |
| --- | --- |
| Scott Lord | https://unsplash.com/photos/PiqZfESKt3k |
| Beat Schuler | https://unsplash.com/photos/9D2WUVsT9_I |
| Arnaud Girault | https://unsplash.com/photos/zWOgtUIX7OE |
| Aldebaran S | https://unsplash.com/photos/qtRF_RxCAo0 |
| Scott Lord | https://unsplash.com/photos/KLFP4HwaXyk |
| Wallace Henry | https://unsplash.com/photos/qW_OmkbDJVQ |

Unsplash's general terms are at https://unsplash.com/license; individual asset rights and conditions may vary. The existence of images in Git does **not** mean the project's MIT code license covers them or that you can republish them under your own license. The processed/dimmed backgrounds and transparent star sprites are derivatives of those photographic sources and should be treated accordingly.

## NASA/ESA Hubble M24 reference experiment

The separate `assets/starfield/m24-original.jpg` and associated point catalog are from a NASA/ESA Hubble Messier 24 reference image. The [Starfield Atlas README](../tools/starfield/README.md) records the original source URL and full credit:

**NASA, ESA, R. Sahai (JPL); processing by Gladys Kober (NASA/Catholic University of America).**

NASA image reuse guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/. Do not imply NASA endorsement. The M24 atlas is not the current 12-scene runtime pack.

## Constellation templates

The early astronomy line templates derive from Olaf Frohn's [d3-celestial](https://github.com/ofrohn/d3-celestial) dataset. Attribution and BSD-3-Clause terms are preserved in the [constellation matcher README](../tools/constellations/README.md). Preserve notices when copying derived templates or template data. Some later matcher outputs are original optimization results over those templates, but that does not erase upstream credit.

## Orion figure artwork

`assets/constellation-art/orion/` contains unfinished research into mythological outlines, line drawing, anchors and provenance. Read [its provenance](../assets/constellation-art/orion/CLASSICAL_PROVENANCE.md) before using it. That experiment is **not enabled** in the G1.8/M8.4 login or lock screens.

## Metadata, fonts, and screenshots

GNOME Shell's iconography, system fonts, and runtime assets come from your installed GNOME/distribution and retain their own licenses. No proprietary font is shipped by the Mellon source.

If you add screenshots or third-party textures, include:
1. an attribution/source URL;
2. the exact permission/license you rely on;
3. transformations and coordinate/crop changes;
4. restrictions on redistribution;
5. a safe version without identifiable user names or sensitive environment information.

## When making a fork or release

- **Original Mellon code:** MIT, see [LICENSE](../LICENSE).
- **Third-party photo pixels, cutouts, derived sprites:** comply with original photograph licenses; don't claim they are MIT.
- **External constellation template data:** preserve BSD-3-Clause and other upstream terms.
- **Unverified/AI-generated or donated art:** decide and document rights explicitly before bundling.
- **A full distribution package:** include accurate notices and ensure every asset can lawfully be redistributed.

Questions about permissions are not solved merely by the data being accessible in a public GitHub repository. Where a license is uncertain, replace the asset with one you have permission to use rather than assuming rights.
