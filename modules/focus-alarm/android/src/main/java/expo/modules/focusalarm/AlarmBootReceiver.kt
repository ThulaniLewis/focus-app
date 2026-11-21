package expo.modules.focusalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Android forgets alarms on restart (and on app updates): put Focus's back. */
class AlarmBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      AlarmScheduler.rescheduleAll(context)
    }
  }
}
