package com.mymoney.tracker.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate

@Composable
fun BackupScreen(vm: AppViewModel, back: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var pendingImport by remember { mutableStateOf<String?>(null) }
    val stamp = LocalDate.now().toString()

    fun write(uri: android.net.Uri?, producer: suspend () -> String) {
        if (uri == null) return
        scope.launch {
            try {
                val text = producer()
                withContext(Dispatchers.IO) { ctx.contentResolver.openOutputStream(uri, "wt")!!.use { it.write(text.toByteArray()) } }
                vm.message.value = "Backup saved"
            } catch (e: Exception) { vm.message.value = "Could not save the backup file" }
        }
    }
    val jsonOut = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { write(it) { vm.backupJson() } }
    val csvOut = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { write(it) { vm.backupCsv() } }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            try {
                val text = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { String(it.readBytes()) } }
                if (text.length > 20_000_000) vm.message.value = "That file is too large to be a backup" else pendingImport = text
            } catch (e: Exception) { vm.message.value = "Could not read that file" }
        }
    }

    ScreenScaffold("Backup & restore", back) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Backups are saved only where you choose on this phone (or an SD card / USB). Nothing is uploaded anywhere.")
            Text("The backup file is NOT encrypted. Keep it somewhere safe.", color = MaterialTheme.colorScheme.error)
            Button(onClick = { jsonOut.launch("money-tracker-backup-$stamp.json") }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Export backup (JSON, can be restored)") }
            OutlinedButton(onClick = { csvOut.launch("money-tracker-export-$stamp.csv") }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Export CSV (for Excel / Sheets)") }
            HorizontalDivider()
            OutlinedButton(onClick = { picker.launch(arrayOf("application/json", "text/plain", "*/*")) }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Import backup (JSON)") }
        }
    }
    pendingImport?.let { text ->
        AlertDialog(onDismissRequest = { pendingImport = null }, title = { Text("Replace all data?") },
            text = { Text("Restoring replaces everything currently in the app with the contents of the backup. If the file is invalid, nothing is changed.") },
            confirmButton = { TextButton(onClick = { vm.restore(text); pendingImport = null }) { Text("Restore") } },
            dismissButton = { TextButton(onClick = { pendingImport = null }) { Text("Cancel") } })
    }
}
