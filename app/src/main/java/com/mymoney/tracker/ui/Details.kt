package com.mymoney.tracker.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.mymoney.tracker.data.entity.*
import com.mymoney.tracker.domain.LoanMath
import com.mymoney.tracker.domain.Money
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter

// ===================== EMI DETAIL =====================
@Composable
fun EmiDetail(vm: AppViewModel, id: Long, nav: (String) -> Unit, back: () -> Unit) {
    val emis by vm.emis.collectAsState()
    val all by vm.emiPayments.collectAsState()
    val e = emis.firstOrNull { it.id == id }
    var del by remember { mutableStateOf(false) }
    var partial by remember { mutableStateOf<EmiPayment?>(null) }
    if (e == null) { LaunchedEffect(Unit) { back() }; return }
    val pays = all.filter { it.emiId == id }.sortedBy { it.installmentNo }
    val st = LoanMath.emiStats(e, pays)

    ScreenScaffold(e.name, back, actions = {
        IconButton(onClick = { nav("emi_form/$id") }) { Icon(Icons.Default.Edit, "Edit EMI") }
        IconButton(onClick = { del = true }) { Icon(Icons.Default.Delete, "Delete EMI") }
    }) {
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            item {
                SectionCard {
                    if (st.isComplete) Text("COMPLETED — ${m(e.monthlyEmi)}/month freed", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                    Text("${e.purpose}${if (e.lender.isNotBlank()) " · ${e.lender}" else ""}", style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(8.dp))
                    StatRow("Total payments", st.totalPayments.toString())
                    StatRow("Paid", "${st.paidCount} (${m(st.paidAmount)})")
                    StatRow("Remaining amount", m(st.remainingAmount))
                    StatRow("Remaining months", st.remainingMonths.toString())
                    StatRow("Next due", st.nextDue?.format(DateTimeFormatter.ofPattern("dd MMM yyyy")) ?: "—")
                    StatRow("Completion date", st.completionDate?.format(DateTimeFormatter.ofPattern("dd MMM yyyy")) ?: "—")
                    StatRow("Total interest", if (e.interestRatePercent == null && st.totalInterest == 0L) "Not set" else m(st.totalInterest))
                    StatRow("Charges (fee + other)", m(st.totalCharges))
                    Spacer(Modifier.height(6.dp))
                    ProgressLine(if (st.totalPayments > 0) st.paidCount.toFloat() / st.totalPayments else 0f, "${st.paidCount}/${st.totalPayments} paid")
                }
            }
            items(pays, key = { it.id }) { p ->
                SectionCard {
                    Text("Payment ${p.installmentNo} — ${p.status.name.lowercase().replaceFirstChar(Char::uppercase)}", style = MaterialTheme.typography.titleSmall)
                    Text("Due ${dateStr(p.dueDate)} · ${m(p.amountDue)}" + if (p.amountPaid > 0) " · paid ${m(p.amountPaid)}" else "", style = MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (p.status != PaymentStatus.PAID) TextButton(onClick = { vm.run { vm.repo.setEmiPayment(p, PaymentStatus.PAID, 0) } }) { Text("Mark paid") }
                        if (p.status != PaymentStatus.PENDING) TextButton(onClick = { vm.run { vm.repo.setEmiPayment(p, PaymentStatus.PENDING, 0) } }) { Text("Pending") }
                        if (p.status != PaymentStatus.SKIPPED) TextButton(onClick = { vm.run { vm.repo.setEmiPayment(p, PaymentStatus.SKIPPED, 0) } }) { Text("Skip") }
                        TextButton(onClick = { partial = p }) { Text("Partial") }
                    }
                }
            }
            item { TextButton(onClick = {
                vm.run { vm.db.emiDao().insertPayment(EmiPayment(emiId = id, installmentNo = (pays.maxOfOrNull { it.installmentNo } ?: 0) + 1,
                    dueDate = LocalDate.now().toEpochDay(), amountDue = e.monthlyEmi)) }
            }, modifier = Modifier.padding(horizontal = 16.dp)) { Text("+ Add manual payment") } }
        }
    }
    partial?.let { p -> AmountDialog("Partial payment (due ${m(p.amountDue)})", onDone = { a ->
        if (a >= p.amountDue) vm.run { vm.repo.setEmiPayment(p, PaymentStatus.PAID, 0) }
        else vm.run { vm.repo.setEmiPayment(p, PaymentStatus.PARTIAL, a) } }, onDismiss = { partial = null }) }
    if (del) ConfirmDialog("Delete EMI?", "Its payment history is deleted too.", { vm.run { vm.db.emiDao().delete(e) }; back() }) { del = false }
}

// ===================== LOAN DETAIL =====================
@Composable
fun LoanDetail(vm: AppViewModel, id: Long, nav: (String) -> Unit, back: () -> Unit) {
    val loans by vm.loans.collectAsState()
    val all by vm.loanPayments.collectAsState()
    val l = loans.firstOrNull { it.id == id }
    var del by remember { mutableStateOf(false) }
    var partial by remember { mutableStateOf<LoanPayment?>(null) }
    if (l == null) { LaunchedEffect(Unit) { back() }; return }
    val pays = all.filter { it.loanId == id }.sortedBy { it.installmentNo }
    val st = LoanMath.loanStats(l, pays)

    ScreenScaffold(l.name, back, actions = {
        IconButton(onClick = { nav("loan_form/$id") }) { Icon(Icons.Default.Edit, "Edit loan") }
        IconButton(onClick = { del = true }) { Icon(Icons.Default.Delete, "Delete loan") }
    }) {
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            item {
                SectionCard {
                    if (pays.isEmpty()) Text("No schedule yet. Edit the loan and enter the interest rate and type, or the EMI.", color = MaterialTheme.colorScheme.error)
                    StatRow("Principal", m(l.principal))
                    StatRow("Interest rate", l.interestRatePercent?.let { "$it% (${interestLabels[l.interestType]})" } ?: "Not entered")
                    StatRow("Total interest", m(st.totalInterest))
                    StatRow("Total repayment", m(st.totalRepayment))
                    StatRow("Principal paid", m(st.principalPaid))
                    StatRow("Interest paid", m(st.interestPaid))
                    StatRow("Remaining principal", m(st.remainingPrincipal))
                    StatRow("Remaining EMIs", st.remainingEmis.toString())
                    StatRow("Completion date", st.completionDate?.format(DateTimeFormatter.ofPattern("dd MMM yyyy")) ?: "—")
                    Spacer(Modifier.height(6.dp))
                    ProgressLine(st.progressPercent / 100f, "${m(st.paidAmount)} / ${m(st.totalRepayment)} paid · ${st.progressPercent}% complete")
                }
            }
            items(pays, key = { it.id }) { p ->
                SectionCard {
                    Text("EMI ${p.installmentNo} — ${p.status.name.lowercase().replaceFirstChar(Char::uppercase)}", style = MaterialTheme.typography.titleSmall)
                    Text("Due ${dateStr(p.dueDate)} · ${m(p.amountDue)} (principal ${m(p.principalPart)}, interest ${m(p.interestPart)})", style = MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (p.status != PaymentStatus.PAID) TextButton(onClick = { vm.run { vm.repo.setLoanPayment(p, PaymentStatus.PAID, 0) } }) { Text("Mark paid") }
                        if (p.status != PaymentStatus.PENDING) TextButton(onClick = { vm.run { vm.repo.setLoanPayment(p, PaymentStatus.PENDING, 0) } }) { Text("Pending") }
                        if (p.status != PaymentStatus.SKIPPED) TextButton(onClick = { vm.run { vm.repo.setLoanPayment(p, PaymentStatus.SKIPPED, 0) } }) { Text("Skip") }
                        TextButton(onClick = { partial = p }) { Text("Partial") }
                    }
                }
            }
        }
    }
    partial?.let { p -> AmountDialog("Partial payment (due ${m(p.amountDue)})", onDone = { a ->
        if (a >= p.amountDue) vm.run { vm.repo.setLoanPayment(p, PaymentStatus.PAID, 0) }
        else vm.run { vm.repo.setLoanPayment(p, PaymentStatus.PARTIAL, a) } }, onDismiss = { partial = null }) }
    if (del) ConfirmDialog("Delete loan?", "Its payment history is deleted too.", { vm.run { vm.db.loanDao().delete(l) }; back() }) { del = false }
}

// ===================== DEBTS =====================
@Composable
fun DebtsScreen(vm: AppViewModel, nav: (String) -> Unit, back: () -> Unit) {
    var tab by remember { mutableIntStateOf(0) }
    val debts by vm.debts.collectAsState()
    val pays by vm.debtPayments.collectAsState()
    var payFor by remember { mutableStateOf<Debt?>(null) }
    var delete by remember { mutableStateOf<Debt?>(null) }
    val dir = if (tab == 0) DebtDirection.I_OWE else DebtDirection.OWED_TO_ME
    val list = debts.filter { it.direction == dir }
    fun paid(d: Debt) = pays.filter { it.debtId == d.id }.sumOf { it.amount }
    val outstanding = list.sumOf { (it.amount - paid(it)).coerceAtLeast(0) }

    ScreenScaffold("Friend & personal debts", back, actions = { TextButton(onClick = { nav("debt_form") }) { Text("Add") } }) {
        TabRow(tab) { listOf("Money I owe", "Owed to me").forEachIndexed { i, t -> Tab(tab == i, { tab = i }, text = { Text(t) }) } }
        SectionCard { StatRow("Total outstanding", m(outstanding), bold = true) }
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            if (list.isEmpty()) item { EmptyHint("Nothing here") }
            items(list, key = { it.id }) { d ->
                val p = paid(d); val rem = (d.amount - p).coerceAtLeast(0)
                SectionCard {
                    Text(d.person, style = MaterialTheme.typography.titleMedium)
                    Text("${d.purpose} · ${dateStr(d.date)}" + (d.dueDate?.let { " · due ${dateStr(it)}" } ?: ""), style = MaterialTheme.typography.bodySmall)
                    StatRow("Amount", m(d.amount)); StatRow(if (dir == DebtDirection.I_OWE) "Paid" else "Received", m(p)); StatRow("Remaining", m(rem), bold = true)
                    ProgressLine(if (d.amount > 0) p.toFloat() / d.amount else 0f, if (rem == 0L) "Settled" else "${m(rem)} left")
                    Row {
                        if (rem > 0) TextButton(onClick = { payFor = d }) { Text(if (dir == DebtDirection.I_OWE) "Add payment" else "Add received") }
                        TextButton(onClick = { delete = d }) { Text("Delete") }
                    }
                }
            }
        }
    }
    payFor?.let { d -> val rem = d.amount - paid(d)
        AmountDialog("Amount (remaining ${m(rem)})", initial = paiseToField(rem), onDone = { a ->
            if (a > rem) vm.message.value = "Amount is more than the remaining ${m(rem)}"
            else vm.run { vm.db.debtDao().insertPayment(DebtPayment(debtId = d.id, amount = a, date = LocalDate.now().toEpochDay())) }
        }, onDismiss = { payFor = null }) }
    delete?.let { ConfirmDialog("Delete debt?", "Payments are deleted too.", { vm.run { vm.db.debtDao().delete(it) } }) { delete = null } }
}

// ===================== SAVINGS =====================
@Composable
fun SavingsScreen(vm: AppViewModel, nav: (String) -> Unit, back: () -> Unit) {
    val goals by vm.goals.collectAsState()
    var add by remember { mutableStateOf<SavingsGoal?>(null) }
    var take by remember { mutableStateOf<SavingsGoal?>(null) }
    var delete by remember { mutableStateOf<SavingsGoal?>(null) }
    ScreenScaffold("Savings goals", back, actions = { TextButton(onClick = { nav("savings_form") }) { Text("Add") } }) {
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            if (goals.isEmpty()) item { EmptyHint("No goals yet") }
            items(goals, key = { it.id }) { g ->
                val pct = if (g.targetAmount > 0) (g.currentAmount * 100 / g.targetAmount).toInt() else 0
                SectionCard {
                    Text(g.name, style = MaterialTheme.typography.titleMedium)
                    StatRow("Saved", "${m(g.currentAmount)} of ${m(g.targetAmount)}")
                    StatRow("Remaining", m((g.targetAmount - g.currentAmount).coerceAtLeast(0)))
                    g.targetDate?.let { StatRow("Deadline", dateStr(it)) }
                    ProgressLine(pct / 100f, "$pct%")
                    Row {
                        TextButton(onClick = { add = g }) { Text("Add money") }
                        TextButton(onClick = { take = g }) { Text("Withdraw") }
                        TextButton(onClick = { nav("savings_form/${g.id}") }) { Text("Edit") }
                        TextButton(onClick = { delete = g }) { Text("Delete") }
                    }
                }
            }
        }
    }
    add?.let { g -> AmountDialog("Add to ${g.name}", "Add", onDone = { a -> vm.run { vm.repo.adjustSavings(g, a) } }, onDismiss = { add = null }) }
    take?.let { g -> AmountDialog("Withdraw from ${g.name}", "Withdraw", onDone = { a ->
        vm.run { if (!vm.repo.adjustSavings(g, -a)) vm.message.value = "You only have ${m(g.currentAmount)} saved" } }, onDismiss = { take = null }) }
    delete?.let { ConfirmDialog("Delete goal?", "This cannot be undone.", { vm.run { vm.db.savingsDao().delete(it) } }) { delete = null } }
}

// ===================== MONTHLY PLAN =====================
@Composable
fun PlanScreen(vm: AppViewModel, back: () -> Unit) {
    val rows by vm.forecast.collectAsState()
    val n by vm.forecastMonths.collectAsState()
    var customOpen by remember { mutableStateOf(false) }
    ScreenScaffold("Monthly plan", back) {
        Row(Modifier.padding(12.dp, 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(1, 3, 6, 12, 24).forEach { c -> FilterChip(n == c, { vm.forecastMonths.value = c }, label = { Text("$c") }) }
            FilterChip(n !in listOf(1, 3, 6, 12, 24), { customOpen = true }, label = { Text(if (n in listOf(1, 3, 6, 12, 24)) "Custom" else "$n") })
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            items(rows) { s ->
                SectionCard {
                    Text(s.month.format(DateTimeFormatter.ofPattern("MMMM yyyy")), style = MaterialTheme.typography.titleMedium)
                    s.incomeBySource.forEach { (k, v) -> StatRow(k, m(v)) }
                    StatRow("Total income", m(s.totalIncome), bold = true)
                    HorizontalDivider(Modifier.padding(vertical = 4.dp))
                    StatRow("Rent", m(s.rent))
                    StatRow("Other expenses", m(s.totalExpenses - s.rent))
                    StatRow("EMI", m(s.emi)); StatRow("Loan", m(s.loan)); StatRow("Friend / debt payments", m(s.debtPayments))
                    HorizontalDivider(Modifier.padding(vertical = 4.dp))
                    StatRow("Remaining", m(s.remaining), bold = true)
                }
            }
        }
    }
    if (customOpen) {
        var t by remember { mutableStateOf("") }
        AlertDialog(onDismissRequest = { customOpen = false }, title = { Text("Number of months") },
            text = { NumField("Months (1-120)", t) { t = it.filter { c -> c.isDigit() } } },
            confirmButton = { TextButton(onClick = { t.toIntOrNull()?.takeIf { it in 1..120 }?.let { vm.forecastMonths.value = it; customOpen = false } }) { Text("OK") } },
            dismissButton = { TextButton(onClick = { customOpen = false }) { Text("Cancel") } })
    }
}

// ===================== FUTURE CHANGES =====================
@Composable
fun ChangesScreen(vm: AppViewModel, back: () -> Unit) {
    val changes by vm.changes.collectAsState()
    val incomes by vm.incomes.collectAsState()
    val recurring by vm.recurring.collectAsState()
    val emis by vm.emis.collectAsState()
    var show by remember { mutableStateOf(false) }
    var delete by remember { mutableStateOf<ScheduledChange?>(null) }
    fun nameOf(c: ScheduledChange) = when (c.targetType) {
        ChangeTarget.INCOME -> incomes.firstOrNull { it.id == c.targetId }?.name
        ChangeTarget.RECURRING_EXPENSE -> recurring.firstOrNull { it.id == c.targetId }?.name
        ChangeTarget.EMI -> emis.firstOrNull { it.id == c.targetId }?.name
    } ?: "(deleted)"

    ScreenScaffold("Future changes", back, actions = { TextButton(onClick = { show = true }) { Text("Add") } }) {
        Text("Schedule a new amount from a date onward, e.g. salary ₹35,000 from January, or rent ₹8,500 from February. The plan and dashboard use the right amount for each month.",
            modifier = Modifier.padding(16.dp), style = MaterialTheme.typography.bodySmall)
        LazyColumn {
            if (changes.isEmpty()) item { EmptyHint("No scheduled changes") }
            items(changes.sortedBy { it.effectiveFrom }, key = { it.id }) { c ->
                ListItem(headlineContent = { Text("${nameOf(c)} → ${m(c.newAmount)}") },
                    supportingContent = { Text("${c.targetType.name.lowercase().replace('_', ' ')} · from ${dateStr(c.effectiveFrom)}") },
                    trailingContent = { IconButton(onClick = { delete = c }) { Icon(Icons.Default.Delete, "Delete change") } })
            }
        }
    }
    if (show) {
        var type by remember { mutableStateOf(ChangeTarget.INCOME) }
        var sel by remember { mutableIntStateOf(0) }
        var from by remember { mutableStateOf(LocalDate.now().withDayOfMonth(1).plusMonths(1)) }
        var amt by remember { mutableStateOf("") }
        var err by remember { mutableStateOf<String?>(null) }
        val targets: List<Pair<Long, String>> = when (type) {
            ChangeTarget.INCOME -> incomes.map { it.id to it.name }
            ChangeTarget.RECURRING_EXPENSE -> recurring.map { it.id to it.name }
            ChangeTarget.EMI -> emis.map { it.id to it.name }
        }
        AlertDialog(onDismissRequest = { show = false }, title = { Text("New scheduled change") },
            text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Dropdown("What changes", listOf("Income", "Rent / recurring expense", "EMI"),
                    when (type) { ChangeTarget.INCOME -> "Income"; ChangeTarget.RECURRING_EXPENSE -> "Rent / recurring expense"; else -> "EMI" }) {
                    type = ChangeTarget.entries[it]; sel = 0 }
                Dropdown("Item", targets.map { it.second }, targets.getOrNull(sel)?.second ?: "No items yet") { sel = it }
                DateField("Effective from", from, { it?.let { d -> from = d } })
                MoneyField("New amount", amt) { amt = it; err = null }
                err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            } },
            confirmButton = { TextButton(onClick = {
                val a = Money.parse(amt); val t = targets.getOrNull(sel)
                if (t == null) err = "Add the item first"
                else if (a == null || a < 0) err = "Enter a valid amount"
                else { vm.run { vm.repo.addChange(ScheduledChange(targetType = type, targetId = t.first, effectiveFrom = from.toEpochDay(), newAmount = a)) }; show = false }
            }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { show = false }) { Text("Cancel") } })
    }
    delete?.let { ConfirmDialog("Delete change?", "The original amount applies again.", { vm.run { vm.repo.deleteChange(it) } }) { delete = null } }
}

