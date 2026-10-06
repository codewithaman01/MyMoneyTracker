package com.mymoney.tracker.data

import com.mymoney.tracker.data.entity.*
import com.mymoney.tracker.domain.LoanMath
import com.mymoney.tracker.domain.Recurrence
import kotlinx.coroutines.flow.first
import java.time.LocalDate

class Repository(val db: AppDatabase) {

    // ---------- first launch ----------
    suspend fun seedDefaults() {
        listOf("Food", "Groceries", "Travel", "Rent", "Shopping", "Medical", "Education", "Entertainment",
            "Personal", "Bills", "EMI", "Loan", "Family", "Other").forEach {
            db.categoryDao().insert(Category(name = it, isDefault = true, isRent = it == "Rent"))
        }
        listOf("Cash", "UPI", "Bank", "Debit Card", "Credit Card", "Other").forEach {
            db.categoryDao().insertMethod(PaymentMethod(name = it, isDefault = true))
        }
        if (db.settingsDao().get() == null) db.settingsDao().save(UserSettings())
    }

    suspend fun finishOnboarding(sample: Boolean, lock: Boolean = false, today: LocalDate = LocalDate.now()) {
        if (sample) loadSample(today)
        val s = db.settingsDao().get() ?: UserSettings()
        db.settingsDao().save(s.copy(onboardingDone = true, lockEnabled = lock))
    }

    /** SAMPLE ONLY. All values are ordinary editable rows; nothing here is referenced by the calculation code. */
    suspend fun loadSample(today: LocalDate) {
        val start = today.withDayOfMonth(1)
        val cats = db.categoryDao().all().first().associateBy { it.name }
        fun cat(n: String) = (cats[n] ?: cats["Other"] ?: cats.values.first()).id
        fun p(rupees: Long) = rupees * 100
        val s = start.toEpochDay()

        db.incomeDao().insert(Income(name = "Salary", amount = p(29800), source = "Employer", startDate = s))
        db.incomeDao().insert(Income(name = "Extra income", amount = p(15000), startDate = s,
            endDate = start.plusMonths(3).minusDays(1).toEpochDay()))

        val rentId = db.recurringDao().insert(RecurringExpense(name = "Rent", amount = p(16200), startDate = s,
            dueDay = 1, categoryId = cat("Rent")))
        db.changeDao().insert(ScheduledChange(targetType = ChangeTarget.RECURRING_EXPENSE, targetId = rentId,
            effectiveFrom = start.plusMonths(4).toEpochDay(), newAmount = p(8500)))
        db.recurringDao().insert(RecurringExpense(name = "Travel", amount = p(100), frequency = Frequency.DAILY,
            startDate = s, categoryId = cat("Travel"), weekdayMask = Recurrence.MON_TO_SAT))

        addEmi(Emi(name = "Phone EMI", purpose = "Mobile Phone", monthlyEmi = p(2500), totalMonths = 10, startDate = s, dueDay = 5))
        addEmi(Emi(name = "Other EMI", purpose = "Other", monthlyEmi = p(2000), totalMonths = 12, startDate = s, dueDay = 5))

        // Friends: first group due in month 1, second group in month 2
        val m1 = start.plusDays(24).toEpochDay()
        val m2 = start.plusMonths(1).plusDays(24).toEpochDay()
        listOf("Abdul" to 1100L, "Abhi" to 200L, "Rahul Bhaiya" to 2000L).forEach {
            db.debtDao().insert(Debt(person = it.first, direction = DebtDirection.I_OWE, amount = p(it.second), date = s, dueDate = m1))
        }
        listOf("Hussain" to 1000L, "Rihan" to 1000L).forEach {
            db.debtDao().insert(Debt(person = it.first, direction = DebtDirection.I_OWE, amount = p(it.second), date = s, dueDate = m2))
        }

        // TVS loan: rate / EMI / charges intentionally left empty — the user enters the real values
        addLoan(Loan(name = "TVS Loan", provider = "TVS", purpose = "Personal", principal = p(25000),
            tenureMonths = 12, startDate = s, dueDay = 5))
    }

    // ---------- EMI ----------
    suspend fun addEmi(e: Emi): Long {
        val id = db.emiDao().insert(e)
        db.emiDao().insertPayments(LoanMath.emiSchedule(e.copy(id = id), db.changeDao().snapshot()))
        return id
    }

    /** Edit: keeps paid history, rebuilds only the not-yet-paid installments. */
    suspend fun updateEmi(e: Emi) {
        db.emiDao().update(e)
        db.emiDao().deletePendingPayments(e.id)
        val have = db.emiDao().allPayments().filter { it.emiId == e.id }.map { it.installmentNo }.toSet()
        db.emiDao().insertPayments(LoanMath.emiSchedule(e, db.changeDao().snapshot()).filter { it.installmentNo !in have })
        refreshEmiStatus(e.id)
    }

    suspend fun setEmiPayment(p: EmiPayment, status: PaymentStatus, amount: Long, today: LocalDate = LocalDate.now()) {
        val paid = when (status) { PaymentStatus.PAID -> p.amountDue; PaymentStatus.PARTIAL -> amount; else -> 0L }
        db.emiDao().updatePayment(p.copy(status = status, amountPaid = paid,
            paidDate = if (paid > 0) today.toEpochDay() else null))
        refreshEmiStatus(p.emiId)
    }

    private suspend fun refreshEmiStatus(emiId: Long) {
        val e = db.emiDao().snapshot().firstOrNull { it.id == emiId } ?: return
        if (e.status == ItemStatus.PAUSED || e.status == ItemStatus.CANCELLED) return
        val pays = db.emiDao().allPayments().filter { it.emiId == emiId && it.status != PaymentStatus.SKIPPED }
        val done = pays.isNotEmpty() && pays.none { it.status == PaymentStatus.PENDING || it.status == PaymentStatus.PARTIAL }
        val target = if (done) ItemStatus.COMPLETED else ItemStatus.ACTIVE
        if (e.status != target) db.emiDao().update(e.copy(status = target))
    }

    // ---------- Loan ----------
    suspend fun addLoan(l: Loan): Long {
        val id = db.loanDao().insert(l)
        db.loanDao().insertPayments(LoanMath.loanSchedule(l.copy(id = id)))
        return id
    }

    suspend fun updateLoan(l: Loan) {
        db.loanDao().update(l)
        db.loanDao().deletePendingPayments(l.id)
        val have = db.loanDao().allPayments().filter { it.loanId == l.id }.map { it.installmentNo }.toSet()
        db.loanDao().insertPayments(LoanMath.loanSchedule(l).filter { it.installmentNo !in have })
        refreshLoanStatus(l.id)
    }

    suspend fun setLoanPayment(p: LoanPayment, status: PaymentStatus, amount: Long, today: LocalDate = LocalDate.now()) {
        val paid = when (status) { PaymentStatus.PAID -> p.amountDue; PaymentStatus.PARTIAL -> amount; else -> 0L }
        db.loanDao().updatePayment(p.copy(status = status, amountPaid = paid,
            paidDate = if (paid > 0) today.toEpochDay() else null))
        refreshLoanStatus(p.loanId)
    }

    private suspend fun refreshLoanStatus(loanId: Long) {
        val l = db.loanDao().snapshot().firstOrNull { it.id == loanId } ?: return
        if (l.status == ItemStatus.PAUSED || l.status == ItemStatus.CANCELLED) return
        val pays = db.loanDao().allPayments().filter { it.loanId == loanId && it.status != PaymentStatus.SKIPPED }
        val done = pays.isNotEmpty() && pays.none { it.status == PaymentStatus.PENDING || it.status == PaymentStatus.PARTIAL }
        val target = if (done) ItemStatus.COMPLETED else ItemStatus.ACTIVE
        if (l.status != target) db.loanDao().update(l.copy(status = target))
    }

    // ---------- Scheduled changes (affect EMI schedules too) ----------
    suspend fun addChange(c: ScheduledChange) {
        db.changeDao().insert(c)
        if (c.targetType == ChangeTarget.EMI) db.emiDao().snapshot().firstOrNull { it.id == c.targetId }?.let { updateEmi(it) }
    }

    suspend fun deleteChange(c: ScheduledChange) {
        db.changeDao().delete(c)
        if (c.targetType == ChangeTarget.EMI) db.emiDao().snapshot().firstOrNull { it.id == c.targetId }?.let { updateEmi(it) }
    }

    // ---------- Savings ----------
    /** delta > 0 adds, delta < 0 withdraws. Returns false if withdrawing more than available. */
    suspend fun adjustSavings(g: SavingsGoal, delta: Long): Boolean {
        val next = g.currentAmount + delta
        if (next < 0) return false
        db.savingsDao().update(g.copy(currentAmount = next))
        return true
    }

    suspend fun resetAll() {
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { db.clearAllTables() }
        seedDefaults()
    }
}
