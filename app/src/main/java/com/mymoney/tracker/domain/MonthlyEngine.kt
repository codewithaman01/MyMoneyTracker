package com.mymoney.tracker.domain

import com.mymoney.tracker.data.entity.*
import java.time.LocalDate
import java.time.YearMonth

/** Raw rows from the database. The engine is a pure function of these, so every number is derived. */
data class EngineInputs(
    val incomes: List<Income> = emptyList(),
    val changes: List<ScheduledChange> = emptyList(),
    val expenses: List<Expense> = emptyList(),
    val recurring: List<RecurringExpense> = emptyList(),
    val categories: List<Category> = emptyList(),
    val emiPayments: List<EmiPayment> = emptyList(),
    val loanPayments: List<LoanPayment> = emptyList(),
    val debts: List<Debt> = emptyList(),
    val debtPayments: List<DebtPayment> = emptyList()
)

data class MonthSummary(
    val month: YearMonth,
    val totalIncome: Long,
    val incomeBySource: Map<String, Long>,
    val oneOffExpenses: Long,
    val recurringExpenses: Long,
    val totalExpenses: Long,          // one-off + recurring (category spending)
    val rent: Long,
    val categoryTotals: Map<String, Long>,
    val emi: Long,
    val loan: Long,
    val debtPayments: Long,
    val totalOutflow: Long,           // expenses + emi + loan + debt payments
    val remaining: Long               // income - outflow
)

object MonthlyEngine {

    fun summarize(ym: YearMonth, inp: EngineInputs, today: LocalDate = LocalDate.now()): MonthSummary {
        val from = ym.atDay(1)
        val to = ym.atEndOfMonth()
        val catName = inp.categories.associate { it.id to it.name }
        val rentIds = inp.categories.filter { it.isRent }.map { it.id }.toSet()

        // Income: recurrence + scheduled changes, only ACTIVE items
        val incomeBy = HashMap<String, Long>()
        for (i in inp.incomes.filter { it.status == ItemStatus.ACTIVE }) {
            val dates = Recurrence.occurrences(
                i.frequency, i.customIntervalDays, LocalDate.ofEpochDay(i.startDate),
                i.endDate?.let(LocalDate::ofEpochDay), i.paymentDay, 0, from, to)
            val sum = dates.sumOf { ChangeResolver.amountOn(i.amount, ChangeTarget.INCOME, i.id, inp.changes, it) }
            if (sum > 0) incomeBy.merge(i.name, sum, Long::plus)
        }

        // One-off expenses actually entered in this month
        val catTotals = HashMap<String, Long>()
        var rent = 0L
        var oneOff = 0L
        for (e in inp.expenses.filter { it.date in from.toEpochDay()..to.toEpochDay() }) {
            oneOff += e.amount
            catTotals.merge(catName[e.categoryId] ?: "Other", e.amount, Long::plus)
            if (e.categoryId in rentIds) rent += e.amount
        }

        // Recurring expenses (rent, bills, travel Mon-Sat ...) with scheduled changes
        var recurringSum = 0L
        for (r in inp.recurring.filter { it.status == ItemStatus.ACTIVE }) {
            val dates = Recurrence.occurrences(
                r.frequency, r.customIntervalDays, LocalDate.ofEpochDay(r.startDate),
                r.endDate?.let(LocalDate::ofEpochDay), r.dueDay, r.weekdayMask, from, to)
            val sum = dates.sumOf { ChangeResolver.amountOn(r.amount, ChangeTarget.RECURRING_EXPENSE, r.id, inp.changes, it) }
            recurringSum += sum
            if (sum > 0) catTotals.merge(catName[r.categoryId] ?: "Other", sum, Long::plus)
            if (r.categoryId in rentIds) rent += sum
        }

        fun inMonth(epochDay: Long) = epochDay in from.toEpochDay()..to.toEpochDay()

        val emi = inp.emiPayments.filter { inMonth(it.dueDate) && it.status != PaymentStatus.SKIPPED }
            .sumOf { if (it.status == PaymentStatus.PENDING) it.amountDue else it.amountPaid }
        val loan = inp.loanPayments.filter { inMonth(it.dueDate) && it.status != PaymentStatus.SKIPPED }
            .sumOf { if (it.status == PaymentStatus.PENDING) it.amountDue else it.amountPaid }

        val debtOut = debtOutflow(ym, inp, YearMonth.from(today))

        val income = incomeBy.values.sum()
        val expenses = oneOff + recurringSum
        val outflow = expenses + emi + loan + debtOut
        return MonthSummary(ym, income, incomeBy, oneOff, recurringSum, expenses, rent,
            catTotals, emi, loan, debtOut, outflow, income - outflow)
    }

    /**
     * Money I owe: actual repayments made in the month, plus (current/future months only) the
     * remaining amount of debts planned to be settled in that month by their due date.
     * Overdue unpaid debts are planned into the current month.
     */
    private fun debtOutflow(ym: YearMonth, inp: EngineInputs, current: YearMonth): Long {
        val owe = inp.debts.filter { it.direction == DebtDirection.I_OWE }
        val oweIds = owe.map { it.id }.toSet()
        val from = ym.atDay(1).toEpochDay()
        val to = ym.atEndOfMonth().toEpochDay()
        var total = inp.debtPayments.filter { it.debtId in oweIds && it.date in from..to }.sumOf { it.amount }
        if (ym >= current) {
            for (d in owe) {
                val remaining = d.amount - inp.debtPayments.filter { it.debtId == d.id }.sumOf { it.amount }
                if (remaining <= 0 || d.dueDate == null) continue
                val dueYm = YearMonth.from(LocalDate.ofEpochDay(d.dueDate))
                val plannedYm = if (dueYm < current) current else dueYm
                if (plannedYm == ym) total += remaining
            }
        }
        return total
    }

    /** 1 / 3 / 6 / 12 / 24 / custom months starting at [start]. Same engine, so forecast == dashboard logic. */
    fun forecast(start: YearMonth, months: Int, inp: EngineInputs, today: LocalDate = LocalDate.now()): List<MonthSummary> =
        (0 until months.coerceAtLeast(1)).map { summarize(start.plusMonths(it.toLong()), inp, today) }

    // ---------- Financial health (all derived) ----------
    data class Health(
        val savingsRatePct: Int?, val debtToIncomePct: Int?, val emiBurdenPct: Int?,
        val fixedExpensePct: Int?, val monthlySurplus: Long, val warnings: List<String>
    )

    fun health(s: MonthSummary, fixedMonthly: Long): Health {
        fun pct(a: Long) = if (s.totalIncome > 0) ((a * 100) / s.totalIncome).toInt() else null
        val warns = ArrayList<String>()
        val emiPct = pct(s.emi + s.loan)
        if (s.totalIncome in 1 until s.totalOutflow) warns.add("Your expenses are higher than your income")
        if (emiPct != null && emiPct >= 40) warns.add("High EMI burden")
        val sav = pct(s.remaining.coerceAtLeast(0))
        if (sav != null && sav >= 20) warns.add("Good savings progress")
        return Health(sav, pct(s.emi + s.loan + s.debtPayments), emiPct, pct(fixedMonthly), s.remaining, warns)
    }
}
