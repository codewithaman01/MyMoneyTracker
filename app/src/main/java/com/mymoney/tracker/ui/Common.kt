package com.mymoney.tracker.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.mymoney.tracker.data.entity.Frequency
import com.mymoney.tracker.data.entity.InterestType
import com.mymoney.tracker.domain.Money
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

object Fmt { var symbol = "₹" }
fun m(paise: Long) = Money.format(paise, Fmt.symbol)
fun dateStr(epoch: Long): String = LocalDate.ofEpochDay(epoch).format(DateTimeFormatter.ofPattern("dd MMM yyyy"))
fun paiseToField(p: Long?): String = if (p == null || p == 0L) "" else (if (p % 100 == 0L) (p / 100).toString() else "%.2f".format(p / 100.0))

val frequencyLabels = mapOf(
    Frequency.ONE_TIME to "One-time", Frequency.DAILY to "Daily", Frequency.WEEKLY to "Weekly",
    Frequency.MONTHLY to "Monthly", Frequency.YEARLY to "Yearly", Frequency.CUSTOM to "Custom (every N days)")
val interestLabels = mapOf(InterestType.REDUCING to "Reducing", InterestType.FLAT to "Flat", InterestType.UNKNOWN to "Unknown")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScreenScaffold(
    title: String, onBack: (() -> Unit)?, actions: @Composable RowScope.() -> Unit = {},
    snackbar: SnackbarHostState? = null, content: @Composable ColumnScope.() -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = { if (onBack != null) IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
                actions = actions)
        },
        snackbarHost = { if (snackbar != null) SnackbarHost(snackbar) }
    ) { pad -> Column(Modifier.padding(pad).fillMaxSize(), content = content) }
}

/** Scrolling form body with Save button + inline error. */
@Composable
fun FormBody(error: String?, saveLabel: String = "Save", onSave: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        content()
        if (error != null) Text(error, color = MaterialTheme.colorScheme.error)
        Button(onClick = onSave, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(saveLabel) }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
fun TextF(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier.fillMaxWidth(), keyboard: KeyboardType = KeyboardType.Text) =
    OutlinedTextField(value, onChange, label = { Text(label) }, modifier = modifier, singleLine = keyboard != KeyboardType.Text || label != "Notes",
        keyboardOptions = KeyboardOptions(keyboardType = keyboard))

@Composable
fun MoneyField(label: String, value: String, onChange: (String) -> Unit) =
    OutlinedTextField(value, { s -> if (s.all { it.isDigit() || it == '.' || it == ',' }) onChange(s) },
        label = { Text(label) }, prefix = { Text(Fmt.symbol) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))

@Composable
fun NumField(label: String, value: String, onChange: (String) -> Unit) =
    OutlinedTextField(value, { s -> if (s.all { it.isDigit() || it == '.' }) onChange(s) }, label = { Text(label) },
        singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateField(label: String, date: LocalDate?, onChange: (LocalDate?) -> Unit, clearable: Boolean = false) {
    var show by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = date?.format(DateTimeFormatter.ofPattern("dd MMM yyyy")) ?: "", onValueChange = {}, readOnly = true,
        label = { Text(label) }, modifier = Modifier.fillMaxWidth(),
        trailingIcon = {
            Row {
                if (clearable && date != null) IconButton(onClick = { onChange(null) }) { Icon(Icons.Default.Clear, "Clear $label") }
                IconButton(onClick = { show = true }) { Icon(Icons.Default.DateRange, "Pick $label") }
            }
        })
    if (show) {
        val st = rememberDatePickerState(initialSelectedDateMillis = (date ?: LocalDate.now()).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { show = false },
            confirmButton = { TextButton(onClick = {
                st.selectedDateMillis?.let { onChange(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
                show = false }) { Text("OK") } },
            dismissButton = { TextButton(onClick = { show = false }) { Text("Cancel") } }
        ) { DatePicker(st) }
    }
}

@Composable
fun Dropdown(label: String, options: List<String>, selected: String, onSelect: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth()) {
        OutlinedTextField(selected, {}, readOnly = true, label = { Text(label) }, modifier = Modifier.fillMaxWidth(),
            trailingIcon = { IconButton(onClick = { open = true }) { Icon(Icons.Default.ArrowDropDown, "Choose $label") } })
        DropdownMenu(open, { open = false }) {
            options.forEachIndexed { i, o -> DropdownMenuItem(text = { Text(o) }, onClick = { onSelect(i); open = false }) }
        }
    }
}

@Composable
fun ConfirmDialog(title: String, text: String, onConfirm: () -> Unit, onDismiss: () -> Unit) =
    AlertDialog(onDismissRequest = onDismiss, title = { Text(title) }, text = { Text(text) },
        confirmButton = { TextButton(onClick = { onConfirm(); onDismiss() }) { Text("Delete") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })

/** Small dialog asking for one amount (partial payment, add/withdraw, debt payment...). */
@Composable
fun AmountDialog(title: String, confirm: String = "OK", initial: String = "", onDone: (Long) -> Unit, onDismiss: () -> Unit) {
    var v by remember { mutableStateOf(initial) }
    var err by remember { mutableStateOf<String?>(null) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(title) },
        text = { Column { MoneyField("Amount", v) { v = it; err = null }; if (err != null) Text(err!!, color = MaterialTheme.colorScheme.error) } },
        confirmButton = { TextButton(onClick = {
            val p = Money.parse(v)
            if (p == null || p <= 0) err = "Enter an amount greater than 0" else { onDone(p); onDismiss() }
        }) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}

@Composable
fun StatRow(label: String, value: String, bold: Boolean = false) =
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyLarge)
        Text(value, style = MaterialTheme.typography.bodyLarge,
            fontWeight = if (bold) androidx.compose.ui.text.font.FontWeight.Bold else null)
    }

@Composable
fun SectionCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) =
    Card(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) { Column(Modifier.padding(16.dp), content = content) }

@Composable
fun ProgressLine(fraction: Float, label: String, danger: Boolean = false) {
    Column(Modifier.semantics { contentDescription = label }) {
        LinearProgressIndicator(progress = { fraction.coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth().height(8.dp),
            color = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun EmptyHint(text: String) =
    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(text, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
