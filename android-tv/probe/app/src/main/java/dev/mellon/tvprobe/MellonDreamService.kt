package dev.mellon.tvprobe

import android.app.ActivityManager
import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.service.dreams.DreamService
import android.util.Log
import android.view.KeyEvent
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

/**
 * M3 laboratory dream: tests whether an Android TV DreamService can use the
 * same offline speech path as the foreground Activity. No default dream
 * settings are modified by installing this service.
 *
 * This deliberately does not unlock on a keyword yet. An explicit remote
 * Back or DPAD_CENTER event finishes the dream as an emergency exit.
 */
class MellonDreamService : DreamService() {
    private val tag = "MellonDream"
    private val mainHandler = Handler(Looper.getMainLooper())
    private val fileLock = Any()
    private val logfile = "mellon-tv-dream.log"
    private val modelDirectory = "vosk-model-small-en-us-0.15"
    private val grammar = """["melon", "mellon", "hello", "yellow", "[unk]"]"""

    @Volatile private var active = false
    @Volatile private var audioRecord: AudioRecord? = null
    private var worker: Thread? = null
    private var statusText: TextView? = null

    private fun event(message: String) {
        val clock = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS Z", Locale.US).format(Date())
        val line = "$clock | ${SystemClock.elapsedRealtime()}ms | $message"
        Log.i(tag, line)
        synchronized(fileLock) {
            try {
                FileOutputStream(File(filesDir, logfile), true).use { file ->
                    file.write((line + "\n").toByteArray(Charsets.UTF_8))
                    file.flush()
                }
            } catch (e: Exception) {
                Log.e(tag, "Cannot write dream diagnostic", e)
            }
        }
    }

    private fun showStatus(message: String) {
        mainHandler.post { statusText?.text = message }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = true
        isFullscreen = true
        isScreenBright = true

        val page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setPadding(50, 50, 50, 50)
            setBackgroundColor(0xff070d18.toInt())
        }
        val heading = TextView(this).apply {
            text = "THE DOORS OF DURIN"
            textSize = 46f
            gravity = android.view.Gravity.CENTER
            setTextColor(0xffd8dbf5.toInt())
        }
        val subtitle = TextView(this).apply {
            text = "MELLON  •  ANDROID TV DREAM LAB  •  M3"
            textSize = 20f
            gravity = android.view.Gravity.CENTER
            setTextColor(0xffa5a8d4.toInt())
            setPadding(0, 32, 0, 24)
        }
        val status = TextView(this).apply {
            text = "Awaiting dream lifecycle..."
            textSize = 17f
            gravity = android.view.Gravity.CENTER
            setTextColor(0xff99e6c7.toInt())
        }
        val instructions = TextView(this).apply {
            text = "Say Mellon to test recognition. BACK or OK exits this diagnostic dream.\nNo system settings are changed automatically."
            textSize = 17f
            gravity = android.view.Gravity.CENTER
            setTextColor(0xffc2c9db.toInt())
            setPadding(0, 34, 0, 0)
        }
        page.addView(heading)
        page.addView(subtitle)
        page.addView(status)
        page.addView(instructions)
        statusText = status
        setContentView(page)
        event("DREAM onAttachedToWindow interactive=$isInteractive fullscreen=$isFullscreen")
    }

    override fun onDreamingStarted() {
        super.onDreamingStarted()
        if (active) return
        active = true
        event("DREAM onDreamingStarted PID=${android.os.Process.myPid()}")
        val processInfo = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(processInfo)
        event("DREAM PROCESS importance=${processInfo.importance} (100=foreground, 125=visible, 200=FGS, 400=cached)")
        showStatus("Loading offline recognition model...")
        worker = Thread({ captureWords() }, "mellon-dream-audio").apply { start() }
    }

    private fun captureWords() {
        var record: AudioRecord? = null
        var model: Model? = null
        var recognizer: Recognizer? = null
        try {
            val directory = File(filesDir, modelDirectory)
            if (!directory.isDirectory) {
                event("DREAM FAILURE: offline model missing from private app storage")
                showStatus("Offline model missing; BACK or OK to exit")
                return
            }
            model = Model(directory.absolutePath)
            recognizer = Recognizer(model, 16000.0f, grammar)
            if (!active) return

            val rate = 16000
            val channel = AudioFormat.CHANNEL_IN_MONO
            val encoding = AudioFormat.ENCODING_PCM_16BIT
            val minimum = AudioRecord.getMinBufferSize(rate, channel, encoding)
            if (minimum <= 0) {
                event("DREAM FAILURE: invalid AudioRecord buffer size=$minimum")
                return
            }
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val inputDevices = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)
            inputDevices.forEach { dev ->
                event("DREAM INPUT id=${dev.id} type=${dev.type} name=${dev.productName} address=${dev.address}")
            }
            record = AudioRecord.Builder()
                .setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setSampleRate(rate)
                        .setChannelMask(channel)
                        .setEncoding(encoding)
                        .build()
                )
                .setBufferSizeInBytes(max(minimum * 2, 4096))
                .build()
            if (record.state != AudioRecord.STATE_INITIALIZED) {
                event("DREAM FAILURE: AudioRecord not initialized")
                return
            }
            // Diagnostic request only: Android may refuse or route elsewhere.
            // This is not a Bluetooth-remote microphone; type 25 is a virtual
            // remote-submix input that worked during foreground Activity tests.
            val submix = inputDevices.firstOrNull { it.type == AudioDeviceInfo.TYPE_REMOTE_SUBMIX }
            if (submix != null) {
                val accepted = record.setPreferredDevice(submix)
                event("DREAM PREFERRED ROUTE requested type=25 id=${submix.id} accepted=$accepted")
            } else {
                event("DREAM PREFERRED ROUTE unavailable: no type=25 input")
            }
            record.startRecording()
            if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
                event("DREAM FAILURE: recording did not start")
                return
            }
            audioRecord = record
            event("DREAM AudioRecord STARTED source=VOICE_RECOGNITION session=${record.audioSessionId} preferred=${record.preferredDevice?.type} routed=${record.routedDevice?.type}")
            showStatus("Listening locally. Say: Mellon")

            val samples = ShortArray(2048)
            var lastStatsAt = 0L
            while (active) {
                val count = record.read(samples, 0, samples.size, AudioRecord.READ_NON_BLOCKING)
                if (count < 0) {
                    event("DREAM AudioRecord.read failed count=$count")
                    break
                }
                if (count > 0 && recognizer.acceptWaveForm(samples, count)) {
                    val recognized = JSONObject(recognizer.result).optString("text", "").trim()
                    if (recognized.isNotEmpty()) {
                        val match = recognized == "melon" || recognized == "mellon"
                        event("DREAM FINAL text=$recognized candidate=$match")
                        if (match) {
                            showStatus("MELLON RECOGNIZED — dream proof-of-concept succeeded")
                            event("DREAM KEYWORD MATCH (diagnostic only; no automatic exit)")
                        } else {
                            showStatus("Heard: $recognized — waiting for Mellon")
                        }
                    }
                }
                val now = SystemClock.elapsedRealtime()
                if (now - lastStatsAt > 1000) {
                    lastStatsAt = now
                    var sumSquares = 0.0
                    for (i in 0 until count) {
                        val sample = samples[i].toDouble() / 32768.0
                        sumSquares += sample * sample
                    }
                    val rms = if (count > 0) sqrt(sumSquares / count) else 0.0
                    val dbfs = if (rms > 0.0) 20.0 * log10(rms) else -120.0
                    val routed = record.routedDevice?.let { "${it.productName} type=${it.type}" } ?: "none"
                    val silenced = record.activeRecordingConfiguration?.isClientSilenced?.toString() ?: "unknown"
                    event("DREAM AUDIO read=$count dBFS=${"%.1f".format(Locale.US, dbfs)} silenced=$silenced routed=$routed")
                }
                if (count == 0) Thread.sleep(40)
            }
        } catch (e: Exception) {
            event("DREAM FAILURE: ${e.javaClass.simpleName}: ${e.message}")
            showStatus("Dream audio failed; BACK or OK to exit")
        } finally {
            audioRecord = null
            try { record?.stop() } catch (_: Exception) { }
            try { record?.release() } catch (_: Exception) { }
            try { recognizer?.close() } catch (_: Exception) { }
            try { model?.close() } catch (_: Exception) { }
            event("DREAM AudioRecord STOPPED")
        }
    }

    private fun stopCapture() {
        active = false
        // Non-blocking reads ensure this does not hold the UI thread.
    }

    override fun dispatchKeyEvent(keyEvent: KeyEvent): Boolean {
        val keyCode = keyEvent.keyCode
        if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_DPAD_CENTER) {
            // Consume both halves of the keypress. Finish on ACTION_UP only so
            // a long press cannot repeatedly request dismissal.
            if (keyEvent.action == KeyEvent.ACTION_UP) {
                event("DREAM emergency exit key=${KeyEvent.keyCodeToString(keyCode)}")
                wakeUp()
            }
            return true
        }
        return super.dispatchKeyEvent(keyEvent)
    }

    override fun onDreamingStopped() {
        event("DREAM onDreamingStopped")
        stopCapture()
        super.onDreamingStopped()
    }

    override fun onDetachedFromWindow() {
        event("DREAM onDetachedFromWindow")
        stopCapture()
        statusText = null
        super.onDetachedFromWindow()
    }

    override fun onDestroy() {
        event("DREAM onDestroy")
        stopCapture()
        super.onDestroy()
    }
}
