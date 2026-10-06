package com.mymoney.tracker.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.mymoney.tracker.notify.Notifier

private val timeoutLabels = listOf("Every time", "After 1 minute", "After 5 minutes", "After 15 minutes", "Never (only after app restart)")
private val timeoutValues = listOf(0, 1, 5, 15, -1)
private val remindLabels = listOf("Same day", "1 day before", "3 days before", "7 days before")
private val remindValues = listOf(0, 1, 3, 7)

@Composable
private fun SwitchRow(label: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) =
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        Switch(checked, onChange, enabled = enabled); Spacer(Modifier.width(12.dp)); Text(label)
    }

@Composable
fun SettingsScreen(vm: AppViewModel, back: () -> Unit) {
    val s by vm.settings.collectAsState()
    val ctx = LocalContext.current
    var reset by remember { mutableStateOf(false) }
    var pinDialog by remember { mutableStateOf(false) }
    var enableAfterPin by remember { mutableStateOf(false) }
    var symbol by remember(s?.currencySymbol) { mutableStateOf(s?.currencySymbol ?: "₹") }
    val bioAvailable = remember { biometricAvailable(ctx) }
    var bioOn by remember { mutableStateOf(vm.pin.biometricEnabled) }

    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        vm.saveSettings { it.copy(notificationsEnabled = ok) }
        if (!ok) vm.message.value = "Notification permission was denied"
    }
    fun enableNotifications(on: Boolean) {
        if (!on) { vm.saveSettings { it.copy(notificationsEnabled = false) }; return }
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
            permLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        else vm.saveSettings { it.copy(notificationsEnabled = true) }
    }

    ScreenScaffold("Settings", back) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Security", style = MaterialTheme.typography.titleMedium)
            SwitchRow("App lock", s?.lockEnabled == true) { on ->
                if (on && !vm.pin.hasPin()) { enableAfterPin = true; pinDialog = true } else vm.setLock(on) }
            if (s?.lockEnabled == true) {
                Dropdown("Require authentication", timeoutLabels, timeoutLabels[timeoutValues.indexOf(s?.lockTimeoutMinutes).coerceAtLeast(0)]) { i ->
                    vm.saveSettings { it.copy(lockTimeoutMinutes = timeoutValues[i]) } }
                if (bioAvailable) SwitchRow("Fingerprint / face / screen lock", bioOn) { bioOn = it; vm.pin.biometricEnabled = it }
                else Text("No fingerprint/face set up on this phone — the app PIN is used.", style = MaterialTheme.typography.bodySmall)
                OutlinedButton(onClick = { enableAfterPin = false; pinDialog = true }, modifier = Modifier.fillMaxWidth()) { Text("Change PIN") }
            }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text("Reminders", style = MaterialTheme.typography.titleMedium)
            SwitchRow("Payment reminders (on this phone)", s?.notificationsEnabled == true) { enableNotifications(it) }
            Dropdown("Remind me", remindLabels, remindLabels[remindValues.indexOf(s?.defaultRemindDaysBefore).coerceAtLeast(0)]) { i ->
                vm.saveSettings { it.copy(defaultRemindDaysBefore = remindValues[i]) } }
            Text("Checked once a day around 9:00 for EMI, loan, rent, bills, debts, salary, budgets and savings.", style = MaterialTheme.typography.bodySmall)
            OutlinedButton(onClick = { Notifier.show(ctx, 1, "Test reminder", "Reminders are working") }, modifier = Modifier.fillMaxWidth()) { Text("Send a test reminder") }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text("Appearance", style = MaterialTheme.typography.titleMedium)
            SwitchRow("Dark mode", s?.darkMode == true) { v -> vm.saveSettings { it.copy(darkMode = v) } }
            TextF("Currency symbol", symbol, { symbol = it.take(4); if (symbol.isNotBlank()) vm.saveSettings { x -> x.copy(currencySymbol = symbol) } })
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            OutlinedButton(onClick = { reset = true }, modifier = Modifier.fillMaxWidth()) { Text("Reset application data") }
            Spacer(Modifier.height(24.dp))
        }
    }
    if (pinDialog) PinDialog({ vm.pin.setPin(it); if (enableAfterPin) vm.setLock(true) else vm.message.value = "PIN changed" }) { pinDialog = false }
    if (reset) ConfirmDialog("Delete ALL data?", "Everything on this phone, including your PIN, will be erased. This cannot be undone.", { vm.resetAll() }) { reset = false }
}
