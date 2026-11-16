#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TV="${TV:-192.168.68.105:5555}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

# setup-gradle-wrapper.sh downloads and SHA-256-verifies Gradle 8.13 before
# generating a wrapper. Reuse that local installation for builds: otherwise
# ./gradlew needlessly downloads the same distribution a second time.
GRADLE="$ROOT/.local/gradle-bootstrap/gradle-8.13/bin/gradle"
if [[ ! -x "$GRADLE" ]]; then
  echo "========== BOOTSTRAP GRADLE 8.13 =========="
  bash "$ROOT/scripts/setup-gradle-wrapper.sh"
fi
if [[ ! -x "$GRADLE" ]]; then
  echo "Missing Gradle 8.13 at $GRADLE" >&2
  echo "Re-run scripts/setup-gradle-wrapper.sh and inspect its output." >&2
  exit 1
fi

echo "========== VERIFY TV ADB =========="
STATE="$(adb -s "$TV" get-state 2>&1 || true)"
if [[ "$STATE" != "device" ]]; then
  echo "TV $TV is not online/authorized (ADB: $STATE)." >&2
  echo "Wake TV, then run: adb disconnect '$TV'; adb connect '$TV'" >&2
  exit 1
fi

cd "$ROOT"
echo "========== BUILD WITH CACHED GRADLE 8.13 =========="
"$GRADLE" --no-daemon :app:assembleDebug

APK="$ROOT/app/build/outputs/apk/debug/app-debug.apk"
test -f "$APK"
echo "========== DEPLOY TO TV =========="
adb -s "$TV" install -r "$APK"
adb -s "$TV" shell am start -n dev.mellon.tvprobe/.MainActivity
echo
printf 'APK: %s\nDevice: %s\n' "$APK" "$TV"
echo "Logs: adb -s $TV logcat -s MellonMicProbe:I '*:S'"
