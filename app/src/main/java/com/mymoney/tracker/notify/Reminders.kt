package com.mymoney.tracker.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.*
import com.mymoney.tracker.data.AppDatabase
import com.mymoney.tracker.data.entity.EventType
import com.mymoney.tracker.data.loadAll
import com.mymoney.tracker.domain.EventBuilder
import com.mymoney.tracker.domain.Money
import com.mymoney.tracker.domain.MonthlyEngine
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.util.concurrent.TimeUnit

object Notifier {
    private const val CHANNEL = "reminders"

    fun show(ctx: Context, id: Int, title: String, text: String) {
        val nm = NotificationManagerCompat.from(ctx)
        if (!nm.areNotificationsEnabled()) return
        val sys = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        sys.createNotificationChannel(NotificationChannel(CHANNEL, "Payment reminders", NotificationManager.IMPORTANCE_DEFAULT))
        // Amounts stay hidden on the lock screen (VISIBILITY_PRIVATE + generic public version).
        val public = NotificationCompat.Builder(ctx, CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("My Money Tracker").setContentText("You have a reminder").build()
        val n = NotificationCompat.Builder(ctx, CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title).setContentText(text).setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setPublicVersion(public).build()
        try { nm.notify(id, n) } catch (_: SecurityException) {}
    }
}

/** Runs once a day (no server). Reads the local database and posts local notifications. */
class ReminderWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val db = AppDatabase.get(applicationContext)
        val s = db.settingsDao().get() ?: return Result.success()
        if (!s.notificationsEnabled || !s.onboardingDone) return Result.success()
        val sym = s.currencySymbol
        val today = LocalDate.now()
        com.mymoney.tracker.extras.ExtrasStore.notifyDue(applicationContext, today)
        val target = today.plusDays(s.defaultRemindDaysBefore.toLong())
        val data = db.loadAll()

        val whenText = when (s.defaultRemindDaysBefore) { 0 -> "today"; 1 -> "tomorrow"; else -> "in ${s.defaultRemindDaysBefore} days" }
        EventBuilder.between(target, target, data.inputs, data.emis, data.loans, data.goals).forEachIndexed { i, e ->
            val verb = when (e.type) {
                EventType.INCOME -> "expected"; EventType.DEBT -> "due"; EventType.SAVINGS -> "deadline"; else -> "due"
            }
            val amt = if (e.amount > 0) " · ${Money.format(e.amount, sym)}" else ""
            Notifier.show(applicationContext, 1000 + i, e.title, "$verb $whenText$amt")
        }

        // Budget warnings for the current month (one notification per category, replaced daily)
        val ym = YearMonth.now()
        val summary = MonthlyEngine.summarize(ym, data.inputs, today)
        val names = data.inputs.categories.associate { it.id to it.name }
        db.budgetDao().snapshot().filter { it.yearMonth == ym.year * 100 + ym.monthValue && it.limitAmount > 0 }.forEach { b ->
            val name = names[b.categoryId] ?: return@forEach
            val pct = ((summary.categoryTotals[name] ?: 0L) * 100 / b.limitAmount).toInt()
            if (pct >= 75) Notifier.show(applicationContext, 5000 + b.categoryId.toInt(), "Budget: $name",
                if (pct >= 100) "You have reached your budget" else "$pct% of your budget used")
        }

        // Monthly savings nudge on the 1st
        if (today.dayOfMonth == 1 && data.goals.any { it.currentAmount < it.targetAmount })
            Notifier.show(applicationContext, 6000, "Savings reminder", "Add money to your savings goals this month")
        return Result.success()
    }
}

object ReminderScheduler {
    fun schedule(ctx: Context) {
        val now = LocalDateTime.now()
        var next = now.toLocalDate().atTime(9, 0)
        if (!next.isAfter(now)) next = next.plusDays(1)
        val req = PeriodicWorkRequestBuilder<ReminderWorker>(24, TimeUnit.HOURS)
            .setInitialDelay(Duration.between(now, next).toMinutes(), TimeUnit.MINUTES).build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("daily_reminders", ExistingPeriodicWorkPolicy.KEEP, req)
    }
}
