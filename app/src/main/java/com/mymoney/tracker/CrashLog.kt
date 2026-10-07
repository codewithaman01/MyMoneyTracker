package com.mymoney.tracker

import android.content.Context

/** Remembers the last crash so the app can show it on the next start. Stays on the phone; nothing is sent anywhere. */
object CrashLog {
    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences("crash", Context.MODE_PRIVATE)

    fun install(ctx: Context) {
        val old = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try { prefs(ctx).edit().putString("last", android.util.Log.getStackTraceString(e).take(2500)).commit() } catch (_: Throwable) {}
            old?.uncaughtException(t, e)
        }
    }

    fun read(ctx: Context): String? = prefs(ctx).getString("last", null)
    fun clear(ctx: Context) { prefs(ctx).edit().remove("last").apply() }
}
