#!/usr/bin/env bash
# Minimal Android build toolchain. Installs a user-owned SDK, leaving system ADB alone.
set -euo pipefail
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/mellon-tv"
FILENAME="commandlinetools-linux-15859902_latest.zip"
EXPECTED_SHA256="4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583"
mkdir -p "$CACHE" "$SDK/cmdline-tools"

echo '========== INSTALL BUILD PREREQUISITES =========='
sudo apt-get install -y openjdk-21-jdk-headless curl unzip ca-certificates
java -version

if [[ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]]; then
  echo '========== DOWNLOAD GOOGLE ANDROID SDK TOOLS =========='
  ZIP="$CACHE/$FILENAME"
  if [[ ! -s "$ZIP" ]]; then
    curl -fL --retry 3 "https://dl.google.com/android/repository/$FILENAME" -o "$ZIP"
  fi
  echo "$EXPECTED_SHA256  $ZIP" | sha256sum -c -
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  unzip -q -o "$ZIP" -d "$TMP"
  if [[ -e "$SDK/cmdline-tools/latest" ]]; then
    echo 'Refusing to overwrite an existing cmdline-tools/latest directory.' >&2
    exit 1
  fi
  mv "$TMP/cmdline-tools" "$SDK/cmdline-tools/latest"
fi

SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
echo '========== SDK LICENSE AGREEMENTS =========='
echo 'Review the Android SDK license terms and accept them interactively to continue.'
"$SDKMANAGER" --sdk_root="$SDK" --licenses

echo '========== INSTALL ANDROID SDK 35 =========='
"$SDKMANAGER" --sdk_root="$SDK" 'platforms;android-35' 'build-tools;35.0.0'

echo '========== VERIFY SDK =========='
"$SDKMANAGER" --sdk_root="$SDK" --version
ls -ld "$SDK/platforms/android-35" "$SDK/build-tools/35.0.0"
echo "ANDROID_HOME=$SDK"
echo 'System ADB has not been replaced.'
