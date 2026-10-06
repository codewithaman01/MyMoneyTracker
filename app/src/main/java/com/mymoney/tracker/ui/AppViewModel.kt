package com.mymoney.tracker.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.mymoney.tracker.data.AppDatabase
import com.mymoney.tracker.data.Repository
import com.mymoney.tracker.data.BackupManager
import com.mymoney.tracker.data.entity.*
import com.mymoney.tracker.security.PinStore
import com.mymoney.tracker.domain.EngineInputs
import com.mymoney.tracker.domain.MonthSummary
import com.mymoney.tracker.domain.MonthlyEngine
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import android.os.SystemClock
import java.time.LocalDate
import java.time.YearMonth

private data class P1(val i: List<Income>, val c: List<ScheduledChange>, val e: List<Expense>,
                      val r: List<RecurringExpense>, val cat: List<Category>)
private data class P2(val ep: List<EmiPayment>, val lp: List<LoanPayment>, val d: List<Debt>, val dp: List<DebtPayment>)

@OptIn(ExperimentalCoroutinesApi::class)
class AppViewModel(app: Application) : AndroidViewModel(app) {
    val db = AppDatabase.get(app)
    val repo = Repository(db)

    private fun <T> Flow<T>.hot(init: T) = stateIn(viewModelScope, SharingStarted.Eagerly, init)

    val settings: StateFlow<UserSettings?> = db.settingsDao().observe().hot(null)
    val categories = db.categoryDao().all().hot(emptyList())
    val methods = db.categoryDao().methods().hot(emptyList())
    val incomes = db.incomeDao().all().hot(emptyList())
    val expenses = db.expenseDao().all().hot(emptyList())
    val recurring = db.recurringDao().all().hot(emptyList())
    val emis = db.emiDao().all().hot(emptyList())
    val emiPayments = db.emiDao().observeAll().hot(emptyList())
    val loans = db.loanDao().all().hot(emptyList())
    val loanPayments = db.loanDao().observeAll().hot(emptyList())
    val debts = db.debtDao().all().hot(emptyList())
    val debtPayments = db.debtDao().observeAll().hot(emptyList())
    val goals = db.savingsDao().all().hot(emptyList())
    val changes = db.changeDao().all().hot(emptyList())

    /** Everything the calculation engine needs, as one live snapshot. Every screen number derives from this. */
    val inputs: StateFlow<EngineInputs> = combine(
        combine(incomes, changes, expenses, recurring, categories) { a, b, c, d, e -> P1(a, b, c, d, e) },
        combine(emiPayments, loanPayments, debts, debtPayments) { a, b, c, d -> P2(a, b, c, d) }
    ) { x, y ->
        EngineInputs(x.i, x.c, x.e, x.r, x.cat, y.ep, y.lp, y.d, y.dp)
    }.hot(EngineInputs())

    val month = MutableStateFlow(YearMonth.now())
    val summary: StateFlow<MonthSummary> = combine(inputs, month) { inp, ym ->
        MonthlyEngine.summarize(ym, inp)
    }.hot(MonthlyEngine.summarize(YearMonth.now(), EngineInputs()))

    val budgets = month.flatMapLatest { db.budgetDao().forMonth(it.year * 100 + it.monthValue) }.hot(emptyList())

    val forecastMonths = MutableStateFlow(12)
    val forecast = combine(inputs, forecastMonths) { inp, n ->
        MonthlyEngine.forecast(YearMonth.now(), n, inp)
    }.hot(emptyList())

    val message = MutableStateFlow<String?>(null)

    val pin = PinStore(app)
    /** Starts locked on every cold start; the lock screen only shows when the user enabled app lock. */
    val locked = MutableStateFlow(true)
    private var backgroundAt = SystemClock.elapsedRealtime()

    fun onBackground() { backgroundAt = SystemClock.elapsedRealtime() }
    fun onForeground() {
        val s = settings.value ?: return
        if (!s.lockEnabled) return
        val minutes = s.lockTimeoutMinutes          // 0 = every time, -1 = never (cold start only)
        val away = SystemClock.elapsedRealtime() - backgroundAt
        if (minutes == 0 || (minutes > 0 && away >= minutes * 60_000L)) locked.value = true
    }
    fun setLock(enabled: Boolean) { locked.value = false; saveSettings { it.copy(lockEnabled = enabled) } }

    init { viewModelScope.launch { repo.seedDefaults() } }

    /** Every write goes through here so bad input / DB errors show a message instead of crashing. */
    fun run(okMsg: String? = null, block: suspend () -> Unit) {
        viewModelScope.launch {
            try { block(); if (okMsg != null) message.value = okMsg }
            catch (e: Exception) { message.value = "Could not save. Please check the values and try again." }
        }
    }

    fun ym(m: YearMonth) = m.year * 100 + m.monthValue

    fun saveSettings(f: (UserSettings) -> UserSettings) = run { db.settingsDao().save(f(settings.value ?: UserSettings())) }
    fun finishOnboarding(sample: Boolean, lock: Boolean = false) = run { repo.finishOnboarding(sample, lock) }
    fun resetAll() = run("All data deleted") { repo.resetAll(); pin.clear(); locked.value = false }

    fun today(): LocalDate = LocalDate.now()

    // ---- backup / restore (file contents are handled by the screen via the system file picker) ----
    suspend fun backupJson(): String = BackupManager.toJson(BackupManager.build(db))
    suspend fun backupCsv(): String = BackupManager.toCsv(BackupManager.build(db))
    fun restore(text: String) = viewModelScope.launch {
        val err = try { BackupManager.restore(db, text) } catch (e: Exception) { "Restore failed, your existing data was kept." }
        message.value = err ?: "Backup restored"
    }
}
