#!/usr/bin/env bash
# M3 emergency rollback: recover the previously verified Sony BF1 dream defaults.
# This deliberately restores only the two known DreamService selection keys;
# it never resets the TV or changes unrelated settings.
set -euo pipefail

TV="${TV:-192.168.68.105:5555}"
ORIGINAL="com.google.android.apps.tv.dreamx/.service.Backdrop"
MELLON="dev.mellon.tvprobe/.MellonDreamService"

echo "========== CONNECT TO BRAVIA =========="
adb connect "$TV" || true
STATE="$(adb -s "$TV" get-state 2>&1 || true)"
if [[ "$STATE" != "device" ]]; then
  echo "ADB unavailable ($STATE). Wake the TV and retry this rollback." >&2
  exit 1
fi

echo "========== INSPECT DREAM SETTINGS =========="
CURRENT="$(adb -s "$TV" shell settings get secure screensaver_components | tr -d '\r')"
DEFAULT="$(adb -s "$TV" shell settings get secure screensaver_default_component | tr -d '\r')"
echo "Components: $CURRENT"
echo "Default:    $DEFAULT"
if [[ "$CURRENT" != "$MELLON" && "$CURRENT" != "$ORIGINAL" ]]; then
  echo "Unexpected current screensaver. Refusing to overwrite an unknown user choice." >&2
  exit 1
fi
if [[ "$DEFAULT" != "$ORIGINAL" ]]; then
  echo "Unexpected default screensaver. Refusing to overwrite an unknown user choice." >&2
  exit 1
fi

echo "========== RESTORE SONY SCREENSAVER =========="
adb -s "$TV" shell settings put secure screensaver_components "$ORIGINAL"
RESTORED="$(adb -s "$TV" shell settings get secure screensaver_components | tr -d '\r')"
if [[ "$RESTORED" != "$ORIGINAL" ]]; then
  echo "RESTORATION FAILED: $RESTORED" >&2
  exit 1
fi

# Home exits a test dream even when the app's Back handler fails. Sending Home
# is safe here: it does not change the default launcher or the dream settings.
adb -s "$TV" shell input keyevent 3 || true

echo "PASS: Sony Backdrop screensaver restored"
echo "Default remains: $DEFAULT"
