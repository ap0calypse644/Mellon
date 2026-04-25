#!/usr/bin/env bash
set -euo pipefail

UUID="mellon@nibir.local"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

gnome-extensions disable "$UUID" || true
rm -rf "$DEST_DIR"

echo "Removed $UUID"
echo "Log out and log back in to fully reset GNOME Shell state."
