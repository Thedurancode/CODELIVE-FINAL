package com.codelive.tvapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Boot Receiver - Auto-starts the TV app when Fire TV boots
 *
 * To enable: Set AUTO_START_ON_BOOT = true
 * This is useful for dedicated display setups.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        // Set to true to auto-launch app on Fire TV boot
        private const val AUTO_START_ON_BOOT = false
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED && AUTO_START_ON_BOOT) {
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(launchIntent)
        }
    }
}
