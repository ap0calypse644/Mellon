#!/usr/bin/env bash
# Offline only: recompute Orion-with-bow using v8 brightness-aware matching.
# Never installs a GNOME extension; preserves older v6/v8 reports.
# Safe to paste or execute from a zsh terminal (isolated bash subshell).
(
    set -euo pipefail
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    ROOT="$(cd -- "$HERE/../.." && pwd)"
    cd "$ROOT"

    PYTHON="$HOME/.local/share/mellon-constellations-venv/bin/python"
    OUTPUT="$HOME/VMs/Mellon/constellation-v8-orion-bow"
    V6="$HOME/VMs/Mellon/constellation-benchmark-v6-centered/matches-v6.json"
    if [[ ! -x "$PYTHON" ]]; then
        echo "ERROR: Mellon constellation Python venv is missing: $PYTHON" >&2
        exit 1
    fi

    echo 'MELLON ORION BOW // 18 REAL IMAGE-STAR POINTS // OFFLINE ONLY'
    echo 'Six backgrounds; v8 brighter-source-star preference; full v6 geometry.'
    echo '100,000 placement attempts, 1,200 refinements/background, no match cap.'
    echo 'This does NOT change the current GNOME M5.4 scene or v6/v8 reports.'

    "$PYTHON" tools/constellations/verify_orion_bow_v4.py
    "$PYTHON" tools/constellations/test_bright_v8.py

    "$PYTHON" tools/constellations/match_bright_centered_constellations_v8.py \
        --templates tools/constellations/templates-v4-orion-bow.json \
        --only Ori \
        --catalog all \
        --attempts 100000 \
        --refinements 1200 \
        --limit 0 \
        --min-span 0.55 \
        --frame-margin 0.05 \
        --figure-room-x 0.09 \
        --figure-room-y 0.09 \
        --center-tolerance-x 0.13 \
        --center-tolerance-y 0.13 \
        --rotation-limit-deg 35 \
        --qa-per-template 8 \
        --output "$OUTPUT"

    "$PYTHON" tools/constellations/verify_bright_centered_matches_v8.py \
        --report "$OUTPUT/matches-v8.json"

    "$PYTHON" - "$OUTPUT/matches-v8.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert len(data['images']) == 6
counts = {}
for name, image in sorted(data['images'].items()):
    assert set(image['matches']) == {'Ori'}
    matches = image['matches']['Ori']
    counts[name] = len(matches)
    for match in matches:
        assert len(match['star_ids']) == 18
        assert len(match['vertices']) == 18
        assert len(match['edges']) == 18
        assert len(set(match['star_ids'])) == 18
print('ORION BOW MATCH COUNTS:', counts)
if sum(counts.values()) == 0:
    raise SystemExit('No acceptable Orion bow matches found. Broaden '
                     'search budget if necessary, but do NOT relax hard geometry.')
PY

    if [[ -f "$V6" ]]; then
        "$PYTHON" tools/constellations/compare_brightness_v8.py \
            --v6 "$V6" \
            --v8 "$OUTPUT/matches-v8.json" \
            --output "$OUTPUT/orion-bow-v6-v8-comparison.json"
    fi

    echo
    echo "PASS: updated Orion with bow independently verified on six backgrounds."
    echo "MATCHES: $OUTPUT/matches-v8.json"
    echo "PREVIEWS: $OUTPUT/<background>/qa/Ori/"
)
