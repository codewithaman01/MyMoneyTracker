package com.mymoney.tracker.data

import androidx.room.withTransaction
import com.mymoney.tracker.data.entity.*
import com.mymoney.tracker.domain.EngineInputs
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*

@Serializable
data class BackupFile(
    val app: String = "MyMoneyTracker",
    val version: Int = 1,
    val exportedAt: Long = System.currentTimeMillis(),
    val settings: UserSettings? = null,
    val categories: List<Category> = emptyList(),
    val paymentMethods: List<PaymentMethod> = emptyList(),
    val incomes: List<Income> = emptyList(),
    val expenses: List<Expense> = emptyList(),
    val recurringExpenses: List<RecurringExpense> = emptyList(),
    val emis: List<Emi> = emptyList(),
    val emiPayments: List<EmiPayment> = emptyList(),
    val loans: List<Loan> = emptyList(),
    val loanPayments: List<LoanPayment> = emptyList(),
    val debts: List<Debt> = emptyList(),
    val debtPayments: List<DebtPayment> = emptyList(),
    val budgets: List<Budget> = emptyList(),
    val savingsGoals: List<SavingsGoal> = emptyList(),
    val scheduledChanges: List<ScheduledChange> = emptyList(),
    val extras: String = ""
)

/** Local-only backup. Files are written/read through the system file picker; nothing is uploaded. */
object BackupManager {
    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true; encodeDefaults = true }

    suspend fun build(db: AppDatabase): BackupFile = BackupFile(
        settings = db.settingsDao().get(),
        categories = db.categoryDao().all().first(), paymentMethods = db.categoryDao().methods().first(),
        incomes = db.incomeDao().snapshot(), expenses = db.expenseDao().snapshot(), recurringExpenses = db.recurringDao().snapshot(),
        emis = db.emiDao().snapshot(), emiPayments = db.emiDao().allPayments(),
        loans = db.loanDao().snapshot(), loanPayments = db.loanDao().allPayments(),
        debts = db.debtDao().snapshot(), debtPayments = db.debtDao().allPayments(),
        budgets = db.budgetDao().snapshot(), savingsGoals = db.savingsDao().snapshot(), scheduledChanges = db.changeDao().snapshot(),
        extras = com.mymoney.tracker.extras.ExtrasStore.exportJson())

    fun toJson(b: BackupFile): String = json.encodeToString(b)

    /** One CSV file with a "## table" section per table. Opens in Excel / Google Sheets. */
    fun toCsv(b: BackupFile): String {
        val root = json.encodeToJsonElement(b).jsonObject
        val sb = StringBuilder()
        fun esc(s: String) = if (s.any { it == ',' || it == '"' || it == '\n' }) "\"" + s.replace("\"", "\"\"") + "\"" else s
        for ((table, el) in root) {
            if (el !is JsonArray || el.isEmpty()) continue
            val rows = el.map { it.jsonObject }
            val cols = rows.flatMap { it.keys }.distinct()
            sb.append("## ").append(table).append('\n').append(cols.joinToString(",") { esc(it) }).append('\n')
            rows.forEach { r -> sb.append(cols.joinToString(",") { c -> esc((r[c] as? JsonPrimitive)?.content ?: "") }).append('\n') }
            sb.append('\n')
        }
        return sb.toString()
    }

    /** Returns null on success or a friendly error. The file is fully validated BEFORE anything is erased. */
    suspend fun restore(db: AppDatabase, text: String): String? {
        val b = try { json.decodeFromString<BackupFile>(text) } catch (e: Exception) { return "This is not a valid My Money Tracker backup file." }
        if (b.app != "MyMoneyTracker") return "This file is not a My Money Tracker backup."
        if (b.version > 1) return "This backup was made by a newer version of the app."
        val badAmount = b.expenses.any { it.amount < 0 } || b.incomes.any { it.amount < 0 } || b.emis.any { it.monthlyEmi < 0 }
        if (badAmount) return "The backup contains invalid (negative) amounts."
        return try {
            val current = db.settingsDao().get()
            db.withTransaction {
                val sql = db.openHelper.writableDatabase
                listOf("debt_payment", "debt", "loan_payment", "loan", "emi_payment", "emi", "scheduled_change", "budget",
                    "savings_goal", "recurring_expense", "expense", "income", "financial_event", "payment_method", "category", "user_settings")
                    .forEach { sql.execSQL("DELETE FROM $it") }
                b.categories.forEach { db.categoryDao().insert(it) }
                b.paymentMethods.forEach { db.categoryDao().insertMethod(it) }
                b.incomes.forEach { db.incomeDao().insert(it) }
                b.expenses.forEach { db.expenseDao().insert(it) }
                b.recurringExpenses.forEach { db.recurringDao().insert(it) }
                b.emis.forEach { db.emiDao().insert(it) }
                db.emiDao().insertPayments(b.emiPayments)
                b.loans.forEach { db.loanDao().insert(it) }
                db.loanDao().insertPayments(b.loanPayments)
                b.debts.forEach { db.debtDao().insert(it) }
                b.debtPayments.forEach { db.debtDao().insertPayment(it) }
                b.budgets.forEach { db.budgetDao().upsert(it) }
                b.savingsGoals.forEach { db.savingsDao().insert(it) }
                b.scheduledChanges.forEach { db.changeDao().insert(it) }
                // keep THIS phone's lock settings; never import someone else's lock state
                val s = (b.settings ?: UserSettings()).copy(
                    onboardingDone = true,
                    lockEnabled = current?.lockEnabled ?: false,
                    lockTimeoutMinutes = current?.lockTimeoutMinutes ?: 0)
                db.settingsDao().save(s)
            }
            com.mymoney.tracker.extras.ExtrasStore.importJson(b.extras)
            null
        } catch (e: Exception) { "Restore failed, your existing data was kept." }
    }
}
