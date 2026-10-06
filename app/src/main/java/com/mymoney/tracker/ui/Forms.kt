package com.mymoney.tracker.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.mymoney.tracker.data.entity.*
import com.mymoney.tracker.domain.LoanMath
import com.mymoney.tracker.domain.Money
import com.mymoney.tracker.domain.Recurrence
import kotlinx.coroutines.flow.first
import java.time.LocalDate

private fun LocalDate?.ep() = this?.toEpochDay()
private fun ep(d: Long?) = d?.let { LocalDate.ofEpochDay(it) }
private fun dayOf(s: String): Int? = s.toIntOrNull()?.takeIf { it in 1..31 }

// ===================== INCOME =====================
@Composable
fun IncomeForm(vm: AppViewModel, id: Long, done: () -> Unit) {
    val old = remember(id) { vm.incomes.value.firstOrNull { it.id == id } }
    var name by remember { mutableStateOf(old?.name ?: "") }
    var amount by remember { mutableStateOf(paiseToField(old?.amount)) }
    var source by remember { mutableStateOf(old?.source ?: "") }
    var freq by remember { mutableStateOf(old?.frequency ?: Frequency.MONTHLY) }
    var custom by remember { mutableStateOf(old?.customIntervalDays?.takeIf { it > 0 }?.toString() ?: "") }
    var start by remember { mutableStateOf(ep(old?.startDate) ?: LocalDate.now()) }
    var end by remember { mutableStateOf(ep(old?.endDate)) }
    var payDay by remember { mutableStateOf((old?.paymentDay ?: 1).toString()) }
    var notes by remember { mutableStateOf(old?.notes ?: "") }
    var err by remember { mutableStateOf<String?>(null) }

    ScreenScaffold(if (old == null) "Add income" else "Edit income", done) {
        FormBody(err, onSave = {
            val a = Money.parse(amount)
            err = when {
                name.isBlank() -> "Enter an income name"
                a == null || a <= 0 -> "Enter a valid amount"
                end != null && end!!.isBefore(start) -> "End date cannot be before start date"
                freq == Frequency.CUSTOM && (custom.toIntOrNull() ?: 0) <= 0 -> "Enter the number of days"
                freq == Frequency.MONTHLY && dayOf(payDay) == null -> "Payment day must be 1-31"
                else -> null
            }
            if (err == null) {
                val row = Income(old?.id ?: 0, name.trim(), a!!, source.trim(), freq, custom.toIntOrNull() ?: 0,
                    start.toEpochDay(), end.ep(), dayOf(payDay) ?: 1, old?.status ?: ItemStatus.ACTIVE, notes)
                vm.run { if (old == null) vm.db.incomeDao().insert(row) else vm.db.incomeDao().update(row) }
                done()
            }
        }) {
            TextF("Income name (e.g. Salary)", name, { name = it })
            MoneyField("Amount", amount) { amount = it }
            TextF("Source", source, { source = it })
            Dropdown("Frequency", Frequency.entries.map { frequencyLabels[it]!! }, frequencyLabels[freq]!!) { freq = Frequency.entries[it] }
            if (freq == Frequency.CUSTOM) NumField("Repeat every N days", custom) { custom = it }
            if (freq == Frequency.MONTHLY) NumField("Payment day of month", payDay) { payDay = it }
            DateField(if (freq == Frequency.ONE_TIME) "Date" else "Start date", start, { it?.let { d -> start = d } })
            if (freq != Frequency.ONE_TIME) DateField("End date (optional)", end, { end = it }, clearable = true)
            TextF("Notes", notes, { notes = it })
        }
    }
}

// ===================== EXPENSE (fast: amount + category + save) =====================
@Composable
fun ExpenseForm(vm: AppViewModel, id: Long, done: () -> Unit) {
    val old = remember(id) { vm.expenses.value.firstOrNull { it.id == id } }
    val cats by vm.categories.collectAsState()
    val methods by vm.methods.collectAsState()
    var amount by remember { mutableStateOf(paiseToField(old?.amount)) }
    var catId by remember { mutableStateOf(old?.categoryId) }
    var date by remember { mutableStateOf(ep(old?.date) ?: LocalDate.now()) }
    var desc by remember { mutableStateOf(old?.description ?: "") }
    var method by remember { mutableStateOf(old?.paymentMethod ?: "Cash") }
    var notes by remember { mutableStateOf(old?.notes ?: "") }
    var newCat by remember { mutableStateOf("") }
    var err by remember { mutableStateOf<String?>(null) }
    val selCat = cats.firstOrNull { it.id == catId }

    ScreenScaffold(if (old == null) "Add expense" else "Edit expense", done) {
        FormBody(err, onSave = {
            val a = Money.parse(amount)
            err = if (a == null || a <= 0) "Enter a valid amount" else if (selCat == null && newCat.isBlank()) "Choose a category" else null
            if (err == null) vm.run {
                val cid = if (newCat.isNotBlank()) {
                    val n = newCat.trim()
                    vm.db.categoryDao().insert(Category(name = n))
                    vm.db.categoryDao().all().first().first { it.name.equals(n, true) }.id
                } else selCat!!.id
                val row = Expense(old?.id ?: 0, a!!, cid, date.toEpochDay(), desc.trim(), method, notes)
                if (old == null) vm.db.expenseDao().insert(row) else vm.db.expenseDao().update(row)
            }.also { if (err == null) done() }
        }) {
            MoneyField("Amount", amount) { amount = it }
            Dropdown("Category", cats.map { it.name }, selCat?.name ?: "") { catId = cats[it].id; newCat = "" }
            TextF("…or create a new category", newCat, { newCat = it })
            DateField("Date", date, { it?.let { d -> date = d } })
            TextF("Description", desc, { desc = it })
            Dropdown("Payment method", methods.map { it.name }, method) { method = methods[it].name }
            TextF("Notes", notes, { notes = it })
        }
    }
}

// ===================== RECURRING EXPENSE =====================
@Composable
fun RecurringForm(vm: AppViewModel, id: Long, done: () -> Unit) {
    val old = remember(id) { vm.recurring.value.firstOrNull { it.id == id } }
    val cats by vm.categories.collectAsState()
    val methods by vm.methods.collectAsState()
    var name by remember { mutableStateOf(old?.name ?: "") }
    var amount by remember { mutableStateOf(paiseToField(old?.amount)) }
    var freq by remember { mutableStateOf(old?.frequency ?: Frequency.MONTHLY) }
    var custom by remember { mutableStateOf(old?.customIntervalDays?.takeIf { it > 0 }?.toString() ?: "") }
    var start by remember { mutableStateOf(ep(old?.startDate) ?: LocalDate.now()) }
    var end by remember { mutableStateOf(ep(old?.endDate)) }
    var dueDay by remember { mutableStateOf((old?.dueDay ?: 1).toString()) }
    var catId by remember { mutableStateOf(old?.categoryId) }
    var method by remember { mutableStateOf(old?.paymentMethod ?: "Bank") }
    var skipSunday by remember { mutableStateOf(old?.weekdayMask == Recurrence.MON_TO_SAT) }
    var err by remember { mutableStateOf<String?>(null) }
    val selCat = cats.firstOrNull { it.id == catId }

    ScreenScaffold(if (old == null) "Add recurring payment" else "Edit recurring payment", done) {
        FormBody(err, onSave = {
            val a = Money.parse(amount)
            err = when {
                name.isBlank() -> "Enter a name"
                a == null || a <= 0 -> "Enter a valid amount"
                selCat == null -> "Choose a category"
                end != null && end!!.isBefore(start) -> "End date cannot be before start date"
                freq == Frequency.CUSTOM && (custom.toIntOrNull() ?: 0) <= 0 -> "Enter the number of days"
                freq == Frequency.MONTHLY && dayOf(dueDay) == null -> "Due day must be 1-31"
                else -> null
            }
            if (err == null) {
                val row = RecurringExpense(old?.id ?: 0, name.trim(), a!!, freq, custom.toIntOrNull() ?: 0, start.toEpochDay(),
                    end.ep(), dayOf(dueDay) ?: 1, selCat!!.id, method, old?.status ?: ItemStatus.ACTIVE,
                    if (freq == Frequency.DAILY && skipSunday) Recurrence.MON_TO_SAT else 0)
                vm.run { if (old == null) vm.db.recurringDao().insert(row) else vm.db.recurringDao().update(row) }
                done()
            }
        }) {
            TextF("Name (Rent, Internet, Gym…)", name, { name = it })
            MoneyField("Amount per payment", amount) { amount = it }
            Dropdown("Frequency", Frequency.entries.filter { it != Frequency.ONE_TIME }.map { frequencyLabels[it]!! }, frequencyLabels[freq]!!) {
                freq = Frequency.entries.filter { f -> f != Frequency.ONE_TIME }[it] }
            if (freq == Frequency.CUSTOM) NumField("Repeat every N days", custom) { custom = it }
            if (freq == Frequency.MONTHLY) NumField("Due day of month", dueDay) { dueDay = it }
            if (freq == Frequency.DAILY) Row(verticalAlignment = Alignment.CenterVertically) {
                Switch(skipSunday, { skipSunday = it }); Spacer(Modifier.width(8.dp)); Text("Monday–Saturday only (no Sundays)") }
            DateField("Start date", start, { it?.let { d -> start = d } })
            DateField("End date (optional)", end, { end = it }, clearable = true)
            Dropdown("Category", cats.map { it.name }, selCat?.name ?: "") { catId = cats[it].id }
            Dropdown("Payment method", methods.map { it.name }, method) { method = methods[it].name }
        }
    }
}

// ===================== EMI =====================
private val purposes = listOf("Mobile Phone", "Laptop", "Bike", "Car", "TV", "Furniture", "Education", "Medical",
    "Personal Loan", "Home Appliance", "Credit Card", "Other")

@Composable
fun EmiForm(vm: AppViewModel, id: Long, done: () -> Unit) {
    val old = remember(id) { vm.emis.value.firstOrNull { it.id == id } }
    var name by remember { mutableStateOf(old?.name ?: "") }
    var purpose by remember { mutableStateOf(old?.purpose ?: "Other") }
    var customPurpose by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf(old?.description ?: "") }
    var lender by remember { mutableStateOf(old?.lender ?: "") }
    var original by remember { mutableStateOf(paiseToField(old?.originalAmount)) }
    var down by remember { mutableStateOf(paiseToField(old?.downPayment)) }
    var remaining by remember { mutableStateOf(paiseToField(old?.remainingPrincipal)) }
    var emi by remember { mutableStateOf(paiseToField(old?.monthlyEmi)) }
    var rate by remember { mutableStateOf(old?.interestRatePercent?.toString() ?: "") }
    var type by remember { mutableStateOf(old?.interestType ?: InterestType.UNKNOWN) }
    var fee by remember { mutableStateOf(paiseToField(old?.processingFee)) }
    var other by remember { mutableStateOf(paiseToField(old?.otherCharges)) }
    var byDates by remember { mutableStateOf(false) }
    var months by remember { mutableStateOf(old?.totalMonths?.toString() ?: "") }
    var start by remember { mutableStateOf(ep(old?.startDate) ?: LocalDate.now()) }
    var end by remember { mutableStateOf<LocalDate?>(null) }
    var dueDay by remember { mutableStateOf((old?.dueDay ?: 5).toString()) }
    var status by remember { mutableStateOf(old?.status ?: ItemStatus.ACTIVE) }
    var err by remember { mutableStateOf<String?>(null) }

    ScreenScaffold(if (old == null) "Add EMI" else "Edit EMI", done) {
        FormBody(err, onSave = {
            val n = if (byDates) end?.let { LoanMath.monthsBetween(start, it) } else months.toIntOrNull()
            val e = Money.parse(emi)
            err = when {
                name.isBlank() -> "Enter an EMI name"
                e == null || e <= 0 -> "Enter the monthly EMI amount"
                n == null || n <= 0 -> if (byDates) "End date must be on or after start date" else "Enter number of months (1 or more)"
                n > 600 -> "Duration is too long"
                dayOf(dueDay) == null -> "Due day must be 1-31"
                listOf(original, down, remaining, fee, other).any { it.isNotBlank() && Money.parse(it) == null } -> "Check the amounts"
                rate.isNotBlank() && rate.toDoubleOrNull() == null -> "Interest rate must be a number"
                else -> null
            }
            if (err == null) {
                val row = Emi(old?.id ?: 0, name.trim(), customPurpose.trim().ifBlank { purpose }, desc, lender,
                    Money.parse(original) ?: 0, Money.parse(down) ?: 0, Money.parse(remaining) ?: 0, e!!,
                    rate.toDoubleOrNull(), type, Money.parse(fee) ?: 0, Money.parse(other) ?: 0, n!!,
                    start.toEpochDay(), dayOf(dueDay) ?: 1, status)
                vm.run { if (old == null) vm.repo.addEmi(row) else vm.repo.updateEmi(row) }
                done()
            }
        }) {
            Text("Basic information", style = MaterialTheme.typography.titleSmall)
            TextF("EMI name", name, { name = it })
            Dropdown("Purpose", purposes, purpose) { purpose = purposes[it]; customPurpose = "" }
            TextF("…or custom purpose (e.g. Phone purchased for work)", customPurpose, { customPurpose = it })
            TextF("Description", desc, { desc = it })
            TextF("Lender / company", lender, { lender = it })
            MoneyField("Original purchase / loan amount", original) { original = it }
            MoneyField("Down payment", down) { down = it }
            MoneyField("Remaining principal", remaining) { remaining = it }
            Text("EMI details", style = MaterialTheme.typography.titleSmall)
            MoneyField("Monthly EMI", emi) { emi = it }
            NumField("Interest rate % p.a. (optional)", rate) { rate = it }
            Dropdown("Interest type", InterestType.entries.map { interestLabels[it]!! }, interestLabels[type]!!) { type = InterestType.entries[it] }
            if (rate.toDoubleOrNull() != null && type != InterestType.UNKNOWN) {
                val n = months.toIntOrNull() ?: 0
                val base = (Money.parse(original) ?: 0) - (Money.parse(down) ?: 0)
                val sug = if (base > 0) LoanMath.suggestedEmi(base, rate.toDouble(), n, type) else null
                if (sug != null) TextButton(onClick = { emi = paiseToField(sug) }) { Text("Use calculated EMI: ${m(sug)}") }
            }
            MoneyField("Processing fee", fee) { fee = it }
            MoneyField("Other charges", other) { other = it }
            Text("Duration", style = MaterialTheme.typography.titleSmall)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Switch(byDates, { byDates = it }); Spacer(Modifier.width(8.dp)); Text(if (byDates) "Using start and end dates" else "Using number of months") }
            if (!byDates) NumField("Number of months", months) { months = it.filter { c -> c.isDigit() } }
            DateField("Start date", start, { it?.let { d -> start = d } })
            if (byDates) {
                DateField("End date", end, { end = it })
                end?.let { e -> LoanMath.monthsBetween(start, e)?.let { Text("Duration: $it months") } }
            }
            NumField("EMI due day of month", dueDay) { dueDay = it }
            Dropdown("Status", ItemStatus.entries.map { it.name.lowercase().replaceFirstChar(Char::uppercase) },
                status.name.lowercase().replaceFirstChar(Char::uppercase)) { status = ItemStatus.entries[it] }
        }
    }
}

// ===================== LOAN =====================
@Composable
fun LoanForm(vm: AppViewModel, id: Long, done: () -> Unit) {
    val old = remember(id) { vm.loans.value.firstOrNull { it.id == id } }
    var name by remember { mutableStateOf(old?.name ?: "") }
    var provider by remember { mutableStateOf(old?.provider ?: "") }
    var purpose by remember { mutableStateOf(old?.purpose ?: "") }
    var principal by remember { mutableStateOf(paiseToField(old?.principal)) }
    var rate by remember { mutableStateOf(old?.interestRatePercent?.toString() ?: "") }
    var type by remember { mutableStateOf(old?.interestType ?: InterestType.UNKNOWN) }
    var tenure by remember { mutableStateOf(old?.tenureMonths?.toString() ?: "") }
    var start by remember { mutableStateOf(ep(old?.startDate) ?: LocalDate.now()) }
    var emi by remember { mutableStateOf(paiseToField(old?.emi)) }
    var fee by remember { mutableStateOf(paiseToField(old?.processingFee)) }
    var insurance by remember { mutableStateOf(paiseToField(old?.insurance)) }
    var other by remember { mutableStateOf(paiseToField(old?.otherCharges)) }
    var total by remember { mutableStateOf(paiseToField(old?.totalRepaymentOverride)) }
    var dueDay by remember { mutableStateOf((old?.dueDay ?: 5).toString()) }
    var err by remember { mutableStateOf<String?>(null) }

    ScreenScaffold(if (old == null) "Add loan" else "Edit loan", done) {
        FormBody(err, onSave = {
            val p = Money.parse(principal)
            val t = tenure.toIntOrNull()
            err = when {
                name.isBlank() -> "Enter a loan name"
                p == null || p <= 0 -> "Enter the principal amount"
                t == null || t <= 0 || t > 600 -> "Enter a valid tenure in months"
                rate.isNotBlank() && rate.toDoubleOrNull() == null -> "Interest rate must be a number"
                listOf(emi, fee, insurance, other, total).any { it.isNotBlank() && Money.parse(it) == null } -> "Check the amounts"
                dayOf(dueDay) == null -> "Due day must be 1-31"
                else -> null
            }
            if (err == null) {
                val row = Loan(old?.id ?: 0, name.trim(), provider, purpose, p!!, rate.toDoubleOrNull(), type, t!!,
                    start.toEpochDay(), Money.parse(emi)?.takeIf { it > 0 }, Money.parse(fee) ?: 0, Money.parse(insurance) ?: 0,
                    Money.parse(other) ?: 0, Money.parse(total)?.takeIf { it > 0 }, dayOf(dueDay) ?: 1, old?.status ?: ItemStatus.ACTIVE)
                vm.run { if (old == null) vm.repo.addLoan(row) else vm.repo.updateLoan(row) }
                done()
            }
        }) {
            TextF("Loan name", name, { name = it })
            TextF("Provider (bank / company)", provider, { provider = it })
            TextF("Purpose", purpose, { purpose = it })
            MoneyField("Principal amount", principal) { principal = it }
            NumField("Interest rate % p.a. (you enter it)", rate) { rate = it }
            Dropdown("Interest type", InterestType.entries.map { interestLabels[it]!! }, interestLabels[type]!!) { type = InterestType.entries[it] }
            NumField("Tenure (months)", tenure) { tenure = it.filter { c -> c.isDigit() } }
            DateField("Start date", start, { it?.let { d -> start = d } })
            MoneyField("EMI (leave empty if unknown)", emi) { emi = it }
            val sug = LoanMath.suggestedEmi(Money.parse(principal) ?: 0, rate.toDoubleOrNull(), tenure.toIntOrNull() ?: 0, type)
            if (sug != null && sug > 0) TextButton(onClick = { emi = paiseToField(sug) }) { Text("Use calculated EMI: ${m(sug)}") }
            MoneyField("Processing fee", fee) { fee = it }
            MoneyField("Insurance", insurance) { insurance = it }
            MoneyField("Other charges", other) { other = it }
            MoneyField("Total repayment (optional, overrides calculation)", total) { total = it }
            NumField("EMI due day of month", dueDay) { dueDay = it }
        }
    }
}

// ===================== DEBT =====================
@Composable
fun DebtForm(vm: AppViewModel, done: () -> Unit) {
    var person by remember { mutableStateOf("") }
    var dir by remember { mutableStateOf(DebtDirection.I_OWE) }
    var amount by remember { mutableStateOf("") }
    var purpose by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(LocalDate.now()) }
    var due by remember { mutableStateOf<LocalDate?>(null) }
    var notes by remember { mutableStateOf("") }
    var err by remember { mutableStateOf<String?>(null) }
    ScreenScaffold("Add debt", done) {
        FormBody(err, onSave = {
            val a = Money.parse(amount)
            err = when {
                person.isBlank() -> "Enter the person's name"
                a == null || a <= 0 -> "Enter a valid amount"
                due != null && due!!.isBefore(date) -> "Due date cannot be before the date"
                else -> null
            }
            if (err == null) { vm.run { vm.db.debtDao().insert(Debt(0, person.trim(), dir, a!!, purpose, date.toEpochDay(), due.ep(), notes)) }; done() }
        }) {
            Dropdown("Type", listOf("Money I owe", "Money others owe me"), if (dir == DebtDirection.I_OWE) "Money I owe" else "Money others owe me") {
                dir = if (it == 0) DebtDirection.I_OWE else DebtDirection.OWED_TO_ME }
            TextF("Person", person, { person = it })
            MoneyField("Amount", amount) { amount = it }
            TextF("Purpose", purpose, { purpose = it })
            DateField("Date", date, { it?.let { d -> date = d } })
            DateField(if (dir == DebtDirection.I_OWE) "Due date" else "Expected repayment date", due, { due = it }, clearable = true)
            TextF("Notes", notes, { notes = it })
        }
    }
}

// ===================== SAVINGS GOAL =====================
@Composable
fun SavingsForm(vm: AppViewModel, id: Long, done: () -> Unit) {
    val old = remember(id) { vm.goals.value.firstOrNull { it.id == id } }
    var name by remember { mutableStateOf(old?.name ?: "") }
    var target by remember { mutableStateOf(paiseToField(old?.targetAmount)) }
    var current by remember { mutableStateOf(paiseToField(old?.currentAmount)) }
    var date by remember { mutableStateOf(ep(old?.targetDate)) }
    var notes by remember { mutableStateOf(old?.notes ?: "") }
    var err by remember { mutableStateOf<String?>(null) }
    ScreenScaffold(if (old == null) "Add savings goal" else "Edit savings goal", done) {
        FormBody(err, onSave = {
            val t = Money.parse(target)
            val c = if (current.isBlank()) 0L else Money.parse(current)
            err = when {
                name.isBlank() -> "Enter a goal name"
                t == null || t <= 0 -> "Enter a target amount"
                c == null -> "Current amount is not valid"
                else -> null
            }
            if (err == null) {
                val row = SavingsGoal(old?.id ?: 0, name.trim(), t!!, c!!, date.ep(), notes)
                vm.run { if (old == null) vm.db.savingsDao().insert(row) else vm.db.savingsDao().update(row) }
                done()
            }
        }) {
            TextF("Goal name", name, { name = it })
            MoneyField("Target amount", target) { target = it }
            MoneyField("Current amount", current) { current = it }
            DateField("Target date (optional)", date, { date = it }, clearable = true)
            TextF("Notes", notes, { notes = it })
        }
    }
}
