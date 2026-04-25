#!/usr/bin/env bash
set -euo pipefail

UUID="mellon@nibir.local"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

mkdir -p "$(dirname "$DEST_DIR")"
rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"
cp "$SRC_DIR"/metadata.json "$SRC_DIR"/extension.js "$SRC_DIR"/stylesheet.css "$DEST_DIR"/

gnome-extensions enable "$UUID" || true

echo "Installed $UUID to $DEST_DIR"
echo "Log out and log back in, then lock the screen."
echo "Debug logs: journalctl /usr/bin/gnome-shell -f"
