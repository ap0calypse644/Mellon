#!/usr/bin/env bash
# MELLON quality-first v9 // OFFLINE on BlackPearl // NO GNOME changes.
# Paste or execute safely from zsh: bash tools/constellations/rebuild_quality_v9.sh
(
    set -euo pipefail

    ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
    cd "$ROOT"

    MATCHER="$ROOT/tools/constellations/quality-v9"
    OUTPUT="${MELLON_QUALITY_OUTPUT:-$HOME/VMs/Mellon/constellation-quality-v9}"
    BIN="$HOME/.local/bin/mellon-constellation-quality-v9"
    WORKERS="${MELLON_QUALITY_WORKERS:-8}"
    mkdir -p "$(dirname -- "$BIN")" "$OUTPUT"

    if ! command -v go >/dev/null 2>&1; then
        echo 'ERROR: Go is missing from PATH. BlackPearl Go 1.27+ is expected.' >&2
        exit 1
    fi
    echo '========== GO TOOLCHAIN =========='
    go version

    echo
    echo '========== SYNTHETIC UNIT TESTS (NO IMAGE SEARCH) =========='
    (
        cd "$MATCHER"
        GOTOOLCHAIN=local go test -count=1 ./...
    )

    echo
    echo '========== BUILD GO MATCHER LOCALLY =========='
    (
        cd "$MATCHER"
        GOTOOLCHAIN=local go build -trimpath -o "$BIN" .
    )
    test -x "$BIN"

    echo
    echo '========== QUALITY-FIRST SIX-IMAGE LIBRARY REBUILD =========='
    echo 'Unchanged source pixels/catalogs/geometry; six backgrounds x 31 templates.'
    echo '1000000 random placements and 4000 costly refinements per combination.'
    echo 'Eight best DIFFERENT constellations per background.'
    echo 'Checkpoints allow resuming after interruptions; no source image edits.'
    echo

    "$BIN" \
        --corpus "$ROOT/assets/starfield/corpus-v1/catalogs" \
        --templates "$ROOT/tools/constellations/templates-v4-orion-bow.json" \
        --out "$OUTPUT" \
        --attempts 1000000 \
        --refine 4000 \
        --workers "$WORKERS" \
        --per-background 8 \
        --candidates-per-template 5 \
        "$@"

    echo
    echo '========== INDEPENDENT NO-SEARCH DATABASE VERIFICATION =========='
    "$BIN" \
        --corpus "$ROOT/assets/starfield/corpus-v1/catalogs" \
        --templates "$ROOT/tools/constellations/templates-v4-orion-bow.json" \
        --out "$OUTPUT" \
        --verify-only

    echo
    echo "PASS: $OUTPUT/matches-v9.json"
    echo "QA IMAGES: $OUTPUT/qa/"
    echo "QA INDEX: $OUTPUT/qa-index.json"
    echo 'M5.4 and all original photo/star-catalog files are unchanged.'
)
