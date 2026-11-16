#!/usr/bin/env bash
# Fetch the dedicated dream-mode diagnostic log from private app storage.
set -euo pipefail

TV="${TV:-192.168.68.105:5555}"
OUTDIR="${OUTDIR:-$HOME/mellon-tv-audit}"
PKG="dev.mellon.tvprobe"
mkdir -p "$OUTDIR"

STATE="$(adb -s "$TV" get-state 2>&1 || true)"
[[ "$STATE" == "device" ]] || { echo "ADB unavailable: $STATE" >&2; exit 1; }

DEST="$OUTDIR/mellon-tv-dream-$(date +%Y%m%d-%H%M%S).log"
TMP="$(mktemp "$OUTDIR/.dream.XXXXXXXX")"
trap 'rm -f "$TMP"' EXIT

if ! adb -s "$TV" exec-out run-as "$PKG" cat files/mellon-tv-dream.log > "$TMP"; then
  echo "No dream log yet; the dream may not have been started." >&2
  exit 1
fi
[[ -s "$TMP" ]] || { echo "Dream log is empty." >&2; exit 1; }

mv "$TMP" "$DEST"
echo "Fetched: $DEST"
echo "Lines: $(wc -l < "$DEST")"
tail -n 20 "$DEST"
