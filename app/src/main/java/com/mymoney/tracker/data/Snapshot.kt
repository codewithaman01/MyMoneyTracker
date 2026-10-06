package com.mymoney.tracker.data

import com.mymoney.tracker.data.entity.*
import com.mymoney.tracker.domain.EngineInputs
import kotlinx.coroutines.flow.first

data class Loaded(val inputs: EngineInputs, val emis: List<Emi>, val loans: List<Loan>, val goals: List<SavingsGoal>)

suspend fun AppDatabase.loadAll(): Loaded = Loaded(
    EngineInputs(incomeDao().snapshot(), changeDao().snapshot(), expenseDao().snapshot(), recurringDao().snapshot(),
        categoryDao().all().first(), emiDao().allPayments(), loanDao().allPayments(), debtDao().snapshot(), debtDao().allPayments()),
    emiDao().snapshot(), loanDao().snapshot(), savingsDao().snapshot())
