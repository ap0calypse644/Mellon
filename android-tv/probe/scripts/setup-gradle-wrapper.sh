#!/usr/bin/env bash
# Bootstrap a pinned Gradle wrapper without a system-wide Gradle install.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="8.13"
if [[ -f "$ROOT/gradlew" && -f "$ROOT/gradle/wrapper/gradle-wrapper.jar" ]]; then
  echo "Existing Gradle wrapper found"
  exit 0
fi
CACHE="$ROOT/.local/gradle-bootstrap"
mkdir -p "$CACHE"
ZIP="$CACHE/gradle-${VERSION}-bin.zip"
if [[ ! -s "$ZIP" ]]; then
  curl -fL --retry 3 "https://services.gradle.org/distributions/gradle-${VERSION}-bin.zip" -o "$ZIP"
fi
curl -fL --retry 3 "https://services.gradle.org/distributions/gradle-${VERSION}-bin.zip.sha256" -o "$ZIP.sha256"
EXPECTED="$(awk '{print $1}' "$ZIP.sha256")"
echo "$EXPECTED  $ZIP" | sha256sum -c -
if [[ ! -x "$CACHE/gradle-${VERSION}/bin/gradle" ]]; then
  unzip -q -o "$ZIP" -d "$CACHE"
fi
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
"$CACHE/gradle-${VERSION}/bin/gradle" --no-daemon -p "$TEMP" wrapper --gradle-version "$VERSION" --distribution-type bin
mkdir -p "$ROOT/gradle"
cp -r "$TEMP/gradle/wrapper" "$ROOT/gradle/"
cp "$TEMP/gradlew" "$ROOT/gradlew"
cp "$TEMP/gradlew.bat" "$ROOT/gradlew.bat"
chmod +x "$ROOT/gradlew"
echo "Gradle wrapper ready: $ROOT/gradlew"
