package com.mymoney.tracker

import com.mymoney.tracker.data.entity.*
import com.mymoney.tracker.domain.*
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth

class EngineTest {
    private val cats = listOf(Category(1, "Rent", isRent = true), Category(2, "Food"), Category(3, "Travel"))
    private val d = LocalDate.of(2026, 10, 1).toEpochDay()

    private fun inputs(salary: Long) = EngineInputs(
        incomes = listOf(Income(1, "Salary", salary, startDate = d)),
        categories = cats,
        recurring = listOf(RecurringExpense(1, "Rent", Money.parse("10000")!!, startDate = d, categoryId = 1)),
        expenses = listOf(
            Expense(1, Money.parse("5000")!!, 2, d),
            Expense(2, Money.parse("2000")!!, 3, d)),
        emiPayments = listOf(
            EmiPayment(1, 1, 1, d, Money.parse("3000")!!),
            EmiPayment(2, 2, 1, d, Money.parse("2000")!!))
    )

    @Test fun spec_example_remaining_updates_when_salary_changes() {
        val ym = YearMonth.of(2026, 10)
        val a = MonthlyEngine.summarize(ym, inputs(Money.parse("40000")!!), LocalDate.of(2026, 10, 6))
        assertEquals(Money.parse("22000")!!, a.totalExpenses + a.emi)
        assertEquals(Money.parse("18000")!!, a.remaining)
        val b = MonthlyEngine.summarize(ym, inputs(Money.parse("45000")!!), LocalDate.of(2026, 10, 6))
        assertEquals(Money.parse("23000")!!, b.remaining)
    }

    @Test fun rent_change_applies_from_february() {
        val rent = RecurringExpense(1, "Rent", Money.parse("16200")!!, startDate = d, categoryId = 1)
        val ch = ScheduledChange(1, ChangeTarget.RECURRING_EXPENSE, 1, LocalDate.of(2027, 2, 1).toEpochDay(), Money.parse("8500")!!)
        val inp = EngineInputs(categories = cats, recurring = listOf(rent), changes = listOf(ch))
        assertEquals(Money.parse("16200")!!, MonthlyEngine.summarize(YearMonth.of(2027, 1), inp).rent)
        assertEquals(Money.parse("8500")!!, MonthlyEngine.summarize(YearMonth.of(2027, 2), inp).rent)
    }

    @Test fun income_stops_after_end_date() {
        val inc = Income(1, "Teaching", Money.parse("15000")!!, startDate = d,
            endDate = LocalDate.of(2026, 12, 31).toEpochDay())
        val inp = EngineInputs(incomes = listOf(inc))
        assertEquals(Money.parse("15000")!!, MonthlyEngine.summarize(YearMonth.of(2026, 12), inp).totalIncome)
        assertEquals(0L, MonthlyEngine.summarize(YearMonth.of(2027, 1), inp).totalIncome)
    }

    @Test fun travel_mon_to_sat_skips_sundays() {
        val travel = RecurringExpense(1, "Travel", 10000, frequency = Frequency.DAILY, startDate = d,
            categoryId = 3, weekdayMask = Recurrence.MON_TO_SAT)
        // Oct 2026 has 31 days, 4 Sundays (4,11,18,25) -> 27 travel days
        val s = MonthlyEngine.summarize(YearMonth.of(2026, 10), EngineInputs(categories = cats, recurring = listOf(travel)))
        assertEquals(27 * 10000L, s.recurringExpenses)
    }

    @Test fun money_format_indian_grouping() {
        assertEquals("₹29,800", Money.format(2980000))
        assertEquals("₹1,23,456", Money.format(12345600))
        assertEquals(null, Money.parse("-5"))
    }

    @Test fun reducing_emi_schedule_clears_to_zero() {
        val emi = LoanMath.suggestedEmi(2500000, 18.0, 12, InterestType.REDUCING)!!
        val rows = LoanMath.schedule(2500000, 18.0, InterestType.REDUCING, 12, emi, LocalDate.of(2026, 11, 1), 5)
        assertEquals(2500000L, rows.sumOf { it.principalPart })
    }
}
