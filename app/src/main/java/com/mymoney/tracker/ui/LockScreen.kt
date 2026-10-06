package com.mymoney.tracker.ui

import android.content.Context
import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.mymoney.tracker.security.PinStore

/** Fingerprint / face (+ phone screen lock on Android 11+). Below Android 11 the app PIN is the screen-lock fallback. */
fun bioAuthenticators(): Int = if (Build.VERSION.SDK_INT >= 30) BIOMETRIC_STRONG or DEVICE_CREDENTIAL else BIOMETRIC_WEAK

fun biometricAvailable(ctx: Context): Boolean =
    BiometricManager.from(ctx).canAuthenticate(bioAuthenticators()) == BiometricManager.BIOMETRIC_SUCCESS

private fun showBiometric(act: FragmentActivity, onOk: () -> Unit) {
    val auth = bioAuthenticators()
    val info = BiometricPrompt.PromptInfo.Builder().setTitle("Unlock My Money Tracker")
        .setAllowedAuthenticators(auth)
        .apply { if (auth and DEVICE_CREDENTIAL == 0) setNegativeButtonText("Use PIN") }.build()
    BiometricPrompt(act, ContextCompat.getMainExecutor(act), object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = onOk()
    }).authenticate(info)
}

@Composable
fun LockScreen(vm: AppViewModel) {
    val ctx = LocalContext.current
    val act = ctx as? FragmentActivity
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val bio = remember { biometricAvailable(ctx) && vm.pin.biometricEnabled }
    LaunchedEffect(Unit) { if (bio && act != null) showBiometric(act) { vm.locked.value = false } }

    fun tryPin() {
        when (vm.pin.verify(pin)) {
            PinStore.Result.OK -> vm.locked.value = false
            PinStore.Result.WRONG -> { error = "Wrong PIN"; pin = "" }
            PinStore.Result.LOCKED -> { error = "Too many attempts. Try again in ${vm.pin.lockedSeconds()} seconds."; pin = "" }
        }
    }
    Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("My Money Tracker", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(8.dp))
        Text("Enter your PIN to unlock")
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(pin, { if (it.length <= 8 && it.all(Char::isDigit)) { pin = it; error = null } }, label = { Text("PIN") },
            singleLine = true, visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), modifier = Modifier.fillMaxWidth())
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp)) }
        Spacer(Modifier.height(16.dp))
        Button(onClick = ::tryPin, enabled = pin.length >= 4, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Unlock") }
        if (bio && act != null) {
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = { showBiometric(act) { vm.locked.value = false } }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
                Text("Use fingerprint / face / screen lock") }
        }
    }
}

/** Two PIN fields. Returns the PIN through [onValid] only when both match and are 4-8 digits. */
@Composable
fun PinSetupFields(onValid: (String?) -> Unit) {
    var a by remember { mutableStateOf("") }
    var b by remember { mutableStateOf("") }
    val kb = KeyboardOptions(keyboardType = KeyboardType.NumberPassword)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(a, { if (it.length <= 8 && it.all(Char::isDigit)) { a = it; onValid(if (a.length >= 4 && a == b) a else null) } },
            label = { Text("New PIN (4-8 digits)") }, singleLine = true, visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = kb, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(b, { if (it.length <= 8 && it.all(Char::isDigit)) { b = it; onValid(if (a.length >= 4 && a == b) a else null) } },
            label = { Text("Confirm PIN") }, singleLine = true, visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = kb, modifier = Modifier.fillMaxWidth())
        if (b.isNotEmpty() && a != b) Text("PINs do not match", color = MaterialTheme.colorScheme.error)
    }
}

@Composable
fun PinDialog(onPin: (String) -> Unit, onDismiss: () -> Unit) {
    var valid by remember { mutableStateOf<String?>(null) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Set app PIN") },
        text = { PinSetupFields { valid = it } },
        confirmButton = { TextButton(onClick = { valid?.let { onPin(it); onDismiss() } }, enabled = valid != null) { Text("Save PIN") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}

/** First launch: step 1 choose data, step 2 set the app lock (or skip). */
@Composable
fun Onboarding(vm: AppViewModel) {
    var sample by remember { mutableStateOf<Boolean?>(null) }
    var pin by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        if (sample == null) {
            Text("Welcome to My Money Tracker", style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
            Spacer(Modifier.height(12.dp))
            Text("Everything stays on this phone. No account, no internet.", textAlign = TextAlign.Center)
            Spacer(Modifier.height(32.dp))
            Button(onClick = { sample = false }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("Start From Zero") }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = { sample = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("Load Sample Data") }
            Spacer(Modifier.height(12.dp))
            Text("Sample data is only for trying the app. You can edit or delete all of it.", style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
        } else {
            Text("Protect your data", style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
            Text("Set a PIN. You can also unlock with fingerprint or face from Settings.", textAlign = TextAlign.Center)
            Spacer(Modifier.height(16.dp))
            PinSetupFields { pin = it }
            Spacer(Modifier.height(16.dp))
            Button(enabled = pin != null, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp), onClick = {
                vm.pin.setPin(pin!!); vm.locked.value = false; vm.finishOnboarding(sample == true, true) }) { Text("Set PIN and continue") }
            TextButton(onClick = { vm.finishOnboarding(sample == true) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Skip for now") }
        }
    }
}
