import Dexie, { type Table } from "dexie";
import { useLiveQuery } from "dexie-react-hooks";

export const CATS = ["Rent", "Food", "Groceries", "Travel", "Shopping", "Education", "Medical", "EMIs", "Utilities", "Bills", "Personal", "Family", "Loan", "Entertainment", "Other"];
export const METHODS = ["UPI", "Cash", "Card", "Debit card", "Credit card", "Bank", "Bank transfer", "Other"];
export const SOURCES = ["Salary", "Freelance", "Business", "Trading", "Rental", "Other"];
export const INV_TYPES = ["Stock", "Mutual fund", "ETF", "Fixed deposit", "Other"];

// All amounts are integer minor units (paise/cents).
export interface Income { id?: number; date: string; source: string; amount: number; status: "received" | "expected"; recurring: string; parentId?: number; note: string }
export interface Expense { id?: number; date: string; category: string; method: string; amount: number; recurring: string; parentId?: number; note: string }
export interface Budget { id?: number; month: string; category: string; limit: number }
export interface Debt { id?: number; lender: string; principal: number; outstanding: number; rate: number; emi: number; dueDay: number; note: string }
export interface DebtPayment { id?: number; debtId: number; date: string; amount: number; interest: number; principal: number; early: boolean }
export interface Goal { id?: number; name: string; target: number; saved: number; deadline: string; monthly: number }
export interface Investment { id?: number; type: string; name: string; quantity: number; invested: number; current: number; date: string }

// ---- Plan / EMI / loan / friend-debt tables (ported from My Money Tracker). Dates are ISO "YYYY-MM-DD", money is integer minor units. ----
export type Freq = "once" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
export type ItemStatus = "active" | "paused" | "completed" | "cancelled";
export type PayStatus = "pending" | "paid" | "skipped" | "partial";
export type InterestType = "reducing" | "flat" | "unknown";
export type ChangeTarget = "income" | "recurring" | "emi";
export type Opt = number | ""; // optional numeric form value ("" = not entered)
export interface IncomeSource { id?: number; name: string; amount: number; source: string; frequency: Freq; customDays: number; startDate: string; endDate: string; dueDay: number; status: ItemStatus; note: string }
export interface Recurring { id?: number; name: string; amount: number; frequency: Freq; customDays: number; startDate: string; endDate: string; dueDay: number; category: string; method: string; weekdays: "all" | "monsat"; status: ItemStatus; note: string }
export interface Change { id?: number; target: ChangeTarget; targetId: number; from: string; amount: number }
export interface Emi { id?: number; name: string; purpose: string; lender: string; description: string; original: number; down: number; remaining: number; monthly: number; rate: Opt; interestType: InterestType; fee: number; other: number; totalMonths: number; startDate: string; dueDay: number; status: ItemStatus }
export interface EmiPayment { id?: number; emiId: number; no: number; dueDate: string; amountDue: number; amountPaid: number; paidDate: string; status: PayStatus }
export interface Loan { id?: number; name: string; provider: string; purpose: string; principal: number; rate: Opt; interestType: InterestType; tenure: number; startDate: string; emi: Opt; fee: number; insurance: number; other: number; totalOverride: Opt; dueDay: number; status: ItemStatus }
export interface LoanPayment { id?: number; loanId: number; no: number; dueDate: string; amountDue: number; amountPaid: number; principalPart: number; interestPart: number; paidDate: string; status: PayStatus }
export interface FriendDebt { id?: number; person: string; direction: "I owe" | "Owed to me"; amount: number; purpose: string; date: string; dueDate: string; note: string }
export interface FriendPayment { id?: number; debtId: number; amount: number; date: string; note: string }

class FinDB extends Dexie {
  income!: Table<Income, number>;
  expenses!: Table<Expense, number>;
  budgets!: Table<Budget, number>;
  debts!: Table<Debt, number>;
  debtPayments!: Table<DebtPayment, number>;
  goals!: Table<Goal, number>;
  investments!: Table<Investment, number>;
  settings!: Table<{ key: string; value: unknown }, string>;
  incomeSources!: Table<IncomeSource, number>;
  recurring!: Table<Recurring, number>;
  changes!: Table<Change, number>;
  emis!: Table<Emi, number>;
  emiPayments!: Table<EmiPayment, number>;
  loans!: Table<Loan, number>;
  loanPayments!: Table<LoanPayment, number>;
  friendDebts!: Table<FriendDebt, number>;
  friendPayments!: Table<FriendPayment, number>;
  constructor() {
    super("finglass");
    this.version(1).stores({
      income: "++id,date,status", expenses: "++id,date,category", budgets: "++id,month", debts: "++id",
      debtPayments: "++id,debtId", goals: "++id", investments: "++id,type", settings: "key",
    });
    // v2 adds the My Money Tracker tables; existing data is untouched.
    this.version(2).stores({
      incomeSources: "++id,status", recurring: "++id,status", changes: "++id,target,targetId",
      emis: "++id", emiPayments: "++id,emiId,dueDate", loans: "++id", loanPayments: "++id,loanId,dueDate",
      friendDebts: "++id,direction", friendPayments: "++id,debtId",
    });
  }
}
export const db = new FinDB();
export const DATA_TABLES = ["income", "expenses", "budgets", "debts", "debtPayments", "goals", "investments",
  "incomeSources", "recurring", "changes", "emis", "emiPayments", "loans", "loanPayments", "friendDebts", "friendPayments"] as const;

// Dev-only: a key from .env.local pre-fills the assistant when running `npm run dev`. It is never bundled into production builds / the APK.
const DEV_KEY: string = import.meta.env.DEV ? (import.meta.env.VITE_GEMINI_API_KEY ?? "") : "";
export const DEFAULTS = {
  currency: "INR", alertPct: 80, apiKey: DEV_KEY, model: "gemini-2.5-flash", reminders: false,
  theme: "dark" as "dark" | "light", onboarded: false, customCategories: [] as string[],
  // app lock (phone-specific: never exported in backups, never restored from them)
  lockEnabled: false, lockTimeout: 0, biometric: true, privacy: true,
  // payment reminders for EMIs, loans, rent, bills, friend debts, income, goals, budgets
  payReminders: false, remindDays: 1, showAmounts: false,
};
export type Settings = typeof DEFAULTS;
/** Settings keys that are specific to this phone and must not travel in backups. */
export const DEVICE_KEYS = ["apiKey", "lockEnabled", "lockTimeout", "biometric", "payReminders", "reminders", "onboarded"] as const;
export async function getSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  const stored = Object.fromEntries(rows.filter((r) => r.key in DEFAULTS).map((r) => [r.key, r.value])); // ignores internal keys such as the PIN record
  return { ...DEFAULTS, ...stored } as Settings;
}
export const allCategories = (custom: string[]) => [...CATS, ...custom.filter((c) => !CATS.some((k) => k.toLowerCase() === c.toLowerCase()))];
export const setSetting = (key: keyof Settings, value: unknown) => db.settings.put({ key, value });
export const useSettings = () => useLiveQuery(getSettings, [], DEFAULTS);

export async function loadAll() {
  const [income, expenses, budgets, debts, goals, investments] = await Promise.all(
    [db.income, db.expenses, db.budgets, db.debts, db.goals, db.investments].map((t) => (t as Table<any, number>).toArray()));
  return { income: income as Income[], expenses: expenses as Expense[], budgets: budgets as Budget[], debts: debts as Debt[], goals: goals as Goal[], investments: investments as Investment[] };
}
export type Data = Awaited<ReturnType<typeof loadAll>>;

/** Everything the plan engine, calendar, reports and reminders need, as plain arrays. */
export async function loadEngine() {
  const [incomeSources, recurring, changes, expenses, emis, emiPayments, loans, loanPayments, friendDebts, friendPayments, goals, budgets] = await Promise.all(
    [db.incomeSources, db.recurring, db.changes, db.expenses, db.emis, db.emiPayments, db.loans, db.loanPayments, db.friendDebts, db.friendPayments, db.goals, db.budgets].map((t) => (t as Table<any, number>).toArray()));
  return { incomeSources, recurring, changes, expenses, emis, emiPayments, loans, loanPayments, friendDebts, friendPayments, goals, budgets } as EngineData;
}
export interface EngineData {
  incomeSources: IncomeSource[]; recurring: Recurring[]; changes: Change[]; expenses: Expense[]; emis: Emi[]; emiPayments: EmiPayment[];
  loans: Loan[]; loanPayments: LoanPayment[]; friendDebts: FriendDebt[]; friendPayments: FriendPayment[]; goals: Goal[]; budgets: Budget[];
}
