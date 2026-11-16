#!/usr/bin/env bash
# Install Vosk's official small English model into the debug Android app's private
# directory over an authenticated ADB connection. Never stores microphone audio.
set -euo pipefail

TV="${TV:-192.168.68.105:5555}"
PKG="dev.mellon.tvprobe"
MODEL="vosk-model-small-en-us-0.15"
SHA256="30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498"
URL="https://alphacephei.com/vosk/models/$MODEL.zip"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/mellon-tv/vosk"
ZIP="$CACHE/$MODEL.zip"

mkdir -p "$CACHE"
STATE="$(adb -s "$TV" get-state 2>&1 || true)"
[[ "$STATE" == "device" ]] || { echo "ADB $TV unavailable: $STATE" >&2; exit 1; }

echo "========== CHECK DEBUG APP =========="
adb -s "$TV" shell run-as "$PKG" pwd

echo "========== DOWNLOAD OFFICIAL VOSK MODEL =========="
if [[ ! -s "$ZIP" ]]; then
    curl --fail --location --retry 3 --connect-timeout 20 --output "$ZIP" "$URL"
fi
echo "$SHA256  $ZIP" | sha256sum --check

echo "========== UNPACK VERIFIED MODEL LOCALLY =========="
if [[ ! -f "$CACHE/$MODEL/am/final.mdl" ]]; then
    unzip -q -o "$ZIP" -d "$CACHE"
fi
test -f "$CACHE/$MODEL/am/final.mdl"
test -d "$CACHE/$MODEL/conf"

echo "========== TRANSFER MODEL TO PRIVATE APP STORAGE =========="
# Using adb exec-in (not 'shell') preserves binary tar bytes. The model stays
# in the debug app's private files directory, without Android storage grants.
adb -s "$TV" shell run-as "$PKG" mkdir -p files
tar -C "$CACHE" -cf - "$MODEL" |
    adb -s "$TV" exec-in run-as "$PKG" tar -xf - -C files

echo "========== VERIFY ON TELEVISION =========="
adb -s "$TV" shell run-as "$PKG" ls "files/$MODEL/am/final.mdl"
echo "Model installed. Launch Mellon and select START OFFLINE WORD TEST."
