package expo.modules.focusalarm

import android.app.Notification
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

/** The alarm time has come: ring loudly and open Focus full screen, even over the lock screen. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return
    val title = intent.getStringExtra(AlarmScheduler.EXTRA_TITLE) ?: "Time to get up"
    val body = intent.getStringExtra(AlarmScheduler.EXTRA_BODY) ?: ""
    AlarmScheduler.forget(context, id)
    AlarmScheduler.markFiring(context, id)
    AlarmScheduler.ensureChannel(context)

    val open = AlarmScheduler.launchPendingIntent(context, id)
    val notification = NotificationCompat.Builder(context, AlarmScheduler.CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(body)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(open)
      .setFullScreenIntent(open, true)
      .setOngoing(true)
      .setAutoCancel(false)
      .build()
    // Keep ringing until it's dealt with, like a real alarm clock.
    notification.flags = notification.flags or Notification.FLAG_INSISTENT

    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    try {
      nm.notify(AlarmScheduler.requestCode(id), notification)
    } catch (e: SecurityException) {
      // Notifications switched off: nothing more we can do here.
    }
  }
}
