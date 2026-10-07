package com.mymoney.tracker.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument

private data class NavTab(val route: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)
private val tabs = listOf<NavTab>(
    NavTab("tab_dashboard", "Dashboard", Icons.Default.Dashboard),
    NavTab("tab_transactions", "Transactions", Icons.Default.Receipt),
    NavTab("tab_budget", "Budget", Icons.Default.PieChart),
    NavTab("tab_loans", "Loans", Icons.Default.AccountBalance),
    NavTab("tab_more", "More", Icons.Default.MoreHoriz))

@Composable
fun AppRoot(vm: AppViewModel) {
    val s by vm.settings.collectAsState()
    val locked by vm.locked.collectAsState()
    val cfg = s
    Fmt.symbol = cfg?.currencySymbol ?: "₹"
    val dark = cfg?.darkMode ?: false
    AppTheme(dark) {
        Surface(Modifier.fillMaxSize()) {
            when {
                cfg == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                !cfg.onboardingDone -> Onboarding(vm)
                cfg.lockEnabled && locked && vm.pin.hasPin() -> LockScreen(vm)
                else -> MainNav(vm)
            }
        }
    }
}

@Composable
fun MainNav(vm: AppViewModel) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val onTab = tabs.any { it.route == route }
    val snack = remember { SnackbarHostState() }
    val msg by vm.message.collectAsState()
    var addMenu by remember { mutableStateOf(false) }
    LaunchedEffect(msg) { msg?.let { snack.showSnackbar(it); vm.message.value = null } }

    fun go(r: String) { if (r.startsWith("tab_")) nav.navigate(r) { popUpTo("tab_dashboard"); launchSingleTop = true } else nav.navigate(r) }
    val back: () -> Unit = { nav.popBackStack() }
    fun idArg(e: androidx.navigation.NavBackStackEntry) = e.arguments?.getLong("id") ?: -1L
    val idArgs = listOf(navArgument("id") { type = NavType.LongType })

    Scaffold(
        snackbarHost = { SnackbarHost(snack) },
        bottomBar = { if (onTab) NavigationBar { tabs.forEach { t ->
            NavigationBarItem(route == t.route, { go(t.route) }, icon = { Icon(t.icon, null) }, label = { Text(t.label, maxLines = 1) }) } } },
        floatingActionButton = { if (onTab) ExtendedFloatingActionButton(onClick = { addMenu = true },
            icon = { Icon(Icons.Default.Add, null) }, text = { Text("Add") }) }
    ) { pad ->
        NavHost(nav, "tab_dashboard", Modifier.padding(pad)) {
            composable("tab_dashboard") { DashboardScreen(vm) }
            composable("tab_transactions") { TransactionsScreen(vm, ::go) }
            composable("tab_budget") { BudgetScreen(vm) }
            composable("tab_loans") { LoansScreen(vm, ::go) }
            composable("tab_more") { MoreScreen(::go) }

            composable("income_form/{id}", idArgs) { IncomeForm(vm, idArg(it), back) }
            composable("expense_form/{id}", idArgs) { ExpenseForm(vm, idArg(it), back) }
            composable("recurring_form/{id}", idArgs) { RecurringForm(vm, idArg(it), back) }
            composable("emi_form/{id}", idArgs) { EmiForm(vm, idArg(it), back) }
            composable("loan_form/{id}", idArgs) { LoanForm(vm, idArg(it), back) }
            composable("debt_form") { DebtForm(vm, back) }
            composable("savings_form") { SavingsForm(vm, -1, back) }
            composable("savings_form/{id}", idArgs) { SavingsForm(vm, idArg(it), back) }
            composable("emi/{id}", idArgs) { EmiDetail(vm, idArg(it), ::go, back) }
            composable("loan/{id}", idArgs) { LoanDetail(vm, idArg(it), ::go, back) }
            composable("debts") { DebtsScreen(vm, ::go, back) }
            composable("savings") { SavingsScreen(vm, ::go, back) }
            composable("plan") { PlanScreen(vm, back) }
            composable("changes") { ChangesScreen(vm, back) }
            composable("settings") { SettingsScreen(vm, back) }
            composable("calendar") { CalendarScreen(vm, ::go, back) }
            composable("reports") { ReportsScreen(vm, back) }
            composable("backup") { BackupScreen(vm, back) }
            composable("todo") { TodoScreen(back) }
            composable("bills") { BillsScreen(back) }
            composable("shopping") { ShoppingScreen(back) }
        }
    }
    if (addMenu) AddMenuDialog({ addMenu = false; go(it) }) { addMenu = false }
}
