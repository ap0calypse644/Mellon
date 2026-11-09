# Mellon constellation matcher — first real-geometry benchmark

This **offline** prototype uses real constellation *line geometries* as templates and selects **only existing detected star coordinates** from the six-image Mellon corpus. It does not synthesize, move, or fake image stars, and does not modify GNOME or the virtual machine.

## First five templates

- Orion (`Ori`) — full Stellarium-style figure.
- Cassiopeia (`Cas`) — recognisable W.
- Ursa Major / Big Dipper (`UMa`) — seven-star dipper asterism.
- Cygnus (`Cyg`) — Northern Cross with wings.
- Scorpius (`Sco`) — distinctive curved tail.

Template geometry was derived from the J2000 celestial coordinates in Olaf Frohn's `d3-celestial/data/constellations.lines.json`. It is normalized using a local planar projection, not an actual-sky simulation. Edges remain exactly as specified by the source after selecting the Big Dipper subset. Full copyright / attribution below.

## Run on BlackPearl (not in VM)

From the checked-out Mellon repository:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    python3 -m venv "$HOME/.local/share/mellon-constellations-venv"
    "$HOME/.local/share/mellon-constellations-venv/bin/python" -m pip install -q numpy scipy pillow
    "$HOME/.local/share/mellon-constellations-venv/bin/python" \
        tools/constellations/match_constellations.py \
        --corpus assets/starfield/corpus-v1/catalogs \
        --output "$HOME/VMs/Mellon/constellation-benchmark" \
        --attempts 550
)
```

Look at `~/VMs/Mellon/constellation-benchmark/*-overlay.jpg`, plus `matches.json`.
The source corpus is expected to already contain `stars-curated.json` and `background-dim-16x9.jpg` for each image.

## Implementation

The matcher tries seeded rotations, uniform scales and translations, uses a KD-tree to find nearby source stars, and uses minimum-cost unique assignment to preserve one star per template vertex. It rejects matches whose RMS template displacement exceeds a configurable pixel threshold. Output retains exact star IDs, actual normalized source positions, and the template topology.

The current search is a **baseline, not a production-quality optimizer**: it has no collision-aware ranking among different constellations, no central-UI exclusion region, and no human recognizability score. Its reported RMS error measures geometric proximity only. All outputs are marked `candidate-needs-visual-review` and **must not be deployed to the lock screen without visual review**.

A local test with 550 proposals/template on six earlier curated catalogues produced 30 candidates from 30 trials, with RMS errors from approximately 10 to 24 pixels. That proves the pipeline runs and finds candidate matches, not that every visual result is production quality.

## Attribution and license

Geometric templates derived from:
- **d3-celestial**, © 2015 Olaf Frohn. Source: https://github.com/ofrohn/d3-celestial/blob/master/data/constellations.lines.json
- Licensed under the **BSD 3-Clause License** (copyright and disclaimer below).

Copyright (c) 2015, Olaf Frohn. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES, LOSS OF USE, DATA, OR PROFITS, OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
