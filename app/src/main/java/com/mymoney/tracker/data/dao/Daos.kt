package com.mymoney.tracker.data.dao

import androidx.room.*
import com.mymoney.tracker.data.entity.*
import kotlinx.coroutines.flow.Flow

@Dao interface CategoryDao {
    @Query("SELECT * FROM category ORDER BY name") fun all(): Flow<List<Category>>
    @Query("SELECT COUNT(*) FROM category") suspend fun count(): Int
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insert(c: Category): Long
    @Update suspend fun update(c: Category)
    @Delete suspend fun delete(c: Category)
    @Query("SELECT COUNT(*) FROM expense WHERE categoryId=:id") suspend fun expenseCount(id: Long): Int
    @Query("SELECT * FROM payment_method ORDER BY name") fun methods(): Flow<List<PaymentMethod>>
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insertMethod(m: PaymentMethod): Long
    @Delete suspend fun deleteMethod(m: PaymentMethod)
}

@Dao interface IncomeDao {
    @Query("SELECT * FROM income ORDER BY startDate DESC") fun all(): Flow<List<Income>>
    @Query("SELECT * FROM income") suspend fun snapshot(): List<Income>
    @Insert suspend fun insert(i: Income): Long
    @Update suspend fun update(i: Income)
    @Delete suspend fun delete(i: Income)
}

@Dao interface ExpenseDao {
    @Query("SELECT * FROM expense ORDER BY date DESC, id DESC") fun all(): Flow<List<Expense>>
    @Query("SELECT * FROM expense WHERE date BETWEEN :from AND :to ORDER BY date DESC") fun between(from: Long, to: Long): Flow<List<Expense>>
    @Query("SELECT * FROM expense") suspend fun snapshot(): List<Expense>
    @Insert suspend fun insert(e: Expense): Long
    @Update suspend fun update(e: Expense)
    @Delete suspend fun delete(e: Expense)
}

@Dao interface RecurringExpenseDao {
    @Query("SELECT * FROM recurring_expense ORDER BY name") fun all(): Flow<List<RecurringExpense>>
    @Query("SELECT * FROM recurring_expense") suspend fun snapshot(): List<RecurringExpense>
    @Insert suspend fun insert(r: RecurringExpense): Long
    @Update suspend fun update(r: RecurringExpense)
    @Delete suspend fun delete(r: RecurringExpense)
}

@Dao interface EmiDao {
    @Query("SELECT * FROM emi ORDER BY name") fun all(): Flow<List<Emi>>
    @Query("SELECT * FROM emi") suspend fun snapshot(): List<Emi>
    @Query("SELECT * FROM emi_payment WHERE emiId=:emiId ORDER BY installmentNo") fun payments(emiId: Long): Flow<List<EmiPayment>>
    @Query("SELECT * FROM emi_payment") suspend fun allPayments(): List<EmiPayment>
    @Query("SELECT * FROM emi_payment") fun observeAll(): Flow<List<EmiPayment>>
    @Insert suspend fun insert(e: Emi): Long
    @Update suspend fun update(e: Emi)
    @Delete suspend fun delete(e: Emi)
    @Insert suspend fun insertPayments(p: List<EmiPayment>)
    @Update suspend fun updatePayment(p: EmiPayment)
    @Insert suspend fun insertPayment(p: EmiPayment): Long
    @Query("DELETE FROM emi_payment WHERE emiId=:emiId AND status='PENDING'") suspend fun deletePendingPayments(emiId: Long)
}

@Dao interface LoanDao {
    @Query("SELECT * FROM loan ORDER BY name") fun all(): Flow<List<Loan>>
    @Query("SELECT * FROM loan") suspend fun snapshot(): List<Loan>
    @Query("SELECT * FROM loan_payment WHERE loanId=:loanId ORDER BY installmentNo") fun payments(loanId: Long): Flow<List<LoanPayment>>
    @Query("SELECT * FROM loan_payment") suspend fun allPayments(): List<LoanPayment>
    @Query("SELECT * FROM loan_payment") fun observeAll(): Flow<List<LoanPayment>>
    @Insert suspend fun insert(l: Loan): Long
    @Update suspend fun update(l: Loan)
    @Delete suspend fun delete(l: Loan)
    @Insert suspend fun insertPayments(p: List<LoanPayment>)
    @Update suspend fun updatePayment(p: LoanPayment)
    @Query("DELETE FROM loan_payment WHERE loanId=:loanId AND status='PENDING'") suspend fun deletePendingPayments(loanId: Long)
}

@Dao interface DebtDao {
    @Query("SELECT * FROM debt ORDER BY date DESC") fun all(): Flow<List<Debt>>
    @Query("SELECT * FROM debt") suspend fun snapshot(): List<Debt>
    @Query("SELECT * FROM debt_payment WHERE debtId=:id ORDER BY date") fun payments(id: Long): Flow<List<DebtPayment>>
    @Query("SELECT * FROM debt_payment") suspend fun allPayments(): List<DebtPayment>
    @Query("SELECT * FROM debt_payment") fun observeAll(): Flow<List<DebtPayment>>
    @Insert suspend fun insert(d: Debt): Long
    @Update suspend fun update(d: Debt)
    @Delete suspend fun delete(d: Debt)
    @Insert suspend fun insertPayment(p: DebtPayment): Long
    @Delete suspend fun deletePayment(p: DebtPayment)
}

@Dao interface BudgetDao {
    @Query("SELECT * FROM budget WHERE yearMonth=:ym") fun forMonth(ym: Int): Flow<List<Budget>>
    @Query("SELECT * FROM budget") suspend fun snapshot(): List<Budget>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(b: Budget): Long
    @Delete suspend fun delete(b: Budget)
}

@Dao interface SavingsDao {
    @Query("SELECT * FROM savings_goal ORDER BY name") fun all(): Flow<List<SavingsGoal>>
    @Query("SELECT * FROM savings_goal") suspend fun snapshot(): List<SavingsGoal>
    @Insert suspend fun insert(g: SavingsGoal): Long
    @Update suspend fun update(g: SavingsGoal)
    @Delete suspend fun delete(g: SavingsGoal)
}

@Dao interface ScheduledChangeDao {
    @Query("SELECT * FROM scheduled_change") fun all(): Flow<List<ScheduledChange>>
    @Query("SELECT * FROM scheduled_change") suspend fun snapshot(): List<ScheduledChange>
    @Insert suspend fun insert(c: ScheduledChange): Long
    @Update suspend fun update(c: ScheduledChange)
    @Delete suspend fun delete(c: ScheduledChange)
}

@Dao interface SettingsDao {
    @Query("SELECT * FROM user_settings WHERE id=1") fun observe(): Flow<UserSettings?>
    @Query("SELECT * FROM user_settings WHERE id=1") suspend fun get(): UserSettings?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun save(s: UserSettings)
}
