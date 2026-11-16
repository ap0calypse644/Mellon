# Mellon TV — Microphone Probe (M1)

An isolated Android TV diagnostic application built for the Sony BRAVIA BF1 (Android 12, API 31). It tests whether a third-party app can capture voice-remote audio before we invest in a full Mellon screensaver.

## What this does

- Lists audio input devices and microphone descriptors visible to a normal application.
- Requests RECORD_AUDIO permission when START MIC TEST is selected.
- Attempts 16 kHz mono PCM AudioRecord capture and shows live RMS / dBFS levels, the active route and whether the client is silenced.
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
2. Select START MIC TEST and grant permission.
3. Speak towards the TV without pressing any remote button; note the signal.
4. Hold the remote's microphone button and speak; watch whether Assistant opens or recording is silenced.
5. Select STOP.
6. Collect metadata-only logs:

```bash
adb -s 192.168.68.105:5555 logcat -d -s MellonMicProbe:I '*:S' > mellon-tv-mic-probe.log
```

## Interpretation and limitations

AudioDeviceInfo entries, MIC routes, or a successful AudioRecord initialization **do not** establish that the Sony remote delivers audio to third-party apps. Confirm non-zero signal during the intended test and rule out TV built-in microphone pickup. Google Assistant may interrupt or silence the probe. Some remotes require button-held activation, or route capture exclusively to vendor software.

This first commit is source-reviewed but **has not been compiled or run on the user's TV**. Do not assume the APK builds until the first device-side build test passes.

The Ubuntu Mellon implementation is unchanged; this branch isolates the TV experiment.
