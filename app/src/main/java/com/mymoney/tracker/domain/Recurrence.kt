package com.mymoney.tracker.domain

import com.mymoney.tracker.data.entity.ChangeTarget
import com.mymoney.tracker.data.entity.Frequency
import com.mymoney.tracker.data.entity.ScheduledChange
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth

object Recurrence {

    /**
     * All dates in [from, to] on which an item occurs.
     * Respects startDate, endDate (recurrence stops automatically), dueDay for MONTHLY,
     * custom day intervals, and an optional weekday mask (bit0=Mon..bit6=Sun, 0=all days).
     */
    fun occurrences(
        frequency: Frequency,
        customIntervalDays: Int,
        start: LocalDate,
        end: LocalDate?,
        dueDay: Int,
        weekdayMask: Int,
        from: LocalDate,
        to: LocalDate
    ): List<LocalDate> {
        val lo = maxOf(from, start)
        val hi = if (end != null) minOf(to, end) else to
        if (lo > hi) return emptyList()
        val out = ArrayList<LocalDate>()
        when (frequency) {
            Frequency.ONE_TIME -> if (start in lo..hi) out.add(start)

            Frequency.DAILY -> {
                var d = lo
                while (d <= hi) {
                    if (weekdayAllowed(d, weekdayMask)) out.add(d)
                    d = d.plusDays(1)
                }
            }
            Frequency.WEEKLY -> stepEvery(start, 7, lo, hi, out)
            Frequency.CUSTOM -> if (customIntervalDays > 0) stepEvery(start, customIntervalDays, lo, hi, out)

            Frequency.MONTHLY -> {
                var ym = YearMonth.from(lo)
                val last = YearMonth.from(hi)
                val day = if (dueDay in 1..31) dueDay else start.dayOfMonth
                while (ym <= last) {
                    val d = ym.atDay(minOf(day, ym.lengthOfMonth()))
                    if (d in lo..hi) out.add(d)
                    ym = ym.plusMonths(1)
                }
            }
            Frequency.YEARLY -> {
                var y = lo.year
                while (y <= hi.year) {
                    val ym = YearMonth.of(y, start.month)
                    val d = ym.atDay(minOf(start.dayOfMonth, ym.lengthOfMonth()))
                    if (d in lo..hi) out.add(d)
                    y++
                }
            }
        }
        return out
    }

    private fun stepEvery(start: LocalDate, step: Int, lo: LocalDate, hi: LocalDate, out: MutableList<LocalDate>) {
        var d = start
        if (d < lo) {
            val gap = java.time.temporal.ChronoUnit.DAYS.between(start, lo)
            d = start.plusDays(((gap + step - 1) / step) * step)
        }
        while (d <= hi) { out.add(d); d = d.plusDays(step.toLong()) }
    }

    private fun weekdayAllowed(d: LocalDate, mask: Int): Boolean =
        mask == 0 || (mask shr (d.dayOfWeek.value - 1)) and 1 == 1

    fun maskOf(vararg days: DayOfWeek): Int = days.fold(0) { m, d -> m or (1 shl (d.value - 1)) }
    val MON_TO_SAT: Int = maskOf(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
        DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY)
}

/** Resolves "salary becomes X from January" style changes. */
object ChangeResolver {
    fun amountOn(
        base: Long,
        type: ChangeTarget,
        targetId: Long,
        changes: List<ScheduledChange>,
        date: LocalDate
    ): Long {
        val day = date.toEpochDay()
        return changes.filter { it.targetType == type && it.targetId == targetId && it.effectiveFrom <= day }
            .maxByOrNull { it.effectiveFrom }?.newAmount ?: base
    }
}
