package com.mymoney.tracker.ui

import androidx.compose.material3.*
import androidx.compose.runtime.Composable

@Composable
fun AppTheme(dark: Boolean, content: @Composable () -> Unit) =
    MaterialTheme(colorScheme = if (dark) darkColorScheme() else lightColorScheme(), content = content)
