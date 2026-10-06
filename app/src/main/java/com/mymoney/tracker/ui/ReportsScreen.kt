package com.mymoney.tracker.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mymoney.tracker.data.entity.DebtDirection
import com.mymoney.tracker.domain.MonthSummary
import com.mymoney.tracker.domain.MonthlyEngine
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import kotlin.math.ceil

@Composable
private fun MonthLabels(labels: List<String>) {
    val step = ceil(labels.size / 6.0).toInt().coerceAtLeast(1)
    Row(Modifier.fillMaxWidth()) {
        labels.forEachIndexed { i, l -> Text(if (i % step == 0) l else "", Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, maxLines = 1) }
    }
}

/** Grouped bars built from plain boxes (no chart library, fully offline). */
@Composable
fun BarChart(labels: List<String>, series: List<Pair<Color, List<Long>>>, description: String) {
    val max = series.flatMap { it.second }.maxOrNull()?.coerceAtLeast(1L) ?: 1L
    Column(Modifier.semantics { contentDescription = description }) {
        Row(Modifier.fillMaxWidth().height(140.dp), verticalAlignment = Alignment.Bottom) {
            labels.indices.forEach { i ->
                Row(Modifier.weight(1f).fillMaxHeight().padding(horizontal = 1.dp), verticalAlignment = Alignment.Bottom) {
                    series.forEach { (c, v) ->
                        val f = (v[i].coerceAtLeast(0).toFloat() / max).coerceIn(0f, 1f)
                        Box(Modifier.weight(1f).fillMaxHeight(f).background(c))
                    }
                }
            }
        }
        MonthLabels(labels)
        Text("Highest: ${m(max)}", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun LineChart(labels: List<String>, values: List<Long>, color: Color, description: String) {
    val lo = minOf(values.minOrNull() ?: 0L, 0L); val hi = maxOf(values.maxOrNull() ?: 0L, 1L)
    val zero = MaterialTheme.colorScheme.outline
    Column(Modifier.semantics { contentDescription = description }) {
        Canvas(Modifier.fillMaxWidth().height(140.dp)) {
            fun y(v: Long) = size.height - ((v - lo).toFloat() / (hi - lo).coerceAtLeast(1)) * size.height
            fun x(i: Int) = if (values.size <= 1) size.width / 2 else i * size.width / (values.size - 1)
            drawLine(zero, Offset(0f, y(0)), Offset(size.width, y(0)), strokeWidth = 1f)
            val path = Path()
            values.forEachIndexed { i, v -> if (i == 0) path.moveTo(x(i), y(v)) else path.lineTo(x(i), y(v)) }
            drawPath(path, color, style = Stroke(width = 4f))
            values.forEachIndexed { i, v -> drawCircle(color, 6f, Offset(x(i), y(v))) }
        }
        MonthLabels(labels)
        Text("Highest ${m(hi)}  ·  Lowest ${m(lo)}  ·  Latest ${m(values.lastOrNull() ?: 0)}", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun ChartCard(title: String, content: @Composable ColumnScope.() -> Unit) =
    SectionCard { Text(title, style = MaterialTheme.typography.titleMedium); Spacer(Modifier.height(8.dp)); content() }

@Composable
fun ReportsScreen(vm: AppViewModel, back: () -> Unit) {
    val inp by vm.inputs.collectAsState()
    var months by remember { mutableIntStateOf(6) }
    var custom by remember { mutableStateOf(false) }
    val presets = listOf(1, 3, 6, 12)
    val list: List<MonthSummary> = remember(inp, months) {
        (months - 1 downTo 0).map { MonthlyEngine.summarize(YearMonth.now().minusMonths(it.toLong()), inp) }
    }
    val labels = list.map { it.month.format(DateTimeFormatter.ofPattern("MMM yy")) }
    val primary = MaterialTheme.colorScheme.primary
    val error = MaterialTheme.colorScheme.error
    val tertiary = MaterialTheme.colorScheme.tertiary

    // category totals across the range (+ EMI / Loan, which are tracked separately)
    val cat = remember(list) {
        val t = HashMap<String, Long>()
        list.forEach { s -> s.categoryTotals.forEach { (k, v) -> t.merge(k, v, Long::plus) } }
        t.merge("EMI", list.sumOf { it.emi }, Long::plus); t.merge("Loan", list.sumOf { it.loan }, Long::plus)
        t.filter { it.value > 0 }.entries.sortedByDescending { it.value }
    }
    // Debt I owe, outstanding at the end of each month
    val debtLine = remember(inp, list) {
        list.map { s ->
            val end = s.month.atEndOfMonth().toEpochDay()
            val owe = inp.debts.filter { it.direction == DebtDirection.I_OWE && it.date <= end }
            val ids = owe.map { it.id }.toSet()
            (owe.sumOf { it.amount } - inp.debtPayments.filter { it.debtId in ids && it.date <= end }.sumOf { it.amount }).coerceAtLeast(0)
        }
    }
    val outflow = list.map { it.totalOutflow }

    ScreenScaffold("Reports", back) {
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(12.dp, 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            presets.forEach { FilterChip(months == it, { months = it }, label = { Text(if (it == 1) "1 month" else "$it months") }) }
            FilterChip(months !in presets, { custom = true }, label = { Text(if (months in presets) "Custom" else "$months months") })
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            item { ChartCard("Monthly income") {
                BarChart(labels, listOf(primary to list.map { it.totalIncome }), "Monthly income chart. Total ${m(list.sumOf { it.totalIncome })}") } }
            item { ChartCard("Monthly expenses (incl. EMI, loan, debt payments)") {
                BarChart(labels, listOf(error to outflow), "Monthly expenses chart. Total ${m(outflow.sum())}") } }
            item { ChartCard("Category spending") {
                if (cat.isEmpty()) Text("No spending in this period")
                val top = cat.firstOrNull()?.value ?: 1L
                cat.take(10).forEach { (k, v) ->
                    Column(Modifier.padding(vertical = 3.dp)) {
                        StatRow(k, m(v))
                        LinearProgressIndicator(progress = { v.toFloat() / top }, modifier = Modifier.fillMaxWidth().height(6.dp))
                    }
                }
            } }
            item { ChartCard("Income vs expense") {
                Row { Text("■ Income  ", color = primary); Text("■ Expense", color = error) }
                BarChart(labels, listOf(primary to list.map { it.totalIncome }, error to outflow), "Income versus expense by month")
            } }
            item { ChartCard("Savings trend (money left each month)") {
                LineChart(labels, list.map { it.remaining }, tertiary, "Savings trend by month") } }
            item { ChartCard("Debt reduction (money I owe)") {
                LineChart(labels, debtLine, error, "Debt outstanding by month") } }
        }
    }
    if (custom) {
        var t by remember { mutableStateOf("") }
        AlertDialog(onDismissRequest = { custom = false }, title = { Text("Number of months") },
            text = { NumField("Months (1-60)", t) { t = it.filter { c -> c.isDigit() } } },
            confirmButton = { TextButton(onClick = { t.toIntOrNull()?.takeIf { it in 1..60 }?.let { months = it; custom = false } }) { Text("OK") } },
            dismissButton = { TextButton(onClick = { custom = false }) { Text("Cancel") } })
    }
}
