package com.mymoney.tracker

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mymoney.tracker.ui.AppRoot
import com.mymoney.tracker.ui.AppViewModel

/** FragmentActivity (not ComponentActivity) because BiometricPrompt needs it. */
class MainActivity : FragmentActivity() {
    private var vmRef: AppViewModel? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Hides financial data from screenshots and the recent-apps preview.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        setContent {
            val vm: AppViewModel = viewModel()
            vmRef = vm
            AppRoot(vm)
        }
    }

    override fun onStart() { super.onStart(); vmRef?.onForeground() }
    override fun onStop() { vmRef?.onBackground(); super.onStop() }
}
