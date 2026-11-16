#!/usr/bin/env bash
# Fetch Mellon's persistent, metadata-only microphone diagnostics from the TV.
set -euo pipefail

TV="${TV:-192.168.68.105:5555}"
PKG="dev.mellon.tvprobe"
OUTDIR="${OUTDIR:-$HOME/mellon-tv-audit}"
mkdir -p "$OUTDIR"

STATE="$(adb -s "$TV" get-state 2>&1 || true)"
if [[ "$STATE" != "device" ]]; then
  echo "TV is not connected/authorized: $STATE" >&2
  echo "Try: adb connect '$TV'" >&2
  exit 1
fi

DEST="$OUTDIR/mellon-tv-probe-$(date +%Y%m%d-%H%M%S).log"
TEMP="$(mktemp "$OUTDIR/.mellon-tv-probe.XXXXXXXX")"
trap 'rm -f "$TEMP"' EXIT

# Debug APKs can read their own sandbox through run-as, without root or
# shared/external storage permissions. Does not record or export audio.
if ! adb -s "$TV" exec-out run-as "$PKG" cat files/mellon-tv-probe.log > "$TEMP"; then
  echo "Unable to fetch probe log. Confirm the debug APK is installed." >&2
  exit 1
fi

if [[ ! -s "$TEMP" ]] || ! grep -q 'NEW APP SESSION' "$TEMP"; then
  echo "No Mellon probe events found yet. Launch the app and start a test first." >&2
  exit 1
fi

mv -f "$TEMP" "$DEST"
echo "Fetched: $DEST"
echo "Lines: $(wc -l < "$DEST")"
echo "Last events:"
tail -n 8 "$DEST"
