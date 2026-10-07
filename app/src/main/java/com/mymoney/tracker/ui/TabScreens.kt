package com.mymoney.tracker.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.mymoney.tracker.extras.ExtrasStore
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.mymoney.tracker.data.entity.*
import com.mymoney.tracker.domain.LoanMath
import com.mymoney.tracker.domain.MonthlyEngine
import java.time.YearMonth
import java.time.format.DateTimeFormatter

@Composable
fun MonthNav(ym: YearMonth, onChange: (YearMonth) -> Unit) =
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween) {
        IconButton(onClick = { onChange(ym.minusMonths(1)) }) { Icon(Icons.Default.ChevronLeft, "Previous month") }
        Text(ym.format(DateTimeFormatter.ofPattern("MMMM yyyy")), style = MaterialTheme.typography.titleMedium)
        IconButton(onClick = { onChange(ym.plusMonths(1)) }) { Icon(Icons.Default.ChevronRight, "Next month") }
    }

// ===================== DASHBOARD =====================
@Composable
fun DashboardScreen(vm: AppViewModel) {
    val s by vm.summary.collectAsState()
    val ym by vm.month.collectAsState()
    val goals by vm.goals.collectAsState()
    val health = MonthlyEngine.health(s, s.rent + s.emi + s.loan)
    val food = s.categoryTotals["Food"] ?: 0L
    val travel = s.categoryTotals["Travel"] ?: 0L
    val spentFrac = if (s.totalIncome > 0L) s.totalOutflow.toFloat() / s.totalIncome.toFloat() else 0f
    val intro = animatedFraction(1f, 1000)
    val barFrac = animatedFraction(spentFrac.coerceIn(0f, 1f), 1100).coerceIn(0f, 1f)
    fun shown(v: Long): String = m(if (intro >= 0.999f) v else (v * intro).toLong())
    val soft = Color.White.copy(alpha = 0.85f)
    val bold = androidx.compose.ui.text.font.FontWeight.Bold
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 96.dp)) {
        item { Reveal(0) { Text("My Money Tracker", style = MaterialTheme.typography.headlineSmall, fontWeight = bold,
            modifier = Modifier.padding(16.dp, 16.dp, 16.dp, 0.dp)) } }
        item { MonthNav(ym) { vm.month.value = it } }
        item {
            Reveal(1) {
                Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFF0B5F58), Color(0xFF14B8A6))))
                    .padding(22.dp)) {
                    Column {
                        Text("Left this month", style = MaterialTheme.typography.labelLarge, color = soft)
                        Text(shown(s.remaining), style = MaterialTheme.typography.displayMedium, fontWeight = bold,
                            color = if (s.remaining < 0) Color(0xFFFFB4AB) else Color.White)
                        Spacer(Modifier.height(14.dp))
                        Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(Color.White.copy(alpha = 0.25f))) {
                            Box(Modifier.fillMaxWidth(barFrac).fillMaxHeight().background(
                                if (spentFrac >= 1f) Color(0xFFFFB4AB) else if (spentFrac >= 0.7f) Color(0xFFFFD27A) else Color.White))
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(if (s.totalIncome > 0L) "${(spentFrac * 100).toInt()}% of income spent" else "No income added yet",
                            style = MaterialTheme.typography.bodySmall, color = soft)
                        Spacer(Modifier.height(14.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column {
                                Text("Income", style = MaterialTheme.typography.labelMedium, color = soft)
                                Text(shown(s.totalIncome), style = MaterialTheme.typography.titleMedium, fontWeight = bold, color = Color.White)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("Spent", style = MaterialTheme.typography.labelMedium, color = soft)
                                Text(shown(s.totalOutflow), style = MaterialTheme.typography.titleMedium, fontWeight = bold, color = Color.White)
                            }
                        }
                    }
                }
            }
        }
        item {
            Reveal(2) {
                SectionCard {
                    StatRow("Total income", m(s.totalIncome))
                    StatRow("Total expenses", m(s.totalExpenses))
                    StatRow("Total EMI", m(s.emi))
                    StatRow("Loan payments", m(s.loan))
                    StatRow("Debt payments", m(s.debtPayments))
                    HorizontalDivider(Modifier.padding(vertical = 4.dp))
                    StatRow("Rent", m(s.rent))
                    StatRow("Food", m(food))
                    StatRow("Travel", m(travel))
                    StatRow("Savings (all goals)", m(goals.sumOf { it.currentAmount }))
                }
            }
        }
        if (health.warnings.isNotEmpty()) item {
            Reveal(3) {
                SectionCard {
                    health.warnings.forEach { Text("• $it", modifier = Modifier.padding(vertical = 2.dp)) }
                    health.savingsRatePct?.let { Text("Savings rate $it%  ·  EMI burden ${health.emiBurdenPct ?: 0}%", style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
        item {
            val todos by ExtrasStore.todos.collectAsState()
            val bills by ExtrasStore.bills.collectAsState()
            val shop by ExtrasStore.shop.collectAsState()
            val now = java.time.LocalDate.now()
            val soon = bills.count { java.time.temporal.ChronoUnit.DAYS.between(now, ExtrasStore.nextDue(it, now)) <= 7 }
            Reveal(4) {
                SectionCard {
                    Text("Coming up", style = MaterialTheme.typography.titleMedium)
                    StatRow("Open tasks", todos.count { !it.done }.toString())
                    StatRow("Bills due within 7 days", soon.toString())
                    StatRow("Shopping items left", shop.count { !it.done }.toString())
                }
            }
        }
        if (s.totalIncome == 0L && s.totalOutflow == 0L) item { EmptyHint("Nothing here yet.\nTap + to add income, an expense, an EMI…") }
    }
}

// ===================== TRANSACTIONS =====================
@Composable
fun TransactionsScreen(vm: AppViewModel, nav: (String) -> Unit) {
    var tab by remember { mutableIntStateOf(0) }
    var query by remember { mutableStateOf("") }
    var catFilter by remember { mutableStateOf("All") }
    var thisMonth by remember { mutableStateOf(false) }
    val cats by vm.categories.collectAsState()
    val expenses by vm.expenses.collectAsState()
    val incomes by vm.incomes.collectAsState()
    val recurring by vm.recurring.collectAsState()
    var deleteExp by remember { mutableStateOf<Expense?>(null) }
    var deleteInc by remember { mutableStateOf<Income?>(null) }
    var deleteRec by remember { mutableStateOf<RecurringExpense?>(null) }
    val catName = cats.associate { it.id to it.name }

    Column(Modifier.fillMaxSize()) {
        Text("Transactions", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(16.dp, 16.dp, 16.dp, 0.dp))
        TabRow(tab) {
            listOf("Expenses", "Income", "Recurring").forEachIndexed { i, t -> Tab(tab == i, { tab = i }, text = { Text(t) }) }
        }
        OutlinedTextField(query, { query = it }, label = { Text("Search") }, singleLine = true,
            leadingIcon = { Icon(Icons.Default.Search, null) }, modifier = Modifier.fillMaxWidth().padding(12.dp, 8.dp, 12.dp, 0.dp))
        if (tab == 0) Box(Modifier.padding(12.dp, 4.dp)) {
            Dropdown("Category", listOf("All") + cats.map { it.name }, catFilter) { catFilter = if (it == 0) "All" else cats[it - 1].name }
        }
        if (tab == 0) Row(Modifier.padding(12.dp, 0.dp)) {
            FilterChip(selected = thisMonth, onClick = { thisMonth = !thisMonth }, label = { Text("This month only") })
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 96.dp)) {
            when (tab) {
                0 -> {
                    val list = expenses.filter {
                        (catFilter == "All" || catName[it.categoryId] == catFilter) &&
                        (!thisMonth || YearMonth.from(java.time.LocalDate.ofEpochDay(it.date)) == YearMonth.now()) &&
                            (query.isBlank() || it.description.contains(query, true) || (catName[it.categoryId] ?: "").contains(query, true) ||
                                it.paymentMethod.contains(query, true) || paiseToField(it.amount).contains(query))
                    }
                    if (list.isEmpty()) item { EmptyHint("No expenses found") }
                    items(list, key = { it.id }) { e ->
                        ListItem(
                            headlineContent = { Text(e.description.ifBlank { catName[e.categoryId] ?: "Expense" }) },
                            supportingContent = { Text("${catName[e.categoryId] ?: ""} · ${e.paymentMethod} · ${dateStr(e.date)}") },
                            trailingContent = { Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(m(e.amount))
                                IconButton(onClick = { deleteExp = e }) { Icon(Icons.Default.Delete, "Delete expense") }
                            } },
                            modifier = Modifier.clickable { nav("expense_form/${e.id}") })
                    }
                }
                1 -> {
                    val list = incomes.filter { query.isBlank() || it.name.contains(query, true) || it.source.contains(query, true) }
                    if (list.isEmpty()) item { EmptyHint("No income added") }
                    items(list, key = { it.id }) { i ->
                        ListItem(
                            headlineContent = { Text(i.name + if (i.status == ItemStatus.PAUSED) " (paused)" else "") },
                            supportingContent = { Text("${frequencyLabels[i.frequency]} · from ${dateStr(i.startDate)}" + (i.endDate?.let { " to ${dateStr(it)}" } ?: "")) },
                            trailingContent = { Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(m(i.amount))
                                IconButton(onClick = { vm.run { vm.db.incomeDao().update(i.copy(status = if (i.status == ItemStatus.PAUSED) ItemStatus.ACTIVE else ItemStatus.PAUSED)) } }) {
                                    Icon(if (i.status == ItemStatus.PAUSED) Icons.Default.PlayArrow else Icons.Default.Pause,
                                        if (i.status == ItemStatus.PAUSED) "Resume income" else "Pause income") }
                                IconButton(onClick = { deleteInc = i }) { Icon(Icons.Default.Delete, "Delete income") }
                            } },
                            modifier = Modifier.clickable { nav("income_form/${i.id}") })
                    }
                }
                else -> {
                    val list = recurring.filter { query.isBlank() || it.name.contains(query, true) }
                    if (list.isEmpty()) item { EmptyHint("No recurring payments") }
                    items(list, key = { it.id }) { r ->
                        ListItem(
                            headlineContent = { Text(r.name + if (r.status == ItemStatus.PAUSED) " (paused)" else "") },
                            supportingContent = { Text("${frequencyLabels[r.frequency]} · ${catName[r.categoryId] ?: ""}") },
                            trailingContent = { Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(m(r.amount))
                                IconButton(onClick = { vm.run { vm.db.recurringDao().update(r.copy(status = if (r.status == ItemStatus.PAUSED) ItemStatus.ACTIVE else ItemStatus.PAUSED)) } }) {
                                    Icon(if (r.status == ItemStatus.PAUSED) Icons.Default.PlayArrow else Icons.Default.Pause,
                                        if (r.status == ItemStatus.PAUSED) "Resume" else "Pause") }
                                IconButton(onClick = { deleteRec = r }) { Icon(Icons.Default.Delete, "Delete recurring payment") }
                            } },
                            modifier = Modifier.clickable { nav("recurring_form/${r.id}") })
                    }
                }
            }
        }
    }
    deleteExp?.let { ConfirmDialog("Delete expense?", "This cannot be undone.", { vm.run { vm.db.expenseDao().delete(it) } }) { deleteExp = null } }
    deleteInc?.let { ConfirmDialog("Delete income?", "This cannot be undone.", { vm.run { vm.db.incomeDao().delete(it) } }) { deleteInc = null } }
    deleteRec?.let { ConfirmDialog("Delete recurring payment?", "This cannot be undone.", { vm.run { vm.db.recurringDao().delete(it) } }) { deleteRec = null } }
}

// ===================== BUDGET =====================
@Composable
fun BudgetScreen(vm: AppViewModel) {
    val ym by vm.month.collectAsState()
    val s by vm.summary.collectAsState()
    val budgets by vm.budgets.collectAsState()
    val cats by vm.categories.collectAsState()
    var dialog by remember { mutableStateOf(false) }
    var delete by remember { mutableStateOf<Budget?>(null) }
    val catName = cats.associate { it.id to it.name }

    Column(Modifier.fillMaxSize()) {
        Text("Budget", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(16.dp, 16.dp, 16.dp, 0.dp))
        MonthNav(ym) { vm.month.value = it }
        Button(onClick = { dialog = true }, modifier = Modifier.padding(16.dp, 0.dp)) { Text("Set a category budget") }
        LazyColumn(contentPadding = PaddingValues(bottom = 96.dp)) {
            if (budgets.isEmpty()) item { EmptyHint("No budgets for this month.\nBudgets are per month, so each month can differ.") }
            items(budgets, key = { it.id }) { b ->
                val name = catName[b.categoryId] ?: "Category"
                val spent = s.categoryTotals[name] ?: 0L
                val pct = if (b.limitAmount > 0) (spent * 100 / b.limitAmount).toInt() else 0
                SectionCard(Modifier.clickable { delete = b }) {
                    Text(name, style = MaterialTheme.typography.titleMedium)
                    StatRow("Budget", m(b.limitAmount)); StatRow("Spent", m(spent)); StatRow("Remaining", m(b.limitAmount - spent))
                    ProgressLine(spent.toFloat() / b.limitAmount.coerceAtLeast(1), "$pct% used", danger = pct >= 90)
                    val warn = when { pct >= 100 -> "Budget reached"; pct >= 90 -> "90% used"; pct >= 75 -> "75% used"; else -> null }
                    if (warn != null) Text("⚠ $warn", color = MaterialTheme.colorScheme.error)
                    Text("Tap to remove", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
    if (dialog) {
        var sel by remember { mutableIntStateOf(0) }
        var amt by remember { mutableStateOf("") }
        var err by remember { mutableStateOf<String?>(null) }
        AlertDialog(onDismissRequest = { dialog = false }, title = { Text("Monthly budget") },
            text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Dropdown("Category", cats.map { it.name }, cats.getOrNull(sel)?.name ?: "") { sel = it }
                MoneyField("Budget amount", amt) { amt = it; err = null }
                err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            } },
            confirmButton = { TextButton(onClick = {
                val p = com.mymoney.tracker.domain.Money.parse(amt)
                val c = cats.getOrNull(sel)
                if (p == null || p <= 0 || c == null) err = "Enter an amount greater than 0"
                else { vm.run { vm.db.budgetDao().upsert(Budget(categoryId = c.id, yearMonth = vm.ym(ym), limitAmount = p)) }; dialog = false }
            }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { dialog = false }) { Text("Cancel") } })
    }
    delete?.let { ConfirmDialog("Remove budget?", "Spending is not affected.", { vm.run { vm.db.budgetDao().delete(it) } }) { delete = null } }
}

// ===================== LOANS TAB (EMIs + Loans) =====================
@Composable
fun LoansScreen(vm: AppViewModel, nav: (String) -> Unit) {
    var tab by remember { mutableIntStateOf(0) }
    val emis by vm.emis.collectAsState()
    val loans by vm.loans.collectAsState()
    val ep by vm.emiPayments.collectAsState()
    val lp by vm.loanPayments.collectAsState()
    Column(Modifier.fillMaxSize()) {
        Text("EMIs & Loans", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(16.dp, 16.dp, 16.dp, 0.dp))
        TabRow(tab) { listOf("EMI Manager", "Loan Manager").forEachIndexed { i, t -> Tab(tab == i, { tab = i }, text = { Text(t) }) } }
        LazyColumn(contentPadding = PaddingValues(bottom = 96.dp, top = 8.dp)) {
            if (tab == 0) {
                if (emis.isEmpty()) item { EmptyHint("No EMIs yet. Tap + → Add EMI") }
                items(emis, key = { it.id }) { e ->
                    val st = LoanMath.emiStats(e, ep.filter { it.emiId == e.id })
                    SectionCard(Modifier.clickable { nav("emi/${e.id}") }) {
                        Text(e.name, style = MaterialTheme.typography.titleMedium)
                        Text("${e.purpose} · ${m(e.monthlyEmi)}/month · ${e.status.name.lowercase()}", style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.height(6.dp))
                        ProgressLine(if (st.totalPayments > 0) st.paidCount.toFloat() / st.totalPayments else 0f,
                            "${st.paidCount}/${st.totalPayments} paid · ${st.remainingMonths} months left")
                    }
                }
            } else {
                if (loans.isEmpty()) item { EmptyHint("No loans yet. Tap + → Add Loan") }
                items(loans, key = { it.id }) { l ->
                    val st = LoanMath.loanStats(l, lp.filter { it.loanId == l.id })
                    SectionCard(Modifier.clickable { nav("loan/${l.id}") }) {
                        Text(l.name, style = MaterialTheme.typography.titleMedium)
                        Text("${l.provider} · ${m(l.principal)} · ${l.tenureMonths} months", style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.height(6.dp))
                        if (l.emi == null && lp.none { it.loanId == l.id }) Text("Enter the interest rate / EMI to build the schedule", color = MaterialTheme.colorScheme.error)
                        else ProgressLine(st.progressPercent / 100f, "${m(st.paidAmount)} / ${m(st.totalRepayment)} paid · ${st.progressPercent}%")
                    }
                }
            }
        }
    }
}

// ===================== MORE =====================
@Composable
fun MoreScreen(nav: (String) -> Unit) {
    val items = listOf(
        Triple("To-do list", "todo", Icons.Default.CheckCircle),
        Triple("Bills & due dates", "bills", Icons.Default.Notifications),
        Triple("Shopping list", "shopping", Icons.Default.ShoppingCart),
        Triple("EMI Manager", "tab_loans", Icons.Default.CreditCard),
        Triple("Loan Manager", "tab_loans", Icons.Default.AccountBalance),
        Triple("Friend Debts", "debts", Icons.Default.People),
        Triple("Savings Goals", "savings", Icons.Default.Savings),
        Triple("Monthly Plan", "plan", Icons.Default.EventNote),
        Triple("Future Changes (salary / rent / EMI)", "changes", Icons.Default.TrendingUp),
        Triple("Reports", "reports", Icons.Default.BarChart),
        Triple("Calendar", "calendar", Icons.Default.CalendarMonth),
        Triple("Backup / Restore", "backup", Icons.Default.Backup),
        Triple("Settings", "settings", Icons.Default.Settings))
    LazyColumn(Modifier.fillMaxSize()) {
        item { Text("More", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(16.dp)) }
        items(items) { (label, route, icon) ->
            ListItem(headlineContent = { Text(label) }, leadingContent = { Icon(icon, null) },
                supportingContent = if (route == "later") ({ Text("Coming in Part 3") }) else null,
                modifier = Modifier.clickable(enabled = route != "later") { nav(route) })
        }
    }
}

@Composable
fun AddMenuDialog(onPick: (String) -> Unit, onDismiss: () -> Unit) =
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Add") },
        text = { Column {
            listOf("Expense" to "expense_form/-1", "Income" to "income_form/-1", "EMI" to "emi_form/-1", "Loan" to "loan_form/-1",
                "Debt" to "debt_form", "Savings goal" to "savings_form", "Recurring payment" to "recurring_form/-1").forEach { (l, r) ->
                TextButton(onClick = { onPick(r) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text("Add $l", modifier = Modifier.fillMaxWidth()) }
            }
        } },
        confirmButton = {}, dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } })
