package com.mymoney.tracker.data.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

/*
 * CONVENTIONS
 *  - Money is stored as Long PAISE (₹1 = 100). No floating point rounding errors.
 *  - Dates are stored as Long epochDay (LocalDate.toEpochDay()).
 *  - Enums are stored as Strings (see Converters).
 */

enum class Frequency { ONE_TIME, DAILY, WEEKLY, MONTHLY, YEARLY, CUSTOM }
enum class InterestType { REDUCING, FLAT, UNKNOWN }
enum class ItemStatus { ACTIVE, PAUSED, COMPLETED, CANCELLED }
enum class PaymentStatus { PENDING, PAID, SKIPPED, PARTIAL }
enum class DebtDirection { I_OWE, OWED_TO_ME }
enum class ChangeTarget { INCOME, RECURRING_EXPENSE, EMI }
enum class EventType { INCOME, EXPENSE, EMI, LOAN, RENT, BILL, DEBT, SAVINGS }

@Serializable
@Entity(tableName = "category", indices = [Index("name", unique = true)])
data class Category(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val isDefault: Boolean = false,
    val isRent: Boolean = false // lets the planner show "Rent" separately
)

@Serializable
@Entity(tableName = "payment_method", indices = [Index("name", unique = true)])
data class PaymentMethod(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val isDefault: Boolean = false
)

@Serializable
@Entity(tableName = "income")
data class Income(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val amount: Long,
    val source: String = "",
    val frequency: Frequency = Frequency.MONTHLY,
    val customIntervalDays: Int = 0,
    val startDate: Long,
    val endDate: Long? = null,          // recurring stops automatically after this
    val paymentDay: Int = 1,            // day of month for MONTHLY
    val status: ItemStatus = ItemStatus.ACTIVE, // ACTIVE / PAUSED
    val notes: String = ""
)

@Serializable
@Entity(
    tableName = "expense",
    foreignKeys = [ForeignKey(Category::class, ["id"], ["categoryId"], onDelete = ForeignKey.RESTRICT)],
    indices = [Index("categoryId"), Index("date")]
)
data class Expense(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val amount: Long,
    val categoryId: Long,
    val date: Long,
    val description: String = "",
    val paymentMethod: String = "Cash",
    val notes: String = ""
)

@Serializable
@Entity(
    tableName = "recurring_expense",
    foreignKeys = [ForeignKey(Category::class, ["id"], ["categoryId"], onDelete = ForeignKey.RESTRICT)],
    indices = [Index("categoryId")]
)
data class RecurringExpense(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val amount: Long,
    val frequency: Frequency = Frequency.MONTHLY,
    val customIntervalDays: Int = 0,
    val startDate: Long,
    val endDate: Long? = null,
    val dueDay: Int = 1,
    val categoryId: Long,
    val paymentMethod: String = "Bank",
    val status: ItemStatus = ItemStatus.ACTIVE,
    // For "Travel ₹100 on Mon–Sat": bitmask of weekdays (bit0=Mon … bit6=Sun). 0 = not used.
    val weekdayMask: Int = 0,
    val notes: String = ""
)

@Serializable
@Entity(tableName = "emi")
data class Emi(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val purpose: String = "Other",       // free text, user can create custom
    val description: String = "",
    val lender: String = "",
    val originalAmount: Long = 0,
    val downPayment: Long = 0,
    val remainingPrincipal: Long = 0,
    val monthlyEmi: Long,
    val interestRatePercent: Double? = null, // null = user hasn't entered it yet
    val interestType: InterestType = InterestType.UNKNOWN,
    val processingFee: Long = 0,
    val otherCharges: Long = 0,
    val totalMonths: Int,
    val startDate: Long,
    val dueDay: Int = 1,
    val status: ItemStatus = ItemStatus.ACTIVE
)

@Serializable
@Entity(
    tableName = "emi_payment",
    foreignKeys = [ForeignKey(Emi::class, ["id"], ["emiId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("emiId")]
)
data class EmiPayment(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val emiId: Long,
    val installmentNo: Int,
    val dueDate: Long,
    val amountDue: Long,
    val amountPaid: Long = 0,
    val paidDate: Long? = null,
    val status: PaymentStatus = PaymentStatus.PENDING,
    val notes: String = ""
)

@Serializable
@Entity(tableName = "loan")
data class Loan(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val provider: String = "",
    val purpose: String = "",
    val principal: Long,
    val interestRatePercent: Double? = null, // user must enter; never hard-coded
    val interestType: InterestType = InterestType.UNKNOWN,
    val tenureMonths: Int,
    val startDate: Long,
    val emi: Long? = null,                   // null = unknown yet, may be entered later
    val processingFee: Long = 0,
    val insurance: Long = 0,
    val otherCharges: Long = 0,
    val totalRepaymentOverride: Long? = null,
    val dueDay: Int = 1,
    val status: ItemStatus = ItemStatus.ACTIVE
)

@Serializable
@Entity(
    tableName = "loan_payment",
    foreignKeys = [ForeignKey(Loan::class, ["id"], ["loanId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("loanId")]
)
data class LoanPayment(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val loanId: Long,
    val installmentNo: Int,
    val dueDate: Long,
    val amountDue: Long,
    val amountPaid: Long = 0,
    val principalPart: Long = 0,
    val interestPart: Long = 0,
    val paidDate: Long? = null,
    val status: PaymentStatus = PaymentStatus.PENDING
)

@Serializable
@Entity(tableName = "debt")
data class Debt(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val person: String,
    val direction: DebtDirection,
    val amount: Long,
    val purpose: String = "",
    val date: Long,
    val dueDate: Long? = null,
    val notes: String = ""
)

@Serializable
@Entity(
    tableName = "debt_payment",
    foreignKeys = [ForeignKey(Debt::class, ["id"], ["debtId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("debtId")]
)
data class DebtPayment(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val debtId: Long,
    val amount: Long,
    val date: Long,
    val notes: String = ""
)

@Serializable
@Entity(tableName = "budget", indices = [Index(value = ["categoryId", "yearMonth"], unique = true)])
data class Budget(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val categoryId: Long,
    val yearMonth: Int,     // e.g. 202610 → different budgets per month
    val limitAmount: Long
)

@Serializable
@Entity(tableName = "savings_goal")
data class SavingsGoal(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val targetAmount: Long,
    val currentAmount: Long = 0,
    val targetDate: Long? = null,
    val notes: String = ""
)

/** Future salary / rent / EMI changes: "from <date> onward the amount becomes <newAmount>". */
@Serializable
@Entity(tableName = "scheduled_change", indices = [Index("targetType", "targetId")])
data class ScheduledChange(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val targetType: ChangeTarget,
    val targetId: Long,
    val effectiveFrom: Long,
    val newAmount: Long
)

@Serializable
@Entity(tableName = "financial_event")
data class FinancialEvent(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val type: EventType,
    val title: String,
    val date: Long,
    val amount: Long = 0,
    val refType: String = "",
    val refId: Long = 0,
    val remindDaysBefore: Int = 1
)

@Serializable
@Entity(tableName = "user_settings")
data class UserSettings(
    @PrimaryKey val id: Int = 1,
    val currencySymbol: String = "₹",
    val financialMonthStartDay: Int = 1,
    val darkMode: Boolean = false,
    val lockEnabled: Boolean = false,
    val lockTimeoutMinutes: Int = 0, // 0 = every time, -1 = never
    val notificationsEnabled: Boolean = true,
    val defaultRemindDaysBefore: Int = 1,
    val onboardingDone: Boolean = false
)
