package expo.modules.focusalarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * A place notice that pops up full screen ("Do you want to see your shopping list?"), if Full screen
 * notifications are allowed for Focus. Rings once, like a normal notification: not an alarm.
 */
object PlacePopup {
  const val CHANNEL_ID = "focus-places-popup"

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Arriving at a place", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Pops up when you arrive somewhere, like your shopping list at the food shop."
      enableVibration(true)
    }
    nm.createNotificationChannel(channel)
  }

  /** Show it now. `uri` is the Focus link it opens (focus://space/shopping). Returns false if it couldn't. */
  fun show(context: Context, id: String, title: String, body: String, uri: String): Boolean {
    ensureChannel(context)
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val open = PendingIntent.getActivity(
      context,
      ("popup:" + id).hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(body)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setContentIntent(open)
      .setAutoCancel(true)
    if (AlarmScheduler.canUseFullScreenIntent(context)) builder.setFullScreenIntent(open, true)
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return try {
      nm.notify(("popup:" + id).hashCode(), builder.build())
      true
    } catch (e: SecurityException) {
      false
    }
  }

  /** Battery use set to Unrestricted (Android's "not optimised"), so background location keeps going. */
  fun batteryUnrestricted(context: Context): Boolean {
    val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return pm.isIgnoringBatteryOptimizations(context.packageName)
  }
}
