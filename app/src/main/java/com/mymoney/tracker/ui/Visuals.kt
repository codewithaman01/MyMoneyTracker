package com.mymoney.tracker.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

/** Green used for income / money coming in. Expenses use the theme's error (red). */
val Positive = Color(0xFF2E9E5B)

private val palette = listOf(
    Color(0xFF0F766E), Color(0xFF6366F1), Color(0xFFF59E0B), Color(0xFFEC4899), Color(0xFF3B82F6),
    Color(0xFF22C55E), Color(0xFF8B5CF6), Color(0xFFEF4444), Color(0xFF14B8A6), Color(0xFFF97316))

fun categoryColor(name: String): Color = palette[(name.hashCode() and 0x7fffffff) % palette.size]

fun categoryIcon(name: String): ImageVector = when (name) {
    "Food" -> Icons.Default.Restaurant
    "Groceries" -> Icons.Default.ShoppingBasket
    "Travel" -> Icons.Default.DirectionsBus
    "Rent" -> Icons.Default.Home
    "Shopping" -> Icons.Default.ShoppingCart
    "Medical" -> Icons.Default.MedicalServices
    "Education" -> Icons.Default.School
    "Entertainment" -> Icons.Default.Movie
    "Personal" -> Icons.Default.Person
    "Bills" -> Icons.Default.Receipt
    "EMI" -> Icons.Default.CreditCard
    "Loan" -> Icons.Default.AccountBalance
    "Family" -> Icons.Default.People
    else -> Icons.Default.Category
}

/** Round coloured badge with the category's icon. */
@Composable
fun CategoryBadge(name: String) {
    val c = categoryColor(name)
    Box(Modifier.size(40.dp).clip(CircleShape).background(c.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
        Icon(categoryIcon(name), contentDescription = null, tint = c)
    }
}

/** Animated ring chart: each slice grows in when the screen opens. */
@Composable
fun DonutChart(parts: List<Pair<String, Long>>) {
    val total = parts.sumOf { it.second }.coerceAtLeast(1L)
    val grow = animatedFraction(1f, 1100)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(140.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxSize()) {
                val stroke = 26.dp.toPx()
                var start = -90f
                parts.forEach { (name, v) ->
                    val sweep = 360f * v / total * grow
                    drawArc(color = categoryColor(name), startAngle = start, sweepAngle = sweep, useCenter = false,
                        topLeft = Offset(stroke / 2, stroke / 2), size = Size(size.width - stroke, size.height - stroke),
                        style = Stroke(stroke))
                    start += sweep
                }
            }
            Text(m(total), style = MaterialTheme.typography.labelLarge, maxLines = 1)
        }
        Column(Modifier.padding(start = 16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            parts.take(6).forEach { (name, v) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(categoryColor(name)))
                    Spacer(Modifier.width(8.dp))
                    Text("$name  ${v * 100 / total}%", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
