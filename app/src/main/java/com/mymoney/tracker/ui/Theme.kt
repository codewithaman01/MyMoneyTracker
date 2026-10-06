package com.mymoney.tracker.ui

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Color(0xFF0F766E), onPrimary = Color.White,
    primaryContainer = Color(0xFFCFF0EB), onPrimaryContainer = Color(0xFF00201D),
    secondary = Color(0xFF4A6360), tertiary = Color(0xFF3D6373),
    error = Color(0xFFC0392B))

private val DarkColors = darkColorScheme(
    primary = Color(0xFF2DD4BF), onPrimary = Color(0xFF00201D),
    primaryContainer = Color(0xFF0B4F4A), onPrimaryContainer = Color(0xFFCFF0EB),
    secondary = Color(0xFFB1CCC8), tertiary = Color(0xFFA5CCDE),
    error = Color(0xFFF87171))

@Composable
fun AppTheme(dark: Boolean, content: @Composable () -> Unit) =
    MaterialTheme(colorScheme = if (dark) DarkColors else LightColors, content = content)
