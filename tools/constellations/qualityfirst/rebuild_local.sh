#!/usr/bin/env bash
# Mellon v9 — quality-first offline constellation database rebuild.
# All work is done locally on BlackPearl; no VM, GNOME or source catalog edits.
# Running this script is intentionally compute-intensive. It is NOT launched
# by GitHub Actions or by the assistant. Shell state stays isolated.
(
    set -euo pipefail
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    ROOT="$(cd -- "$HERE/../.." && pwd)"
    cd "$ROOT"

    PYTHON="${PYTHON:-$HOME/.local/share/mellon-constellations-venv/bin/python}"
    ATTEMPTS_PER_TEMPLATE="${ATTEMPTS_PER_TEMPLATE:-1000000}"
    SCENES_PER_BACKGROUND="${SCENES_PER_BACKGROUND:-6}"
    WORKERS="${WORKERS:-$(($(nproc) > 2 ? $(nproc) - 2 : 1))}"
    SEED="${SEED:-20261110}"
    OUTPUT="${OUTPUT:-$HOME/VMs/Mellon/qualityfirst-v9-$(date +%Y%m%d-%H%M%S)}"

    if [[ ! -x "$PYTHON" ]]; then
        echo "Missing existing Mellon Python environment: $PYTHON" >&2
        exit 1
    fi
    if ! command -v go >/dev/null 2>&1; then
        echo 'Go toolchain is required (Go >= 1.23).' >&2
        exit 1
    fi
    if [[ -e "$OUTPUT" ]]; then
        echo "Output already exists (refusing to overwrite it): $OUTPUT" >&2
        echo 'Set OUTPUT to a fresh directory and rerun.' >&2
        exit 1
    fi
    case "$OUTPUT" in
        "$HOME/VMs/Mellon/"*) ;;
        *) echo "For safety OUTPUT must be under $HOME/VMs/Mellon/" >&2; exit 1 ;;
    esac
    mkdir -p "$OUTPUT"

    echo "MELLON QUALITY-FIRST v9 — OFFLINE LOCAL BUILD"
    echo "Output: $OUTPUT"
    echo "Parallel Go workers: $WORKERS"
    echo "Attempts per image/template: $ATTEMPTS_PER_TEMPLATE"
    echo "Maximum review scenes per background: $SCENES_PER_BACKGROUND"
    echo "Source catalogs and GNOME M5.4 are READ-ONLY."
    echo

    echo '=== PREPARE REAL STAR CATALOGUES AND V4 ORION BOW ==='
    "$PYTHON" tools/constellations/verify_orion_bow_v4.py
    "$PYTHON" tools/constellations/qualityfirst/prepare_catalog.py \
        --output "$OUTPUT/prepared-catalog.json"

    echo '=== COMPILE AND UNIT TEST PARALLEL GO SOLVER ==='
    go -C tools/constellations/qualityfirst/go test ./...
    go -C tools/constellations/qualityfirst/go build \
        -o "$OUTPUT/mellon-quality" .

    echo '=== MULTI-MILLION LOCAL QUALITY SEARCH ==='
    echo "All stdout will also be saved to $OUTPUT/search.log"
    # The Go process is foreground, not a persistent background service.
    # nice reduces interference with the laptop UI during the long search.
    nice -n 5 "$OUTPUT/mellon-quality" \
        -input "$OUTPUT/prepared-catalog.json" \
        -output "$OUTPUT/matches-v9.json" \
        -attempts-per-template "$ATTEMPTS_PER_TEMPLATE" \
        -workers "$WORKERS" \
        -scenes-per-background "$SCENES_PER_BACKGROUND" \
        -seed "$SEED" 2>&1 | tee "$OUTPUT/search.log"

    echo '=== INDEPENDENT SOURCE-STAR AND GEOMETRIC VERIFICATION ==='
    "$PYTHON" tools/constellations/qualityfirst/verify_results.py \
        --input "$OUTPUT/prepared-catalog.json" \
        --matches "$OUTPUT/matches-v9.json"

    echo '=== SUBTLE PIXEL-LEVEL COLOUR-PRESERVING QA ==='
    "$PYTHON" tools/constellations/qualityfirst/render_review.py \
        --input "$OUTPUT/prepared-catalog.json" \
        --matches "$OUTPUT/matches-v9.json" \
        --output "$OUTPUT/review"

    echo
    echo "PASS: full local quality-first database and QA generated."
    echo "Database: $OUTPUT/matches-v9.json"
    echo "Visual review: $OUTPUT/review/"
    echo "Search log: $OUTPUT/search.log"
    echo "This did NOT install anything in GNOME or the test VM."
)
