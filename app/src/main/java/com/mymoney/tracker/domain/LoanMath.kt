package com.mymoney.tracker.domain

import com.mymoney.tracker.data.entity.*
import java.time.LocalDate
import java.time.YearMonth
import kotlin.math.pow
import kotlin.math.roundToLong

/** EMI / loan calculations. The interest rate always comes from the user (nullable = not entered yet). */
object LoanMath {

    /** Suggested EMI in paise, or null if the rate/type is unknown. The user can always override it. */
    fun suggestedEmi(principal: Long, ratePercent: Double?, months: Int, type: InterestType): Long? {
        if (months <= 0 || ratePercent == null || type == InterestType.UNKNOWN) return null
        return when (type) {
            InterestType.FLAT -> {
                val interest = principal * ratePercent / 100.0 * months / 12.0
                ((principal + interest) / months).roundToLong()
            }
            InterestType.REDUCING -> {
                val r = ratePercent / 1200.0
                if (r == 0.0) principal / months
                else (principal * r * (1 + r).pow(months) / ((1 + r).pow(months) - 1)).roundToLong()
            }
            else -> null
        }
    }

    data class Row(val no: Int, val dueDate: LocalDate, val amount: Long, val principalPart: Long, val interestPart: Long)

    /** Full repayment schedule. For REDUCING loans the interest/principal split is exact. */
    fun schedule(
        principal: Long, ratePercent: Double?, type: InterestType,
        months: Int, emi: Long, start: LocalDate, dueDay: Int
    ): List<Row> {
        val rows = ArrayList<Row>()
        var balance = principal
        val r = (ratePercent ?: 0.0) / 1200.0
        for (i in 1..months) {
            val due = dueDateFor(start, i - 1, dueDay)
            val interest = when (type) {
                InterestType.REDUCING -> (balance * r).roundToLong()
                InterestType.FLAT -> ((principal * (ratePercent ?: 0.0) / 100.0 * months / 12.0) / months).roundToLong()
                InterestType.UNKNOWN -> 0L
            }
            var pr = if (type == InterestType.FLAT || type == InterestType.UNKNOWN) emi - interest else emi - interest
            var amt = emi
            if (i == months && type == InterestType.REDUCING) { pr = balance; amt = pr + interest } // clear rounding drift
            rows.add(Row(i, due, amt, pr, interest))
            balance -= pr
        }
        return rows
    }

    /** Month i (0-based) after start, on dueDay (clamped to month length). */
    fun dueDateFor(start: LocalDate, monthOffset: Int, dueDay: Int): LocalDate {
        val ym = YearMonth.from(start).plusMonths(monthOffset.toLong())
        val day = if (dueDay in 1..31) dueDay else start.dayOfMonth
        return ym.atDay(minOf(day, ym.lengthOfMonth()))
    }

    /** Option B in the spec: start/end date -> number of monthly installments. */
    fun monthsBetween(start: LocalDate, end: LocalDate): Int? {
        if (end.isBefore(start)) return null
        val m = java.time.temporal.ChronoUnit.MONTHS.between(YearMonth.from(start).atDay(1), YearMonth.from(end).atDay(1)).toInt() + 1
        return m
    }

    // ---------- Payment generation ----------
    fun emiSchedule(e: Emi, changes: List<ScheduledChange>): List<EmiPayment> {
        val start = LocalDate.ofEpochDay(e.startDate)
        return (0 until e.totalMonths).map { i ->
            val due = dueDateFor(start, i, e.dueDay)
            // "Months 1-6 ₹3000, months 7-12 ₹2000" = scheduled changes on the EMI
            val amt = ChangeResolver.amountOn(e.monthlyEmi, ChangeTarget.EMI, e.id, changes, due)
            EmiPayment(emiId = e.id, installmentNo = i + 1, dueDate = due.toEpochDay(), amountDue = amt)
        }
    }

    fun loanSchedule(l: Loan): List<LoanPayment> {
        val emi = l.emi ?: suggestedEmi(l.principal, l.interestRatePercent, l.tenureMonths, l.interestType) ?: return emptyList()
        return schedule(l.principal, l.interestRatePercent, l.interestType, l.tenureMonths, emi,
            LocalDate.ofEpochDay(l.startDate), l.dueDay).map {
            LoanPayment(loanId = l.id, installmentNo = it.no, dueDate = it.dueDate.toEpochDay(),
                amountDue = it.amount, principalPart = it.principalPart, interestPart = it.interestPart)
        }
    }

    // ---------- Stats ----------
    data class EmiStats(
        val totalPayments: Int, val paidCount: Int, val remainingMonths: Int,
        val paidAmount: Long, val remainingAmount: Long, val nextDue: LocalDate?,
        val completionDate: LocalDate?, val totalInterest: Long, val totalCharges: Long,
        val isComplete: Boolean
    )

    fun emiStats(e: Emi, pays: List<EmiPayment>): EmiStats {
        val counted = pays.filter { it.status != PaymentStatus.SKIPPED }
        val paid = counted.filter { it.status == PaymentStatus.PAID }
        val open = counted.filter { it.status == PaymentStatus.PENDING || it.status == PaymentStatus.PARTIAL }
        val paidAmt = pays.sumOf { it.amountPaid }
        val totalDue = counted.sumOf { it.amountDue }
        val principalBase = (e.originalAmount - e.downPayment).takeIf { it > 0 } ?: e.remainingPrincipal
        return EmiStats(
            totalPayments = counted.size, paidCount = paid.size, remainingMonths = open.size,
            paidAmount = paidAmt, remainingAmount = (totalDue - paidAmt).coerceAtLeast(0),
            nextDue = open.minByOrNull { it.dueDate }?.let { LocalDate.ofEpochDay(it.dueDate) },
            completionDate = counted.maxByOrNull { it.dueDate }?.let { LocalDate.ofEpochDay(it.dueDate) },
            totalInterest = (totalDue - principalBase).coerceAtLeast(0),
            totalCharges = e.processingFee + e.otherCharges,
            isComplete = counted.isNotEmpty() && open.isEmpty()
        )
    }

    data class LoanStats(
        val totalRepayment: Long, val totalInterest: Long, val principalPaid: Long,
        val interestPaid: Long, val remainingPrincipal: Long, val remainingEmis: Int,
        val completionDate: LocalDate?, val paidAmount: Long, val progressPercent: Int
    )

    fun loanStats(l: Loan, pays: List<LoanPayment>): LoanStats {
        val scheduled = pays.filter { it.status != PaymentStatus.SKIPPED }
        val charges = l.processingFee + l.insurance + l.otherCharges
        val totalRepay = l.totalRepaymentOverride ?: (scheduled.sumOf { it.amountDue } + charges)
        val paidPays = pays.filter { it.status == PaymentStatus.PAID || it.status == PaymentStatus.PARTIAL }
        val paid = paidPays.sumOf { it.amountPaid }
        val principalPaid = paidPays.sumOf { it.principalPart }
        return LoanStats(
            totalRepayment = totalRepay,
            totalInterest = (scheduled.sumOf { it.amountDue } - l.principal).coerceAtLeast(0),
            principalPaid = principalPaid,
            interestPaid = paidPays.sumOf { it.interestPart },
            remainingPrincipal = (l.principal - principalPaid).coerceAtLeast(0),
            remainingEmis = scheduled.count { it.status == PaymentStatus.PENDING || it.status == PaymentStatus.PARTIAL },
            completionDate = scheduled.maxByOrNull { it.dueDate }?.let { LocalDate.ofEpochDay(it.dueDate) },
            paidAmount = paid,
            progressPercent = if (totalRepay > 0) ((paid * 100) / totalRepay).toInt().coerceIn(0, 100) else 0
        )
    }
}
