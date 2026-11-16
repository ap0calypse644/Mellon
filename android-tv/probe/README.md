# Mellon TV — Microphone Probe (M1)

An isolated Android TV diagnostic application built for the Sony BRAVIA BF1 (Android 12, API 31). It tests whether a third-party app can capture voice-remote audio before we invest in a full Mellon screensaver.

## What this does

- Lists audio input devices and microphone descriptors visible to a normal application.
- Requests RECORD_AUDIO permission when START MIC TEST is selected.
- Attempts 16 kHz mono PCM AudioRecord capture for at most **30 seconds** and shows live RMS / dBFS levels, nonzero sample counts, the active route and whether the client is silenced.
- Flushes each diagnostic event immediately to a persistent file in the app's private storage, including events when the app is paused, stopped or loses focus to Google Assistant. The file survives regular app exit and debug APK updates; abrupt process death may truncate only the last in-flight write.
- Logs zero-byte reads as well as audio levels, so loss of readable microphone input remains visible in the report.
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

1. Open Mellon TV Probe and select REFRESH DEVICES.
2. Select START MIC TEST and grant permission (the default source is MIC). The test **automatically stops after 30 seconds**.
3. Speak towards the television without touching the remote. Then press the Sony remote's microphone button and speak; Google Assistant is expected to take over on this model.
4. You **do not have to return to Mellon or press STOP**. If the app remains alive, it continues collecting metadata until its 30-second deadline; Android may silence the microphone or terminate background activity sooner. Everything successfully flushed before termination is retained.
5. On BlackPearl, retrieve the report from the TV with:

```bash
bash scripts/fetch-logs.sh
```

This saves a timestamped report under `~/mellon-tv-audit/mellon-tv-probe-YYYYmmdd-HHMMSS.log`. It uses `adb exec-out run-as dev.mellon.tvprobe cat files/mellon-tv-probe.log` with the **debug** APK—no root, external storage permission or manual navigation on the TV required.

6. To investigate another audio source, relaunch the app via `adb shell am start -n dev.mellon.tvprobe/.MainActivity`, select SOURCE until VOICE_RECOGNITION is shown, and repeat. VOICE_COMMUNICATION and UNPROCESSED can be tested the same way. Old reports are appended to the same TV file with a NEW APP SESSION separator; local fetches are separate timestamped snapshots.

Alternatively, monitor live Logcat via `adb -s 192.168.68.105:5555 logcat -s MellonMicProbe:I '*:S'`.

**Note:** Background microphone capture is not guaranteed by Android. The persistent log is specifically designed to retain the last evidence before Assistant steals focus, Android silences capture or the process exits.

## M2: offline word-recognition experiment

The **VOICE_RECOGNITION** audio source showed a clear level increase during a controlled silence → speaking → silence test (2026-11-16, muted TV). This is evidence that speech-correlated sound reaches the virtual `remote-submix` input, **not yet evidence that it contains intelligible words**.

A deliberately opt-in, offline speech-recognition experiment now lets us test this without saving raw audio:

1. Pull the latest `feature/android-tv-mic-probe` branch, then deploy with `bash scripts/build-and-deploy.sh`.
2. Run `bash scripts/install-vosk-model.sh` once to download an official, SHA-256-verified Vosk small US English model (~40 MB compressed) and transfer it into the debug app's private files directory over ADB. **No root or Sony system changes.**
3. On the TV, mute playback, then select **START OFFLINE WORD TEST**. It automatically selects `VOICE_RECOGNITION`; the source selector is only for the older microphone diagnostic mode.
4. After the model loads, speak a short known phrase such as "one two three four five", then "open the door" and "Mellon" without pressing the remote microphone button. Continue for at most 30 seconds; it will stop itself.
5. Run `bash scripts/fetch-logs.sh` and inspect `OFFLINE PARTIAL TEXT:` / `OFFLINE FINAL TEXT:` entries, including any failure reasons.

**Privacy:** the explicit offline word test *does* save recognized text to the private diagnostic log; it does **not** save audio, send voice to a network service, or contact Google Assistant. The model is downloaded on BlackPearl once and used fully offline on the TV after installation. Do not speak private information during this test. No word recognition runs when the test is idle. Debug files can be read with `adb exec-out run-as`.

**Performance:** Vosk's small models use roughly 300 MB of RAM at runtime; Sony's ARMv7 chipset is memory-constrained, so loading/decoding may be slow. The test is bounded to 30 seconds and the model is released when it stops.

**Limitations:** this is a proof of audio intelligibility, not the production "Mellon" unlock system. A generic English recognizer may spell the name as "melon" or a similar word. Validate basic phrases first, then test the Tolkien name. Do not use raw transcript matches as a security gate.

## Interpretation and limitations

AudioDeviceInfo entries, MIC routes, or a successful AudioRecord initialization **do not** establish that the Sony remote delivers audio to third-party apps. Confirm non-zero signal during the intended test and rule out TV built-in microphone pickup. Google Assistant may interrupt or silence the probe. Some remotes require button-held activation, or route capture exclusively to vendor software.

Initial MIC-only version compiled and deployed successfully on the Sony BRAVIA BF1. A test on 2026-11-16 returned zero audio samples throughout: at first Android reported `silenced=false`, then `silenced=true`. That does not prove third-party microphone access is prohibited, because the Bluetooth remote may transmit only during Assistant sessions and the app may lose foreground priority. The persistent-log/30-second auto-stop update compiled, deployed, and recorded the 09:50–09:51 controlled experiment on the TV. The new **M2 offline Vosk word-recognition code has not yet been compiled or tested** on this device.

The Ubuntu Mellon implementation is unchanged; this branch isolates the TV experiment.
