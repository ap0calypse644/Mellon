package dev.mellon.tvprobe

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log

/**
 * M3.1 experiment: explicitly start this microphone-typed foreground service
 * from a visible Activity BEFORE entering DreamService. It does not open the
 * microphone itself. It temporarily makes the process foreground-service
 * eligible, so the dream's AudioRecord can be tested under that policy.
 *
 * No boot receiver, no automatic restart, and a hard 120-second timeout.
 */
class DreamMicLeaseService : Service() {
    companion object {
        const val ACTION_STOP = "dev.mellon.tvprobe.STOP_DREAM_MIC_LEASE"
        private const val CHANNEL_ID = "mellon-dream-mic-test"
        private const val NOTIFICATION_ID = 31012
        private const val LEASE_MS = 120_000L
    }

    private val handler = Handler(Looper.getMainLooper())
    private val expire = Runnable {
        Log.i("MellonMicLease", "LEASE EXPIRED after 120 seconds")
        stopSelf()
    }

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Mellon dream microphone diagnostic",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Temporary, user-initiated 2-minute microphone policy test" }
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Log.i("MellonMicLease", "LEASE STOP requested")
            stopSelf()
            return START_NOT_STICKY
        }
        val notification = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("Mellon dream microphone test")
            .setContentText("Temporary audio-access diagnostic; ends in 2 minutes")
            .setOngoing(true)
            .build()
        try {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
            Log.i(
                "MellonMicLease",
                "LEASE ACTIVE pid=${android.os.Process.myPid()} since=${SystemClock.elapsedRealtime()}ms; expires in 120s"
            )
            handler.removeCallbacks(expire)
            handler.postDelayed(expire, LEASE_MS)
        } catch (e: Exception) {
            Log.e("MellonMicLease", "LEASE FAILED: ${e.javaClass.simpleName}: ${e.message}", e)
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(expire)
        Log.i("MellonMicLease", "LEASE STOPPED")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
