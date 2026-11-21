package expo.modules.focusalarm

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Focus's wake-up alarm, for JavaScript. Groundwork for Phase 6: the alarm screen, snooze and the
 * morning routine are built in JavaScript on top of this, and can ship as quick updates.
 */
class FocusAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("FocusAlarm")

    /** Schedule (or replace) an alarm at a time in milliseconds. Resolves true if it's exact. */
    AsyncFunction("schedule") { id: String, atMs: Double, title: String, body: String ->
      AlarmScheduler.schedule(context, id, atMs.toLong(), title, body)
    }

    AsyncFunction("cancel") { id: String ->
      AlarmScheduler.cancel(context, id)
    }

    /** Stop the ringing for an alarm that's going off. */
    AsyncFunction("stopRinging") { id: String ->
      AlarmScheduler.stopRinging(context, id)
    }

    Function("scheduledIds") {
      AlarmScheduler.scheduledIds(context)
    }

    /** The alarm that's ringing (or just rang) and opened Focus, if any. Read once. */
    Function("takeFiring") {
      AlarmScheduler.takeFiring(context)
    }

    Function("canScheduleExact") {
      AlarmScheduler.canScheduleExact(context)
    }

    Function("canUseFullScreenIntent") {
      AlarmScheduler.canUseFullScreenIntent(context)
    }

    /** Android 12+: the "Alarms and reminders" switch for Focus. */
    AsyncFunction("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }

    /** Android 14+: the "Full screen notifications" switch for Focus. */
    AsyncFunction("openFullScreenSettings") {
      if (Build.VERSION.SDK_INT >= 34) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + context.packageName))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }

    /**
     * While the alarm screen is showing: show it over the lock screen and turn the screen on.
     * Switched off again afterwards, so the rest of Focus never shows over the lock screen.
     */
    AsyncFunction("showOverLockScreen") { on: Boolean ->
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      activity.runOnUiThread {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          activity.setShowWhenLocked(on)
          activity.setTurnScreenOn(on)
        }
      }
      true
    }
  }
}
