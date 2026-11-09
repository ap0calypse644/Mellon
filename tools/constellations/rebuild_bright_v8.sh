#!/usr/bin/env bash
# MELLON v8 — full brightness-aware constellation library rebuild.
# OFFLINE ONLY: never installs a GNOME extension or modifies the guest VM.
# Safe to invoke from the interactive zsh shell as:
#     bash tools/constellations/rebuild_bright_v8.sh
(
    set -euo pipefail

    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    ROOT="$(cd -- "$HERE/../.." && pwd)"
    cd "$ROOT"

    PYTHON="$HOME/.local/share/mellon-constellations-venv/bin/python"
    OUTPUT="$HOME/VMs/Mellon/constellation-benchmark-v8-bright"
    V6="$HOME/VMs/Mellon/constellation-benchmark-v6-centered/matches-v6.json"

    if [[ ! -x "$PYTHON" ]]; then
        echo "ERROR: missing existing constellation Python environment: $PYTHON" >&2
        exit 1
    fi
    if [[ ! -f assets/starfield/corpus-v1/catalogs/blue-gold-nebula/stars-all.json ]]; then
        echo "ERROR: run this script from the full Mellon checkout." >&2
        exit 1
    fi
    if [[ ! -f tools/constellations/templates-v3.json ]]; then
        echo "ERROR: constellation templates are missing." >&2
        exit 1
    fi

    echo 'MELLON v8 // BRIGHT-STAR PREFERENCE // OFFLINE ONLY'
    echo 'Preserving v6: source coordinates, geometry, center, artwork margin.'
    echo 'Full corpus: 6 backgrounds x 31 templates; 100000 proposals and'
    echo 'up to 1200 refinements per image/template. No artificial match limit.'
    echo

    "$PYTHON" tools/constellations/test_bright_v8.py

    "$PYTHON" tools/constellations/match_bright_centered_constellations_v8.py \
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
        --qa-per-template 3 \
        --output "$OUTPUT"

    "$PYTHON" tools/constellations/verify_bright_centered_matches_v8.py \
        --report "$OUTPUT/matches-v8.json"

    if [[ -f "$V6" ]]; then
        "$PYTHON" tools/constellations/compare_brightness_v8.py \
            --v6 "$V6" \
            --v8 "$OUTPUT/matches-v8.json" \
            --output "$OUTPUT/brightness-comparison-v6-v8.json"
    else
        echo "NOTE: v6 baseline report absent. New library verified, but no comparison run."
    fi

    echo
    echo 'PASS: brightness-aware library reconstructed and independently validated.'
    echo "LIBRARY: $OUTPUT/matches-v8.json"
    echo "QA PREVIEWS: $OUTPUT/<background>/qa/<constellation>/"
    if [[ -f "$OUTPUT/brightness-comparison-v6-v8.json" ]]; then
        echo "COMPARISON: $OUTPUT/brightness-comparison-v6-v8.json"
    fi
)
