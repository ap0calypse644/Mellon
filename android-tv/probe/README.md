# Mellon TV — Microphone Probe (M1)

An isolated Android TV diagnostic application built for the Sony BRAVIA BF1 (Android 12, API 31). It tests whether a third-party app can capture voice-remote audio before we invest in a full Mellon screensaver.

## What this does

- Lists audio input devices and microphone descriptors visible to a normal application.
- Requests RECORD_AUDIO permission when START MIC TEST is selected.
- Attempts 16 kHz mono PCM AudioRecord capture and shows live RMS / dBFS levels, nonzero sample counts, the active route and whether the client is silenced.
- Supports MIC, VOICE_RECOGNITION, VOICE_COMMUNICATION and UNPROCESSED audio sources. Switch sources while stopped.
- Logs Activity onResume/onPause and window focus, to help identify when Google Assistant preempts the foreground app.
- Logs remote key events **only when Android delivers them to the activity**.
- Never saves samples, transcribes speech, sends network requests, or changes TV system configuration.

## Hardware baseline

- Sony BRAVIA BF1, Android TV 12 (API 31)
- MediaTek mt5896, four ARMv7 CPU cores
- 32-bit Android only: armeabi-v7a
- Approx. 2.34 GiB RAM, physical 3840 × 2160, 1920 × 1080 size override
- Remote input: SONY TV VRC 001
- Default dream component: com.google.android.apps.tv.dreamx/.service.Backdrop
- Authenticated ADB via 192.168.68.105:5555

## Setup and deployment (BlackPearl, Ubuntu)

From this folder, run:
```bash
bash scripts/setup-android-sdk.sh
bash scripts/build-and-deploy.sh
```

The one-time setup installs JDK 21 and a user-owned Android SDK at `~/Android/Sdk` (command-line tools, Android API 35, Build Tools 35). Google command-line tools are SHA-256-verified. The build script obtains a checksum-verified Gradle 8.13 distribution and creates a local Gradle wrapper; it uses Android Gradle Plugin 8.13.2 and Kotlin 2.2.21. No system Gradle or standalone Kotlin compiler needed.

Override the serial with `TV=192.168.x.y:5555 bash scripts/build-and-deploy.sh`.

## Test procedure

1. Open Mellon TV Probe and choose REFRESH DEVICES.
2. Select START MIC TEST and grant permission, using the default MIC source.
3. Speak towards the TV without pressing any remote button; note the signal.
4. Hold the remote's microphone button and speak; watch whether Assistant opens or recording is silenced.
5. Select STOP. Select SOURCE until VOICE_RECOGNITION is selected; repeat steps 2–4.
6. Optionally repeat with VOICE_COMMUNICATION and UNPROCESSED. Stop before switching sources.
7. Collect metadata-only logs:

```bash
adb -s 192.168.68.105:5555 logcat -d -s MellonMicProbe:I '*:S' > mellon-tv-mic-probe.log
```

## Interpretation and limitations

AudioDeviceInfo entries, MIC routes, or a successful AudioRecord initialization **do not** establish that the Sony remote delivers audio to third-party apps. Confirm non-zero signal during the intended test and rule out TV built-in microphone pickup. Google Assistant may interrupt or silence the probe. Some remotes require button-held activation, or route capture exclusively to vendor software.

Initial MIC-only version compiled and deployed successfully on the Sony BRAVIA BF1. A test on 2026-11-16 returned zero audio samples throughout: at first Android reported `silenced=false`, then `silenced=true`. That does not prove third-party microphone access is prohibited, because the Bluetooth remote may transmit only during Assistant sessions and the app may lose foreground priority. The multi-source/lifecycle diagnostic update has **not yet been compiled or tested** on the TV.

The Ubuntu Mellon implementation is unchanged; this branch isolates the TV experiment.
