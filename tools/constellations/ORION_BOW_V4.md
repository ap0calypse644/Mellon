# Orion with a full curved bow — Mellon templates v4 / matcher v8

## What changed

The brightness-aware v8 matcher now defaults to
`tools/constellations/templates-v4-orion-bow.json` instead of v3.

- **18 vertices**: original 9-star body/belt/sword plus a connected
  9-point curved arc on Orion's western side.
- **18 connections**: the original 9 connections, 8 consecutive links
  along the bow arc, and the shoulder-to-arc attachment.
- Same source-reference **right ascension/declination** geometry
  for every added point. The original nine points are preserved under
  the same uniform 2D normalization (translation+uniform scale).
- Only the Orion (`Ori`) template differs. All 30 other v3 templates
  have exactly the same data. The original `templates-v3.json` remains
  untouched for reproducing the previous nine-star Orion geometry.

**Historical naming note:** the arc's source-star chain appears as the
lion-skin/shield carried by Orion in several classical depictions. It
forms a recognizably **bow-shaped curve** west of Bellatrix, often
described as a bow in modern skywatching explanations. Here, “bow”
refers to that real reference arc, not an invented physical bow/arrow.
An illustrated weapon is a different, later art task.

## Geometry provenance and guardrails

The nine extra source vertices are exactly the second `MultiLineString`
segment of `reference/constellations.lines.json` under `id="Ori"`.
The reference's first line segment connects Bellatrix at
`(RA=81.2828°, Dec=6.3497°)` to the arc's `(73.7239°, 10.1508°)`
point. The bow shape extends north and south from there.

`verify_orion_bow_v4.py` proves independently that:

- all 9 old core stars and all core edges remain in their previous
  relative geometry;
- exactly the original 9 reference arc coordinates were attached,
  with 8 arc connections and the documented Bellatrix attachment;
- all 30 non-Orion constellations remain byte-equivalent in parsed data;
- normalized coordinates are bounded and no points were fabricated.

The photo-star matches are *not* the above celestial coordinates: as
before, the matcher selects only the real detected image points from
the six photographs. Large scale, RMS, vertex-error thresholds, fixed
orientation limits, edge margins, center offsets and brightness weights
are **the same** as the v8 matcher used previously.

## Full Orion-only six-background rerun on BlackPearl

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash tools/constellations/rebuild_orion_bow_v8.sh
)
```

This runs:

- 100,000 proposals and up to 1,200 final refinements **per background**;
- all 6 backgrounds, **Orion only**, with `--limit 0`;
- original unchanged geometric/center/safe-region constraints;
- eight independent QA previews of each image's best accepted Orion
  bow matches;
- independent verification against actual detected source-star IDs;
- optional objective comparison with the old v6 Orion results.

Outputs (not replacing other v8 scenes):

- `~/VMs/Mellon/constellation-v8-orion-bow/matches-v8.json`
- `~/VMs/Mellon/constellation-v8-orion-bow/<background>/qa/Ori/`
- `~/VMs/Mellon/constellation-v8-orion-bow/orion-bow-v6-v8-comparison.json`
  (when local v6 report exists).

A separate GitHub Actions workflow
`Rebuild Orion with bow — Mellon v8` runs the same full search and
publishes the resulting matches and previews as an optional artifact.

## Selection caveat

With **18** constellation vertices, a short password will light only
the first few. That's consistent with the current one-star-per-character
concept, but can be revisited during M6 design so that completed
constellations don't implicitly depend on unusually long passwords.
We do **not** change password handling or reveal password length.

**M5.4 is unaffected:** its shipped scene is still the independently
verified nine-star Orion with the proven overlay, alerts and manual
native-login recovery. No changes have been deployed to the GNOME VM
or BlackPearl host by this offline template update.

## Full rerun results (verified)

The **full** six-background Orion-only search completed successfully in
[GitHub Actions run #42674929551](https://github.com/ap0calypse644/Mellon/actions/runs/42674929551)
at commit `6afcb00a498678d55dd783140ceb6fe6f52ed157`.

- 100,000 random placement attempts and up to 1,200 rigid-fit refinements
  per background; no result cap.
- **1,156** accepted candidates in six image/template combinations.
- All passed the independent source ID, pixel coordinate, brightness
  measurements, geometric RMS, centering, and artwork-margin validator.
- The full JSON plus up to eight rendered QA previews per image were
  published in the `mellon-orion-bow-v8` Actions artifact.

| Background | Accepted | Best span | Best RMS |
|---|---:|---:|---:|
| blue-gold-nebula | 205 | 70.6% | 5.85 px |
| chromatic-nebula | 165 | 71.3% | 6.92 px |
| cosmic-wings | 199 | 70.1% | 5.00 px |
| dust-cloud | 204 | 70.4% | 5.12 px |
| rosy-rosette | 194 | 71.4% | 5.54 px |
| veiled-ring | 189 | 70.5% | 4.79 px |
| **Total** | **1,156** | | |

Download the verified artifact from BlackPearl (requires GitHub CLI login):

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    OUTPUT="$HOME/VMs/Mellon/constellation-v8-orion-bow"
    mkdir -p "$OUTPUT"
    gh run download 42674929551 --name mellon-orion-bow-v8 --dir "$OUTPUT"

    "$HOME/.local/share/mellon-constellations-venv/bin/python" \
        tools/constellations/verify_orion_bow_v4.py
    "$HOME/.local/share/mellon-constellations-venv/bin/python" \
        tools/constellations/verify_bright_centered_matches_v8.py \
        --report "$OUTPUT/matches-v8.json"
)
```

This is a validated **candidate library**, not final human-curated M6 scenes.
The original v6 match report, pre-bow v8 reports, and M5.4 GNOME scene
remain unchanged.
