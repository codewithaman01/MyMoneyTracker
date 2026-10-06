package com.mymoney.tracker.data

import android.content.Context
import androidx.room.*
import com.mymoney.tracker.data.dao.*
import com.mymoney.tracker.data.entity.*

class Converters {
    @TypeConverter fun fromFrequency(v: Frequency) = v.name
    @TypeConverter fun toFrequency(v: String) = Frequency.valueOf(v)
    @TypeConverter fun fromInterest(v: InterestType) = v.name
    @TypeConverter fun toInterest(v: String) = InterestType.valueOf(v)
    @TypeConverter fun fromStatus(v: ItemStatus) = v.name
    @TypeConverter fun toStatus(v: String) = ItemStatus.valueOf(v)
    @TypeConverter fun fromPay(v: PaymentStatus) = v.name
    @TypeConverter fun toPay(v: String) = PaymentStatus.valueOf(v)
    @TypeConverter fun fromDir(v: DebtDirection) = v.name
    @TypeConverter fun toDir(v: String) = DebtDirection.valueOf(v)
    @TypeConverter fun fromTarget(v: ChangeTarget) = v.name
    @TypeConverter fun toTarget(v: String) = ChangeTarget.valueOf(v)
    @TypeConverter fun fromEvent(v: EventType) = v.name
    @TypeConverter fun toEvent(v: String) = EventType.valueOf(v)
}

@Database(
    entities = [
        Category::class, PaymentMethod::class, Income::class, Expense::class,
        RecurringExpense::class, Emi::class, EmiPayment::class, Loan::class,
        LoanPayment::class, Debt::class, DebtPayment::class, Budget::class,
        SavingsGoal::class, ScheduledChange::class, FinancialEvent::class, UserSettings::class
    ],
    version = 1,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun categoryDao(): CategoryDao
    abstract fun incomeDao(): IncomeDao
    abstract fun expenseDao(): ExpenseDao
    abstract fun recurringDao(): RecurringExpenseDao
    abstract fun emiDao(): EmiDao
    abstract fun loanDao(): LoanDao
    abstract fun debtDao(): DebtDao
    abstract fun budgetDao(): BudgetDao
    abstract fun savingsDao(): SavingsDao
    abstract fun changeDao(): ScheduledChangeDao
    abstract fun settingsDao(): SettingsDao

    companion object {
        @Volatile private var inst: AppDatabase? = null
        fun get(ctx: Context): AppDatabase = inst ?: synchronized(this) {
            inst ?: Room.databaseBuilder(ctx.applicationContext, AppDatabase::class.java, "money_tracker.db")
                .build().also { inst = it }
        }
    }
}
