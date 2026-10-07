package com.mymoney.tracker

import android.app.Application
import com.mymoney.tracker.notify.ReminderScheduler

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        com.mymoney.tracker.extras.ExtrasStore.init(this)
        ReminderScheduler.schedule(this) // one tiny daily job; it exits immediately if reminders are off
    }
}
