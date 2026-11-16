#!/usr/bin/env bash
# M3 controlled preview: temporarily select Mellon, launch Somnambulator,
# capture diagnostics, and always restore Sony's prior screensaver setting.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TV="${TV:-192.168.68.105:5555}"
SECONDS_TO_TEST="${SECONDS_TO_TEST:-45}"
MELLON="dev.mellon.tvprobe/.MellonDreamService"
SONY="com.google.android.apps.tv.dreamx/.service.Backdrop"
BACKUP_DIR="${OUTDIR:-$HOME/mellon-tv-audit}"
mkdir -p "$BACKUP_DIR"

if ! [[ "$SECONDS_TO_TEST" =~ ^[0-9]+$ ]] ||
   (( SECONDS_TO_TEST < 15 || SECONDS_TO_TEST > 120 )); then
    echo "SECONDS_TO_TEST must be an integer from 15 to 120." >&2
    exit 1
fi

echo "========== VERIFY TV CONNECTION =========="
STATE="$(adb -s "$TV" get-state 2>&1 || true)"
[[ "$STATE" == "device" ]] || { echo "ADB not authorized/online: $STATE" >&2; exit 1; }

echo "========== VERIFY KNOWN SONY BASELINE =========="
ENABLED="$(adb -s "$TV" shell settings get secure screensaver_enabled | tr -d '\r')"
ORIGINAL_COMPONENTS="$(adb -s "$TV" shell settings get secure screensaver_components | tr -d '\r')"
ORIGINAL_DEFAULT="$(adb -s "$TV" shell settings get secure screensaver_default_component | tr -d '\r')"
printf 'enabled=%s\ncomponents=%s\ndefault=%s\n' "$ENABLED" "$ORIGINAL_COMPONENTS" "$ORIGINAL_DEFAULT"
if [[ "$ENABLED" != "1" || "$ORIGINAL_COMPONENTS" != "$SONY" || "$ORIGINAL_DEFAULT" != "$SONY" ]]; then
    echo "Screensaver settings changed since preflight; refusing temporary replacement." >&2
    exit 1
fi

echo "========== VERIFY OFFLINE MODEL =========="
adb -s "$TV" shell run-as dev.mellon.tvprobe ls files/vosk-model-small-en-us-0.15/am/final.mdl >/dev/null

echo "========== OPTIONAL M3.1 MICROPHONE FOREGROUND LEASE =========="
LEASE_STATUS="$(adb -s "$TV" shell dumpsys activity services dev.mellon.tvprobe 2>&1 || true)"
if grep -q 'DreamMicLeaseService' <<< "$LEASE_STATUS"; then
    echo "DreamMicLeaseService appears in the active-services dump."
else
    echo "NOTE: No active DreamMicLeaseService found. To test M3.1, arm the 2-minute lease from the visible Probe Activity first."
fi
adb -s "$TV" logcat -d -s MellonMicLease:I '*:S' | tail -n 12 || true

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$BACKUP_DIR/sony-dream-before-preview-$STAMP.txt"
printf 'TV=%s\noriginal_enabled=%s\noriginal_components=%s\noriginal_default=%s\n' \
    "$TV" "$ENABLED" "$ORIGINAL_COMPONENTS" "$ORIGINAL_DEFAULT" > "$BACKUP"
echo "Backup: $BACKUP"
echo "Emergency rollback: bash $ROOT/scripts/restore-sony-dream.sh"

CHANGED=0
restore() {
    local prior_exit=$?
    trap - EXIT
    if (( CHANGED != 0 )); then
        echo
        echo "========== AUTOMATIC SONY RESTORATION =========="
        # If necessary, reconnect ADB once before restoring. This branch does
        # not erase user data, change the launcher, or disable the stock dream.
        if [[ "$(adb -s "$TV" get-state 2>&1 || true)" != "device" ]]; then
            adb connect "$TV" || true
        fi
        if adb -s "$TV" shell settings put secure screensaver_components "$ORIGINAL_COMPONENTS"; then
            local result
            result="$(adb -s "$TV" shell settings get secure screensaver_components 2>/dev/null | tr -d '\r')"
            if [[ "$result" == "$ORIGINAL_COMPONENTS" ]]; then
                echo "PASS: Original Sony Backdrop screensaver restored."
            else
                echo "WARNING: could not verify restoration; run emergency rollback." >&2
                prior_exit=1
            fi
        else
            echo "WARNING: restoration command failed; run emergency rollback." >&2
            prior_exit=1
        fi
        adb -s "$TV" shell input keyevent 3 || true
        echo "Sony default: $(adb -s "$TV" shell settings get secure screensaver_default_component 2>/dev/null || true)"
        echo "Independent rollback: bash $ROOT/scripts/restore-sony-dream.sh"
    fi
    exit "$prior_exit"
}
trap restore EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo
echo "========== TEMPORARILY SELECT MELLON =========="
CHANGED=1
adb -s "$TV" shell settings put secure screensaver_components "$MELLON"
ACTIVE_SETTING="$(adb -s "$TV" shell settings get secure screensaver_components | tr -d '\r')"
if [[ "$ACTIVE_SETTING" != "$MELLON" ]]; then
    echo "Mellon selection was not applied: $ACTIVE_SETTING" >&2
    exit 1
fi
echo "Mellon temporarily selected; original DEFAULT remains Sony."

echo "========== REQUEST SCREEN SAVER VIA SYSTEMUI =========="
adb -s "$TV" shell am start -a android.intent.action.MAIN -n com.android.systemui/.Somnambulator

echo "========== DREAM MANAGER AFTER LAUNCH =========="
sleep 3
adb -s "$TV" shell dumpsys dreams | grep -E 'mCurrentDream(Name|IsTest|IsWaking)|mCurrentDream:|DreamService' | head -n 30 || true
echo
echo "TESTING FOR $SECONDS_TO_TEST seconds. Look for THE DOORS OF DURIN; say Mellon."
echo "Back or OK should exit. Home is the fallback. The script restores Sony automatically."
sleep "$SECONDS_TO_TEST"

echo "========== CAPTURE FINAL DREAM STATUS =========="
adb -s "$TV" shell dumpsys dreams | head -n 24 || true

# Diagnostics are read before the EXIT trap restores the original selection.
# This uses the debug app's own private files via run-as; never copies audio.
echo "========== FETCH PERSISTED DREAM DIAGNOSTICS =========="
bash "$ROOT/scripts/fetch-dream-logs.sh" || echo "No dream log fetched (preview may not have started)."

# The EXIT trap restores Sony and returns to Home, even on ordinary failure.
