#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TV="${TV:-192.168.68.105:5555}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
if [[ ! -x "$ROOT/gradlew" ]]; then
  bash "$ROOT/scripts/setup-gradle-wrapper.sh"
fi
adb -s "$TV" get-state | grep -qx 'device' || { echo "ADB target is not authorized" >&2; exit 1; }
cd "$ROOT"
./gradlew --no-daemon :app:assembleDebug
APK="$ROOT/app/build/outputs/apk/debug/app-debug.apk"
adb -s "$TV" install -r "$APK"
adb -s "$TV" shell am start -n dev.mellon.tvprobe/.MainActivity
echo
printf 'APK: %s\nDevice: %s\n' "$APK" "$TV"
echo "Logs: adb -s $TV logcat -s MellonMicProbe:I '*:S'"
