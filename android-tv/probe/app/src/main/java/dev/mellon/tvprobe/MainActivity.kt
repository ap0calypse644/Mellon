package dev.mellon.tvprobe

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlin.math.log10
import kotlin.math.sqrt
import kotlin.math.max

/**
 * Read-only audio diagnostic for Android TV. Uses RECORD_AUDIO permission while the user
 * explicitly starts a test. Audio samples are analysed in RAM for signal level then discarded.
 * There is no networking, audio file recording, or speech transcription.
 */
class MainActivity : Activity() {
    private val logTag = "MellonMicProbe"
    private val permissionRequest = 101
    private lateinit var audioManager: AudioManager
    private lateinit var status: TextView
    private lateinit var eventLog: TextView
    private lateinit var startButton: Button
    private lateinit var stopButton: Button
    private lateinit var modeButton: Button
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
            text = "Diagnostic only. Start recording, speak normally, then try the Sony remote microphone button. No audio is saved. Google Assistant may interrupt or silence this app."
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
        stopButton = Button(this).apply { text = "STOP"; isEnabled = false; setOnClickListener { stopCapture() } }
        buttons.addView(refreshButton)
        buttons.addView(modeButton)
        buttons.addView(startButton)
        buttons.addView(stopButton)
        root.addView(buttons)

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

        event("Android ${Build.VERSION.RELEASE} / API ${Build.VERSION.SDK_INT} / ${Build.MANUFACTURER} ${Build.MODEL}")
        event("Microphone hardware feature advertised: ${packageManager.hasSystemFeature(PackageManager.FEATURE_MICROPHONE)}")
        enumerateDevices()
    }

    private fun event(message: String) {
        val line = "${SystemClock.elapsedRealtime()}ms: $message"
        Log.i(logTag, line)
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

    private fun requestOrStart() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            event("Requesting microphone permission")
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), permissionRequest)
        } else startCapture()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == permissionRequest) {
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) startCapture()
            else event("RECORD_AUDIO denied")
        }
    }

    private fun startCapture() {
        if (capturing) return
        val sampleRate = 16000
        val channelConfig = AudioFormat.CHANNEL_IN_MONO
        val encoding = AudioFormat.ENCODING_PCM_16BIT
        val minBuffer = AudioRecord.getMinBufferSize(sampleRate, channelConfig, encoding)
        if (minBuffer <= 0) {
            event("Unsupported capture configuration: getMinBufferSize=$minBuffer")
            return
        }
        try {
            val record = AudioRecord.Builder()
                .setAudioSource(captureSources[sourceIndex].second)
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
            stopButton.isEnabled = true
            status.text = "Recording levels (not saving audio)..."
            event("AudioRecord STARTED: source=${captureSources[sourceIndex].first} rate=${sampleRate}Hz session=${record.audioSessionId}")
            captureThread = Thread({ captureLoop(record) }, "mellon-probe-capture").apply { start() }
        } catch (e: Exception) {
            event("AudioRecord failed: ${e.javaClass.simpleName}: ${e.message}")
            status.text = "Microphone capture failed"
        }
    }

    private fun captureLoop(record: AudioRecord) {
        val data = ShortArray(2048)
        var lastUiMs = 0L
        try {
            while (capturing) {
                val count = record.read(data, 0, data.size)
                if (count < 0) {
                    event("AudioRecord.read error=$count")
                    break
                }
                if (count == 0) continue
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
                    val rms = sqrt(sumSquares / count)
                    val dbfs = if (rms > 0.0) 20.0 * log10(rms) else -120.0
                    val routed = record.routedDevice?.let { "${it.productName} (type=${it.type})" } ?: "none"
                    val silenced = record.activeRecordingConfiguration?.isClientSilenced ?: false
                    val state = "source=${captureSources[sourceIndex].first} RMS=${"%.4f".format(rms)} dBFS=${"%.1f".format(dbfs)} nonzero=$nonZero/$count silenced=$silenced routed=$routed"
                    runOnUiThread { status.text = state }
                    event(state)
                }
            }
        } catch (e: Exception) {
            event("Capture stopped with ${e.javaClass.simpleName}: ${e.message}")
        } finally {
            try { record.stop() } catch (_: Exception) { }
            record.release()
            if (recorder === record) recorder = null
            capturing = false
            runOnUiThread {
                status.text = "Status: stopped"
                startButton.isEnabled = true
                modeButton.isEnabled = true
                stopButton.isEnabled = false
            }
            event("AudioRecord STOPPED")
        }
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

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        event("ACTIVITY windowFocus=$hasFocus")
    }

    override fun onDestroy() {
        stopCapture()
        super.onDestroy()
    }
}
