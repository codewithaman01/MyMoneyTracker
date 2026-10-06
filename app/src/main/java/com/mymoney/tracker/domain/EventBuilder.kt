package com.mymoney.tracker.domain

import com.mymoney.tracker.data.entity.*
import java.time.LocalDate

data class CalEvent(val date: LocalDate, val type: EventType, val title: String, val amount: Long, val route: String)

/** Derives calendar events + reminders from the same rows as the dashboard. Nothing is stored twice. */
object EventBuilder {
    fun between(from: LocalDate, to: LocalDate, inp: EngineInputs, emis: List<Emi>, loans: List<Loan>, goals: List<SavingsGoal>): List<CalEvent> {
        val out = ArrayList<CalEvent>()
        val cats = inp.categories.associateBy { it.id }
        val emiBy = emis.associateBy { it.id }
        val loanBy = loans.associateBy { it.id }
        val a = from.toEpochDay(); val b = to.toEpochDay()

        for (i in inp.incomes.filter { it.status == ItemStatus.ACTIVE }) {
            Recurrence.occurrences(i.frequency, i.customIntervalDays, LocalDate.ofEpochDay(i.startDate),
                i.endDate?.let(LocalDate::ofEpochDay), i.paymentDay, 0, from, to).forEach { d ->
                out += CalEvent(d, EventType.INCOME, "${i.name} expected",
                    ChangeResolver.amountOn(i.amount, ChangeTarget.INCOME, i.id, inp.changes, d), "income_form/${i.id}")
            }
        }
        // Daily items (e.g. travel) would flood the calendar, so they are left out of it.
        for (r in inp.recurring.filter { it.status == ItemStatus.ACTIVE && it.frequency != Frequency.DAILY }) {
            val type = if (cats[r.categoryId]?.isRent == true) EventType.RENT else EventType.BILL
            Recurrence.occurrences(r.frequency, r.customIntervalDays, LocalDate.ofEpochDay(r.startDate),
                r.endDate?.let(LocalDate::ofEpochDay), r.dueDay, r.weekdayMask, from, to).forEach { d ->
                out += CalEvent(d, type, "${r.name} due",
                    ChangeResolver.amountOn(r.amount, ChangeTarget.RECURRING_EXPENSE, r.id, inp.changes, d), "recurring_form/${r.id}")
            }
        }
        for (p in inp.emiPayments.filter { it.dueDate in a..b && (it.status == PaymentStatus.PENDING || it.status == PaymentStatus.PARTIAL) }) {
            out += CalEvent(LocalDate.ofEpochDay(p.dueDate), EventType.EMI, "EMI: ${emiBy[p.emiId]?.name ?: "EMI"}",
                p.amountDue - p.amountPaid, "emi/${p.emiId}")
        }
        for (p in inp.loanPayments.filter { it.dueDate in a..b && (it.status == PaymentStatus.PENDING || it.status == PaymentStatus.PARTIAL) }) {
            out += CalEvent(LocalDate.ofEpochDay(p.dueDate), EventType.LOAN, "Loan: ${loanBy[p.loanId]?.name ?: "Loan"}",
                p.amountDue - p.amountPaid, "loan/${p.loanId}")
        }
        for (d in inp.debts) {
            val due = d.dueDate ?: continue
            if (due !in a..b) continue
            val rem = d.amount - inp.debtPayments.filter { it.debtId == d.id }.sumOf { it.amount }
            if (rem <= 0) continue
            val title = if (d.direction == DebtDirection.I_OWE) "Pay ${d.person}" else "Receive from ${d.person}"
            out += CalEvent(LocalDate.ofEpochDay(due), EventType.DEBT, title, rem, "debts")
        }
        for (g in goals) {
            val t = g.targetDate ?: continue
            if (t in a..b && g.currentAmount < g.targetAmount)
                out += CalEvent(LocalDate.ofEpochDay(t), EventType.SAVINGS, "Goal deadline: ${g.name}", g.targetAmount - g.currentAmount, "savings")
        }
        return out.sortedBy { it.date }
    }
}
