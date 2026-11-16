#!/usr/bin/env bash
# Read-only verification of Mellon DreamService registration and TV settings.
set -euo pipefail

TV="${TV:-192.168.68.105:5555}"
echo "========== ADB STATUS =========="
adb -s "$TV" get-state

echo "========== MELLON DREAM SERVICE REGISTRATION =========="
adb -s "$TV" shell dumpsys package dev.mellon.tvprobe |
  grep -E -A 5 -B 3 'MellonDreamService|android.service.dreams.DreamService' |
  head -n 45 || true

echo "========== CURRENT SONY SCREENSAVER CONFIG (READ ONLY) =========="
for key in screensaver_enabled screensaver_components screensaver_default_component; do
  printf '%s = ' "$key"
  adb -s "$TV" shell settings get secure "$key"
done

echo "========== DREAM MANAGER (READ ONLY) =========="
adb -s "$TV" shell dumpsys dreams | head -n 55 || true

echo
echo 'No TV settings have been changed.'
