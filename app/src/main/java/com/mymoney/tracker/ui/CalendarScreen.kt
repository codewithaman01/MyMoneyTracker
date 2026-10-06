package com.mymoney.tracker.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.mymoney.tracker.data.entity.EventType
import com.mymoney.tracker.domain.EventBuilder
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter

fun eventColor(t: EventType): Color = when (t) {
    EventType.INCOME -> Color(0xFF2E7D32); EventType.EMI -> Color(0xFFE65100); EventType.LOAN -> Color(0xFFC62828)
    EventType.RENT -> Color(0xFF6A1B9A); EventType.BILL -> Color(0xFF1565C0); EventType.DEBT -> Color(0xFFAD1457)
    EventType.SAVINGS -> Color(0xFF00838F); EventType.EXPENSE -> Color(0xFF616161)
}

@Composable
fun CalendarScreen(vm: AppViewModel, nav: (String) -> Unit, back: () -> Unit) {
    val inp by vm.inputs.collectAsState()
    val emis by vm.emis.collectAsState()
    val loans by vm.loans.collectAsState()
    val goals by vm.goals.collectAsState()
    var ym by remember { mutableStateOf(YearMonth.now()) }
    var selected by remember { mutableStateOf<LocalDate?>(LocalDate.now()) }
    val events = remember(inp, emis, loans, goals, ym) { EventBuilder.between(ym.atDay(1), ym.atEndOfMonth(), inp, emis, loans, goals) }
    val byDay = events.groupBy { it.date }
    val lead = ym.atDay(1).dayOfWeek.value - 1  // Monday first

    ScreenScaffold("Calendar", back) {
        MonthNav(ym) { ym = it; selected = null }
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
            listOf("M", "T", "W", "T", "F", "S", "S").forEach { Text(it, Modifier.weight(1f), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelMedium) }
        }
        val cells = lead + ym.lengthOfMonth()
        for (week in 0 until (cells + 6) / 7) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
                for (col in 0..6) {
                    val day = week * 7 + col - lead + 1
                    if (day < 1 || day > ym.lengthOfMonth()) { Spacer(Modifier.weight(1f).height(48.dp)); continue }
                    val date = ym.atDay(day)
                    val ev = byDay[date].orEmpty()
                    val isSel = date == selected
                    Column(Modifier.weight(1f).height(48.dp)
                        .background(if (isSel) MaterialTheme.colorScheme.primaryContainer else Color.Transparent, CircleShape)
                        .clickable { selected = date }
                        .semantics { contentDescription = "${date.format(DateTimeFormatter.ofPattern("d MMMM"))}, ${ev.size} events" },
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Text(day.toString(), style = MaterialTheme.typography.bodyMedium)
                        Row(horizontalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.height(8.dp)) {
                            ev.map { it.type }.distinct().take(3).forEach { Box(Modifier.size(6.dp).background(eventColor(it), CircleShape)) }
                        }
                    }
                }
            }
        }
        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        val list = if (selected != null) byDay[selected].orEmpty() else events
        LazyColumn {
            if (list.isEmpty()) item { EmptyHint("Nothing scheduled") }
            items(list) { e ->
                ListItem(
                    leadingContent = { Box(Modifier.size(12.dp).background(eventColor(e.type), CircleShape)) },
                    headlineContent = { Text(e.title) },
                    supportingContent = { Text(dateStr(e.date.toEpochDay())) },
                    trailingContent = { if (e.amount > 0) Text(m(e.amount)) },
                    modifier = Modifier.clickable { nav(e.route) })
            }
        }
    }
}
