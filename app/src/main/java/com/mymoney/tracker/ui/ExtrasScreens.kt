package com.mymoney.tracker.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.mymoney.tracker.data.entity.Expense
import com.mymoney.tracker.domain.Money
import com.mymoney.tracker.extras.Bill
import com.mymoney.tracker.extras.ExtrasStore
import com.mymoney.tracker.extras.TodoItem
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

private val shortDate = DateTimeFormatter.ofPattern("dd MMM")
private val repeatLabels = listOf("Never", "Daily", "Weekly", "Monthly")
private val repeatValues = listOf("", "DAILY", "WEEKLY", "MONTHLY")
private fun repeatText(r: String) = when (r) { "DAILY" -> " · repeats daily"; "WEEKLY" -> " · repeats weekly"; "MONTHLY" -> " · repeats monthly"; else -> "" }

// ===================== TO-DO =====================
@Composable
fun TodoScreen(back: () -> Unit) {
    val items by ExtrasStore.todos.collectAsState()
    var adding by remember { mutableStateOf(false) }
    var delete by remember { mutableStateOf<TodoItem?>(null) }
    val today = LocalDate.now()
    ScreenScaffold("To-do", back, actions = { TextButton(onClick = { adding = true }) { Text("Add") } }) {
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            if (items.isEmpty()) item { EmptyHint("No tasks yet.\nTap Add to create one.") }
            items(items.sortedWith(compareBy<TodoItem>({ it.done }, { it.due.ifBlank { "9999" } })), key = { it.id }) { t ->
                val d = runCatching { LocalDate.parse(t.due) }.getOrNull()
                val overdue = !t.done && d != null && d.isBefore(today)
                ListItem(
                    leadingContent = { Checkbox(checked = t.done, onCheckedChange = { if (it && t.repeat.isNotBlank()) ExtrasStore.completeRecurring(t, today) else ExtrasStore.updateTodo(t.copy(done = it)) }) },
                    headlineContent = { Text(t.title, textDecoration = if (t.done) TextDecoration.LineThrough else null) },
                    supportingContent = if (d != null) ({
                        Text((if (overdue) "Overdue · ${d.format(shortDate)}" else if (d == today) "Today" else d.format(shortDate)) + repeatText(t.repeat),
                            color = if (overdue) MaterialTheme.colorScheme.error else Color.Unspecified)
                    }) else null,
                    trailingContent = { IconButton(onClick = { delete = t }) { Icon(Icons.Default.Delete, "Delete task") } })
            }
        }
    }
    if (adding) TodoDialog(onDone = { title, due, remind, rep -> ExtrasStore.addTodo(title, due, remind, rep) }, onDismiss = { adding = false })
    delete?.let { t -> ConfirmDialog("Delete task?", t.title, { ExtrasStore.deleteTodo(t.id) }) { delete = null } }
}

@Composable
private fun TodoDialog(onDone: (String, String, Boolean, String) -> Unit, onDismiss: () -> Unit) {
    var title by remember { mutableStateOf("") }
    var due by remember { mutableStateOf<LocalDate?>(null) }
    var remind by remember { mutableStateOf(true) }
    var rep by remember { mutableStateOf(0) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("New task") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                TextF("Task", title, { title = it })
                DateField("Due date (optional)", due, { due = it }, clearable = true)
                Dropdown("Repeat", repeatLabels, repeatLabels[rep]) { rep = it }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Remind me (time is in Settings)", Modifier.weight(1f))
                    Switch(checked = remind, onCheckedChange = { remind = it })
                }
            }
        },
        confirmButton = { TextButton(onClick = {
            if (title.isNotBlank()) { onDone(title, due?.toString() ?: "", remind, repeatValues[rep]); onDismiss() }
        }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}

// ===================== BILLS =====================
@Composable
fun BillsScreen(vm: AppViewModel, back: () -> Unit) {
    val bills by ExtrasStore.bills.collectAsState()
    val cats by vm.categories.collectAsState()
    var adding by remember { mutableStateOf(false) }
    var edit by remember { mutableStateOf<Bill?>(null) }
    var delete by remember { mutableStateOf<Bill?>(null) }
    val today = LocalDate.now()
    val thisMonth = YearMonth.from(today).toString()
    fun togglePaid(b: Bill, paid: Boolean) {
        ExtrasStore.setBillPaid(b.id, !paid, thisMonth)
        if (paid) {
            vm.message.value = "Marked unpaid. If an expense was added, delete it in Transactions."
            return
        }
        if (b.amount <= 0L) return
        val cat = cats.firstOrNull { it.name == "Bills" } ?: cats.firstOrNull { it.name == "Other" } ?: cats.firstOrNull() ?: return
        vm.run("Marked paid and added to your expenses") {
            vm.db.expenseDao().insert(Expense(amount = b.amount, categoryId = cat.id, date = today.toEpochDay(), description = b.name))
        }
    }
    ScreenScaffold("Bills & due dates", back, actions = { TextButton(onClick = { adding = true }) { Text("Add") } }) {
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            if (bills.isEmpty()) item { EmptyHint("No bills yet.\nAdd rent, electricity, internet, insurance…") }
            items(bills.sortedBy { ExtrasStore.nextDue(it, today) }, key = { it.id }) { b ->
                val d = ExtrasStore.nextDue(b, today)
                val days = ChronoUnit.DAYS.between(today, d).toInt()
                val paid = b.paidMonth == thisMonth
                val status = when {
                    paid -> "Paid this month ✓ · next due ${d.format(shortDate)}"
                    days < 0 -> "Overdue by ${-days} days"
                    days == 0 -> "Due today"
                    days == 1 -> "Due tomorrow"
                    else -> "Due in $days days · ${d.format(shortDate)}"
                }
                SectionCard {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(b.name, style = MaterialTheme.typography.titleMedium)
                        if (b.amount > 0L) Text(m(b.amount), style = MaterialTheme.typography.titleMedium)
                    }
                    Text(status, color = if (paid) MaterialTheme.colorScheme.primary else if (days < 0) MaterialTheme.colorScheme.error else Color.Unspecified)
                    Row {
                        TextButton(onClick = { togglePaid(b, paid) }) { Text(if (paid) "Mark unpaid" else "Mark paid") }
                        TextButton(onClick = { edit = b }) { Text("Edit") }
                        TextButton(onClick = { delete = b }) { Text("Delete") }
                    }
                }
            }
        }
    }
    if (adding) BillDialog(null, { ExtrasStore.saveBill(it) }) { adding = false }
    edit?.let { b -> BillDialog(b, { ExtrasStore.saveBill(it) }) { edit = null } }
    delete?.let { b -> ConfirmDialog("Delete bill?", b.name, { ExtrasStore.deleteBill(b.id) }) { delete = null } }
}

@Composable
private fun BillDialog(initial: Bill?, onDone: (Bill) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var amt by remember { mutableStateOf(paiseToField(initial?.amount)) }
    var day by remember { mutableStateOf(initial?.dueDay?.toString() ?: "") }
    var rem by remember { mutableStateOf((initial?.remindDays ?: 2).toString()) }
    var err by remember { mutableStateOf<String?>(null) }
    fun trySave() {
        val d = day.toIntOrNull()
        if (name.isBlank()) { err = "Enter a name"; return }
        if (d == null || d < 1 || d > 31) { err = "Due day must be between 1 and 31"; return }
        val r = (rem.toIntOrNull() ?: 2).coerceIn(0, 30)
        onDone(Bill(initial?.id ?: ExtrasStore.newId(), name.trim(), Money.parse(amt) ?: 0L, d, r, initial?.paidMonth ?: ""))
        onDismiss()
    }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(if (initial == null) "New bill" else "Edit bill") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                TextF("Bill name (for example Electricity)", name, { name = it })
                MoneyField("Amount (optional)", amt) { amt = it }
                NumField("Due day of every month (1-31)", day) { day = it }
                NumField("Remind me this many days before", rem) { rem = it }
                err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { TextButton(onClick = { trySave() }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}

// ===================== SHOPPING =====================
@Composable
fun ShoppingScreen(back: () -> Unit) {
    val items by ExtrasStore.shop.collectAsState()
    var name by remember { mutableStateOf("") }
    fun addNow() {
        if (name.isNotBlank()) { ExtrasStore.addShop(name); name = "" }
    }
    ScreenScaffold("Shopping list", back, actions = { TextButton(onClick = { ExtrasStore.clearBought() }) { Text("Clear bought") } }) {
        Row(Modifier.fillMaxWidth().padding(16.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Add an item") }, singleLine = true,
                modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { addNow() }))
            IconButton(onClick = { addNow() }) { Icon(Icons.Default.Add, "Add item") }
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            if (items.isEmpty()) item { EmptyHint("Your list is empty.") }
            items(items.sortedBy { it.done }, key = { it.id }) { s ->
                ListItem(
                    leadingContent = { Checkbox(checked = s.done, onCheckedChange = { ExtrasStore.toggleShop(s.id) }) },
                    headlineContent = { Text(s.name, textDecoration = if (s.done) TextDecoration.LineThrough else null) },
                    trailingContent = { IconButton(onClick = { ExtrasStore.deleteShop(s.id) }) { Icon(Icons.Default.Delete, "Delete item") } })
            }
        }
    }
}
