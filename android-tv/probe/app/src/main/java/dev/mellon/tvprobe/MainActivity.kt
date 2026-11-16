package dev.mellon.tvprobe

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlin.math.log10
import kotlin.math.sqrt
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max

/**
 * Read-only audio diagnostic for Android TV. Uses RECORD_AUDIO permission while the user
 * explicitly starts a test. Audio samples are analysed in RAM then discarded.
 * The optional offline word and keyword tests persist recognized text only.
 * There is no networking or stored audio recording.
 */
class MainActivity : Activity() {
    private val logTag = "MellonMicProbe"
    private val permissionRequest = 101
    private val leasePermissionRequest = 102
    private val maxCaptureMs = 30_000L
    private val logFileName = "mellon-tv-probe.log"
    private val fileLock = Any()
    private lateinit var audioManager: AudioManager
    private lateinit var status: TextView
    private lateinit var eventLog: TextView
    private lateinit var startButton: Button
    private lateinit var stopButton: Button
    private lateinit var modeButton: Button
    private lateinit var wordButton: Button
    private lateinit var keywordButton: Button
    private lateinit var startLeaseButton: Button
    private lateinit var stopLeaseButton: Button
    private var requestingWordTest = false
    private var keywordTestRequested = false
    private val keywordGrammar = """["melon", "mellon", "hello", "yellow", "open the door", "[unk]"]"""
    private var loadingWordModel = false
    private val modelDirectory = "vosk-model-small-en-us-0.15"
    private val captureSources = listOf(
        "MIC" to MediaRecorder.AudioSource.MIC,
        "VOICE_RECOGNITION" to MediaRecorder.AudioSource.VOICE_RECOGNITION,
        "VOICE_COMMUNICATION" to MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        "UNPROCESSED" to MediaRecorder.AudioSource.UNPROCESSED
    )
    private var sourceIndex = 0
    private var recorder: AudioRecord? = null
    @Volatile private var capturing = false
    private var captureThread: Thread? = null
    private var logLines = mutableListOf<String>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(42, 25, 42, 25)
            setBackgroundColor(0xff0e1424.toInt())
        }
        val title = TextView(this).apply {
            text = "MELLON  /  TV MICROPHONE PROBE"
            textSize = 27f
            setTextColor(0xffc5bcff.toInt())
        }
        root.addView(title)

        val instructions = TextView(this).apply {
            text = "30-second word/keyword tests remain available. For M3.1 DreamService audio, select ARM DREAM MIC (2 MIN), then start the controlled dream preview from BlackPearl. The temporary notification ends after two minutes; STOP DREAM MIC LEASE cancels early. No audio files are stored."
            textSize = 16f
            setTextColor(0xffe0e6f2.toInt())
            setPadding(0, 12, 0, 14)
        }
        root.addView(instructions)

        val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val refreshButton = Button(this).apply { text = "REFRESH DEVICES"; setOnClickListener { enumerateDevices() } }
        modeButton = Button(this).apply {
            text = "SOURCE: MIC"
            setOnClickListener {
                if (!capturing) {
                    sourceIndex = (sourceIndex + 1) % captureSources.size
                    text = "SOURCE: ${captureSources[sourceIndex].first}"
                    event("Selected source: ${captureSources[sourceIndex].first}")
                }
            }
        }
        startButton = Button(this).apply { text = "START MIC TEST"; setOnClickListener { requestOrStart() } }
        wordButton = Button(this).apply { text = "START OFFLINE WORD TEST"; setOnClickListener { requestWordTest() } }
        keywordButton = Button(this).apply { text = "START KEYWORD TEST"; setOnClickListener { requestKeywordTest() } }
        stopButton = Button(this).apply { text = "STOP"; isEnabled = false; setOnClickListener { stopCapture() } }
        buttons.addView(refreshButton)
        buttons.addView(modeButton)
        buttons.addView(startButton)
        buttons.addView(stopButton)
        root.addView(buttons)
        val leaseButtons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        startLeaseButton = Button(this).apply {
            text = "ARM DREAM MIC (2 MIN)"
            setOnClickListener { armDreamMicLease() }
        }
        stopLeaseButton = Button(this).apply {
            text = "STOP DREAM MIC LEASE"
            setOnClickListener { stopDreamMicLease() }
        }
        leaseButtons.addView(startLeaseButton)
        leaseButtons.addView(stopLeaseButton)
        root.addView(leaseButtons)
        val offlineButtons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        offlineButtons.addView(wordButton)
        offlineButtons.addView(keywordButton)
        root.addView(offlineButtons)

        status = TextView(this).apply {
            textSize = 20f
            setTextColor(0xffb7f7da.toInt())
            text = "Status: idle"
            setPadding(0, 15, 0, 15)
        }
        root.addView(status)

        val scroll = ScrollView(this)
        eventLog = TextView(this).apply {
            textSize = 13f
            setTextColor(0xffd9e1f1.toInt())
            typeface = android.graphics.Typeface.MONOSPACE
        }
        scroll.addView(eventLog)
        root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
        refreshButton.requestFocus()

        event("===== NEW APP SESSION PID=${android.os.Process.myPid()} =====")
        event("Diagnostic file: ${File(filesDir, logFileName).absolutePath}")
        event("Offline model installed: ${File(filesDir, modelDirectory).isDirectory}")
        event("Android ${Build.VERSION.RELEASE} / API ${Build.VERSION.SDK_INT} / ${Build.MANUFACTURER} ${Build.MODEL}")
        event("Microphone hardware feature advertised: ${packageManager.hasSystemFeature(PackageManager.FEATURE_MICROPHONE)}")
        enumerateDevices()
    }

    private fun event(message: String) {
        val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS Z", Locale.US).format(Date())
        val line = "$timestamp | ${SystemClock.elapsedRealtime()}ms | $message"
        Log.i(logTag, line)
        // Flush every entry before updating the screen. This survives Assistant
        // takeover and even abrupt process death (up to the last completed write).
        synchronized(fileLock) {
            try {
                FileOutputStream(File(filesDir, logFileName), true).use { stream ->
                    stream.write((line + "\n").toByteArray(Charsets.UTF_8))
                    stream.flush()
                }
            } catch (e: Exception) {
                Log.e(logTag, "Unable to persist diagnostic event", e)
            }
        }
        runOnUiThread {
            logLines.add(line)
            if (logLines.size > 100) logLines = logLines.takeLast(100).toMutableList()
            eventLog.text = logLines.joinToString("\n")
        }
    }

    private fun enumerateDevices() {
        event("--- Input devices ---")
        val devices = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)
        if (devices.isEmpty()) event("No AudioDeviceInfo input devices reported")
        devices.forEach { d ->
            event("id=${d.id} type=${d.type} name=${d.productName} address=${d.address}")
        }
        try {
            val microphones = audioManager.microphones
            event("AudioManager.getMicrophones(): ${microphones.size} device(s)")
            microphones.forEach { mic ->
                event("mic id=${mic.id} description=${mic.description} deviceId=${mic.id} location=${mic.location}")
            }
        } catch (e: Exception) {
            event("getMicrophones failed: ${e.javaClass.simpleName}: ${e.message}")
        }
        event("RECORD_AUDIO granted: ${checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED}")
    }

    private fun armDreamMicLease() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            event("Dream microphone lease requires RECORD_AUDIO permission")
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), leasePermissionRequest)
            return
        }
        try {
            startForegroundService(Intent(this, DreamMicLeaseService::class.java))
            event("DREAM MIC LEASE requested from visible activity (expires after 120 seconds)")
        } catch (e: Exception) {
            event("DREAM MIC LEASE request failed: ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    private fun stopDreamMicLease() {
        val stopped = stopService(Intent(this, DreamMicLeaseService::class.java))
        event("DREAM MIC LEASE stop requested, serviceWasRunning=$stopped")
    }

    private fun requestOrStart() {
        if (capturing || loadingWordModel) return
        requestingWordTest = false
        keywordTestRequested = false
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            event("Requesting microphone permission")
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), permissionRequest)
        } else startCapture()
    }

    private fun requestWordTest() {
        requestOfflineTest(false)
    }

    private fun requestKeywordTest() {
        requestOfflineTest(true)
    }

    private fun requestOfflineTest(keywordMode: Boolean) {
        if (capturing || loadingWordModel) return
        requestingWordTest = true
        keywordTestRequested = keywordMode
        event("OFFLINE MODE REQUESTED: ${if (keywordMode) "KEYWORD" else "GENERAL WORD"}")
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            event("Requesting microphone permission for offline word test")
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), permissionRequest)
        } else loadWordModelAndStart()
    }

    private fun loadWordModelAndStart() {
        val dir = File(filesDir, modelDirectory)
        if (!dir.isDirectory) {
            event("WORD TEST UNAVAILABLE: model not installed. Run bash scripts/install-vosk-model.sh on BlackPearl.")
            status.text = "Offline model missing: install it from BlackPearl."
            return
        }
        loadingWordModel = true
        val keywordMode = keywordTestRequested
        wordButton.isEnabled = false
        keywordButton.isEnabled = false
        startButton.isEnabled = false
        modeButton.isEnabled = false
        status.text = "Loading offline language model..."
        event("OFFLINE WORD TEST: loading model from local storage")
        Thread({
            var model: Model? = null
            try {
                val loadedModel = Model(dir.absolutePath)
                model = loadedModel
                val recognizer = if (keywordMode) Recognizer(loadedModel, 16000.0f, keywordGrammar)
                    else Recognizer(loadedModel, 16000.0f)
                runOnUiThread {
                    if (isFinishing || isDestroyed) {
                        recognizer.close()
                        loadedModel.close()
                    } else {
                        loadingWordModel = false
                        event("OFFLINE WORD TEST: model loaded, mode=${if (keywordMode) "KEYWORD" else "GENERAL"}")
                        if (keywordMode) event("KEYWORD GRAMMAR: $keywordGrammar")
                        startCapture(recognizer, loadedModel, keywordMode)
                    }
                }
            } catch (e: Exception) {
                model?.close()
                event("OFFLINE WORD TEST FAILED: ${e.javaClass.simpleName}: ${e.message}")
                runOnUiThread {
                    loadingWordModel = false
                    status.text = "Offline model initialization failed"
                    startButton.isEnabled = true
                    wordButton.isEnabled = true
                    keywordButton.isEnabled = true
                    modeButton.isEnabled = true
                }
            }
        }, "mellon-vosk-model-loader").start()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == leasePermissionRequest) {
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
                armDreamMicLease()
            } else {
                event("Dream microphone lease RECORD_AUDIO denied")
            }
            return
        }
        if (requestCode == permissionRequest) {
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
                if (requestingWordTest) loadWordModelAndStart() else startCapture()
            } else event("RECORD_AUDIO denied")
        }
    }

    private fun startCapture(wordRecognizer: Recognizer? = null, wordModel: Model? = null, keywordMode: Boolean = false) {
        if (capturing) {
            wordRecognizer?.close()
            wordModel?.close()
            return
        }
        val wordMode = wordRecognizer != null
        val sourceName = if (wordMode) "VOICE_RECOGNITION" else captureSources[sourceIndex].first
        val audioSource = if (wordMode) MediaRecorder.AudioSource.VOICE_RECOGNITION else captureSources[sourceIndex].second
        val sampleRate = 16000
        val channelConfig = AudioFormat.CHANNEL_IN_MONO
        val encoding = AudioFormat.ENCODING_PCM_16BIT
        val minBuffer = AudioRecord.getMinBufferSize(sampleRate, channelConfig, encoding)
        if (minBuffer <= 0) {
            event("Unsupported capture configuration: getMinBufferSize=$minBuffer")
            wordRecognizer?.close()
            wordModel?.close()
            wordButton.isEnabled = true
            keywordButton.isEnabled = true
            startButton.isEnabled = true
            modeButton.isEnabled = true
            return
        }
        try {
            val record = AudioRecord.Builder()
                .setAudioSource(audioSource)
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(encoding)
                        .setSampleRate(sampleRate)
                        .setChannelMask(channelConfig)
                        .build()
                )
                .setBufferSizeInBytes(max(minBuffer * 2, 4096))
                .build()
            if (record.state != AudioRecord.STATE_INITIALIZED) {
                event("AudioRecord not initialized (state=${record.state})")
                record.release()
                return
            }
            record.startRecording()
            if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
                event("AudioRecord did not start (recordingState=${record.recordingState})")
                record.release()
                return
            }
            recorder = record
            capturing = true
            startButton.isEnabled = false
            modeButton.isEnabled = false
            wordButton.isEnabled = false
            keywordButton.isEnabled = false
            stopButton.isEnabled = true
            status.text = if (wordMode) "Recognizing words offline for 30 seconds (no raw audio saved)..." else "Recording for up to 30 seconds (metadata only)..."
            event("AudioRecord STARTED: source=$sourceName rate=${sampleRate}Hz session=${record.audioSessionId} offlineWordTest=$wordMode")
            if (wordMode) event("WORD TEST CONSENT: local text transcripts will be saved; no raw audio persisted")
            if (keywordMode) event("KEYWORD TEST: diagnostic only, no unlock action")
            captureThread = Thread({ captureLoop(record, sourceName, wordRecognizer, wordModel, keywordMode) }, "mellon-probe-capture").apply { start() }
        } catch (e: Exception) {
            event("AudioRecord failed: ${e.javaClass.simpleName}: ${e.message}")
            status.text = "Microphone capture failed"
        } finally {
            // The capture thread owns the recognizer/model after successful start.
            if (!capturing) {
                wordRecognizer?.close()
                wordModel?.close()
                loadingWordModel = false
                wordButton.isEnabled = true
                keywordButton.isEnabled = true
                startButton.isEnabled = true
                modeButton.isEnabled = true
            }
        }
    }

    private fun captureLoop(record: AudioRecord, sourceName: String, wordRecognizer: Recognizer?, wordModel: Model?, keywordMode: Boolean) {
        var lastPartial = ""

        val data = ShortArray(2048)
        var lastUiMs = 0L
        val deadline = SystemClock.elapsedRealtime() + maxCaptureMs
        try {
            while (capturing) {
                if (SystemClock.elapsedRealtime() >= deadline) {
                    event("AUTO STOP: 30-second microphone test completed")
                    break
                }
                // NON_BLOCKING ensures a silent/unavailable microphone cannot
                // hold the thread in read() indefinitely after Assistant opens.
                val count = record.read(data, 0, data.size, AudioRecord.READ_NON_BLOCKING)
                if (count < 0) {
                    event("AudioRecord.read error=$count")
                    break
                }
                if (count > 0 && wordRecognizer != null) {
                    if (wordRecognizer.acceptWaveForm(data, count)) {
                        val transcript = JSONObject(wordRecognizer.result).optString("text", "").trim()
                        if (transcript.isNotEmpty()) {
                            event("OFFLINE FINAL TEXT: $transcript")
                            if (keywordMode) event("KEYWORD FINAL CHECK: text=$transcript match=${isCandidateWord(transcript)}")
                        }
                    } else {
                        val partial = JSONObject(wordRecognizer.partialResult).optString("partial", "").trim()
                        if (partial.isNotEmpty() && partial != lastPartial) {
                            lastPartial = partial
                            event("OFFLINE PARTIAL TEXT: $partial")
                        }
                    }
                }
                val now = SystemClock.elapsedRealtime()
                if (now - lastUiMs >= 500) {
                    lastUiMs = now
                    var sumSquares = 0.0
                    var nonZero = 0
                    for (index in 0 until count) {
                        val sample = data[index].toDouble() / 32768.0
                        sumSquares += sample * sample
                        if (data[index] != 0.toShort()) nonZero++
                    }
                    // Continue logging route/silencing even when read() returns zero.
                    val rms = if (count > 0) sqrt(sumSquares / count) else 0.0
                    val dbfs = if (rms > 0.0) 20.0 * log10(rms) else -120.0
                    val routed = record.routedDevice?.let { "${it.productName} (type=${it.type})" } ?: "none"
                    // Distinguish an unsilenced recording from unavailable configuration.
                    val silenced = record.activeRecordingConfiguration?.isClientSilenced?.toString() ?: "unknown"
                    val state = "source=$sourceName read=$count RMS=${"%.4f".format(rms)} dBFS=${"%.1f".format(dbfs)} nonzero=$nonZero/$count silenced=$silenced routed=$routed"
                    runOnUiThread { status.text = state }
                    event(state)
                }
                if (count == 0) Thread.sleep(40)
            }
        } catch (e: Exception) {
            event("Capture stopped with ${e.javaClass.simpleName}: ${e.message}")
        } finally {
            if (wordRecognizer != null) {
                try {
                    val finalText = JSONObject(wordRecognizer.finalResult).optString("text", "").trim()
                    if (finalText.isNotEmpty()) {
                        event("OFFLINE FINAL TEXT: $finalText")
                        if (keywordMode) event("KEYWORD FINAL CHECK: text=$finalText match=${isCandidateWord(finalText)}")
                    }
                } catch (e: Exception) {
                    event("Offline recognition finalization failed: ${e.message}")
                }
                try { wordRecognizer.close() } catch (_: Exception) { }
                try { wordModel?.close() } catch (_: Exception) { }
            }
            try { record.stop() } catch (_: Exception) { }
            record.release()
            if (recorder === record) recorder = null
            capturing = false
            runOnUiThread {
                status.text = "Status: stopped"
                startButton.isEnabled = true
                modeButton.isEnabled = true
                wordButton.isEnabled = true
                keywordButton.isEnabled = true
                stopButton.isEnabled = false
            }
            event("AudioRecord STOPPED")
        }
    }

    // Diagnostic candidate, deliberately not an authorization decision.
    private fun isCandidateWord(text: String): Boolean {
        val normalized = text.trim().lowercase(Locale.US)
        return normalized == "melon" || normalized == "mellon"
    }

    private fun stopCapture() {
        capturing = false
        try { recorder?.stop() } catch (_: Exception) { }
    }

    override fun dispatchKeyEvent(keyEvent: KeyEvent): Boolean {
        if (keyEvent.action == KeyEvent.ACTION_DOWN && keyEvent.repeatCount == 0) {
            event("Remote key: ${KeyEvent.keyCodeToString(keyEvent.keyCode)}")
        }
        return super.dispatchKeyEvent(keyEvent)
    }

    override fun onResume() {
        super.onResume()
        event("ACTIVITY onResume (visible foreground)")
    }

    override fun onPause() {
        event("ACTIVITY onPause (may lose microphone priority)")
        super.onPause()
    }

    override fun onStop() {
        event("ACTIVITY onStop (Assistant may be foreground)")
        super.onStop()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        event("ACTIVITY windowFocus=$hasFocus")
    }

    override fun onDestroy() {
        event("ACTIVITY onDestroy")
        stopCapture()
        super.onDestroy()
    }
}
