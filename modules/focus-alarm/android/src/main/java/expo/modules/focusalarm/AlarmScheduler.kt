package expo.modules.focusalarm

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import org.json.JSONObject

/** Keeps Focus's wake-up alarms: schedules them exactly, and remembers them so a restart doesn't lose them. */
object AlarmScheduler {
  const val CHANNEL_ID = "focus-wake-alarm"
  const val EXTRA_ID = "focusAlarmId"
  const val EXTRA_TITLE = "focusAlarmTitle"
  const val EXTRA_BODY = "focusAlarmBody"
  private const val PREFS = "focus_alarm"
  private const val KEY_ALARMS = "alarms"
  private const val KEY_FIRING = "firing"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun saved(context: Context): JSONObject =
    try {
      JSONObject(prefs(context).getString(KEY_ALARMS, "{}") ?: "{}")
    } catch (e: Exception) {
      JSONObject()
    }

  private fun save(context: Context, all: JSONObject) {
    prefs(context).edit().putString(KEY_ALARMS, all.toString()).apply()
  }

  /** A stable request code per alarm id, so the same id replaces itself. */
  fun requestCode(id: String): Int = id.hashCode()

  fun firePendingIntent(context: Context, id: String, title: String, body: String): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java).apply {
      putExtra(EXTRA_ID, id)
      putExtra(EXTRA_TITLE, title)
      putExtra(EXTRA_BODY, body)
    }
    return PendingIntent.getBroadcast(
      context,
      requestCode(id),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  /** Opens Focus at focus://alarm?id=… (the alarm screen comes in a later update). */
  fun launchPendingIntent(context: Context, id: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("focus://alarm?id=" + Uri.encode(id))).apply {
      setPackage(context.packageName)
      putExtra(EXTRA_ID, id)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(
      context,
      requestCode(id) + 1,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun canScheduleExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return am.canScheduleExactAlarms()
  }

  fun canUseFullScreenIntent(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < 34) return true
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return nm.canUseFullScreenIntent()
  }

  /** Schedule (or replace) an alarm. Returns true if it's exact, false if Android only allows an inexact one. */
  fun schedule(context: Context, id: String, atMs: Long, title: String, body: String, remember: Boolean = true): Boolean {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val fire = firePendingIntent(context, id, title, body)
    val exact = canScheduleExact(context)
    if (exact) {
      // setAlarmClock: exact, wakes the phone, and shows the alarm icon like a real clock app.
      am.setAlarmClock(AlarmManager.AlarmClockInfo(atMs, launchPendingIntent(context, id)), fire)
    } else {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, fire)
    }
    if (remember) {
      val all = saved(context)
      all.put(id, JSONObject().put("at", atMs).put("title", title).put("body", body))
      save(context, all)
    }
    return exact
  }

  fun cancel(context: Context, id: String) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(firePendingIntent(context, id, "", ""))
    val all = saved(context)
    all.remove(id)
    save(context, all)
    stopRinging(context, id)
  }

  fun forget(context: Context, id: String) {
    val all = saved(context)
    all.remove(id)
    save(context, all)
  }

  /** After a restart or an update: put back every alarm still in the future. */
  fun rescheduleAll(context: Context) {
    val all = saved(context)
    val now = System.currentTimeMillis()
    val keys = all.keys().asSequence().toList()
    for (id in keys) {
      val a = all.optJSONObject(id) ?: continue
      val at = a.optLong("at", 0L)
      if (at > now) schedule(context, id, at, a.optString("title"), a.optString("body"), remember = false)
      else all.remove(id)
    }
    save(context, all)
  }

  fun scheduledIds(context: Context): List<String> = saved(context).keys().asSequence().toList()

  fun markFiring(context: Context, id: String) {
    prefs(context).edit().putString(KEY_FIRING, id).apply()
  }

  /** The alarm ringing right now, if any (read once by the app when it opens). */
  fun takeFiring(context: Context): String? {
    val id = prefs(context).getString(KEY_FIRING, null)
    if (id != null) prefs(context).edit().remove(KEY_FIRING).apply()
    return id
  }

  fun stopRinging(context: Context, id: String) {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.cancel(requestCode(id))
  }

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Wake-up alarm", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Your wake-up alarm. Rings like an alarm clock, even on silent."
      setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 600, 400, 600, 400, 600)
      setBypassDnd(true)
    }
    nm.createNotificationChannel(channel)
  }
}
