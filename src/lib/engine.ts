// Plan engine ported from My Money Tracker (MonthlyEngine / Recurrence / ChangeResolver).
// Pure functions of the raw rows: nothing here is stored as a total, every figure is derived.
import { shiftMonth } from "./calc";
import type { Change, ChangeTarget, EngineData, Freq, FriendDebt, FriendPayment } from "./db";
import { addDays, dayInMonth, daysInMonth, diffDays, monthEnd, monthIndex, monthStart, weekday } from "./dates";

export interface Rule { frequency: Freq; customDays: number; startDate: string; endDate: string; dueDay: number; weekdays?: "all" | "monsat" }
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** All dates in [from, to] on which a rule occurs. Respects start/end date, due day (monthly), custom intervals and Mon–Sat. */
export function occurrences(r: Rule, from: string, to: string): string[] {
  const lo = from > r.startDate ? from : r.startDate;
  const hi = r.endDate && r.endDate < to ? r.endDate : to;
  if (lo > hi) return [];
  const out: string[] = [];
  const step = (n: number) => {
    let d = r.startDate;
    if (d < lo) { const gap = diffDays(r.startDate, lo); d = addDays(r.startDate, Math.ceil(gap / n) * n); }
    for (; d <= hi; d = addDays(d, n)) out.push(d);
  };
  switch (r.frequency) {
    case "once": if (r.startDate >= lo && r.startDate <= hi) out.push(r.startDate); break;
    case "daily": for (let d = lo; d <= hi; d = addDays(d, 1)) if (!(r.weekdays === "monsat" && weekday(d) === 7)) out.push(d); break;
    case "weekly": step(7); break;
    case "custom": if (r.customDays > 0) step(r.customDays); break;
    case "monthly": {
      const day = r.dueDay >= 1 && r.dueDay <= 31 ? r.dueDay : Number(r.startDate.slice(8));
      for (let ym = lo.slice(0, 7); ym <= hi.slice(0, 7); ym = shiftMonth(ym, 1)) { const d = dayInMonth(ym, day); if (d >= lo && d <= hi) out.push(d); }
      break;
    }
    case "yearly": {
      const [, sm, sd] = r.startDate.split("-").map(Number);
      for (let y = Number(lo.slice(0, 4)); y <= Number(hi.slice(0, 4)); y++) {
        const ym = `${y}-${String(sm).padStart(2, "0")}`;
        const d = `${ym}-${String(Math.min(sd, daysInMonth(ym))).padStart(2, "0")}`;
        if (d >= lo && d <= hi) out.push(d);
      }
      break;
    }
  }
  return out;
}

/** "Salary becomes X from January": the latest change effective on or before the date wins. */
export function amountOn(base: number, target: ChangeTarget, targetId: number | undefined, changes: Change[], date: string): number {
  let best: Change | undefined;
  for (const c of changes) if (c.target === target && c.targetId === targetId && c.from <= date && (!best || c.from >= best.from)) best = c;
  return best ? best.amount : base;
}

export type EngineInputs = Pick<EngineData, "incomeSources" | "recurring" | "changes" | "expenses" | "emiPayments" | "loanPayments" | "friendDebts" | "friendPayments">;
export interface MonthSummary {
  month: string; totalIncome: number; incomeBySource: Record<string, number>; oneOffExpenses: number; recurringExpenses: number;
  totalExpenses: number; rent: number; categoryTotals: Record<string, number>; emi: number; loan: number; debtPayments: number; totalOutflow: number; remaining: number;
}
const isRent = (c: string) => c.trim().toLowerCase() === "rent";

/** Money I owe: repayments actually made in the month, plus (current/future months) remaining amounts planned for their due month. Overdue ones roll into the current month. */
function debtOutflow(ym: string, debts: FriendDebt[], pays: FriendPayment[], current: string): number {
  const owe = debts.filter((d) => d.direction === "I owe");
  const ids = new Set(owe.map((d) => d.id));
  let total = sum(pays.filter((p) => ids.has(p.debtId) && p.date >= monthStart(ym) && p.date <= monthEnd(ym)).map((p) => p.amount));
  if (ym >= current) {
    for (const d of owe) {
      const remaining = d.amount - sum(pays.filter((p) => p.debtId === d.id).map((p) => p.amount));
      if (remaining <= 0 || !d.dueDate) continue;
      const dueYm = d.dueDate.slice(0, 7);
      if ((dueYm < current ? current : dueYm) === ym) total += remaining;
    }
  }
  return total;
}

export function summarize(ym: string, inp: EngineInputs, today: string): MonthSummary {
  const from = monthStart(ym), to = monthEnd(ym);
  const incomeBySource: Record<string, number> = {};
  for (const i of inp.incomeSources.filter((x) => x.status === "active")) {
    const total = sum(occurrences(i, from, to).map((d) => amountOn(i.amount, "income", i.id, inp.changes, d)));
    if (total > 0) incomeBySource[i.name] = (incomeBySource[i.name] || 0) + total;
  }
  const categoryTotals: Record<string, number> = {};
  let rent = 0, oneOff = 0, recurring = 0;
  for (const e of inp.expenses.filter((x) => x.date >= from && x.date <= to)) {
    oneOff += e.amount; categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
    if (isRent(e.category)) rent += e.amount;
  }
  for (const r of inp.recurring.filter((x) => x.status === "active")) {
    const total = sum(occurrences(r, from, to).map((d) => amountOn(r.amount, "recurring", r.id, inp.changes, d)));
    recurring += total;
    if (total > 0) categoryTotals[r.category] = (categoryTotals[r.category] || 0) + total;
    if (isRent(r.category)) rent += total;
  }
  const due = (p: { dueDate: string; status: string; amountDue: number; amountPaid: number }) => p.status === "pending" ? p.amountDue : p.amountPaid;
  const inMonth = (d: string) => d >= from && d <= to;
  const emi = sum(inp.emiPayments.filter((p) => inMonth(p.dueDate) && p.status !== "skipped").map(due));
  const loan = sum(inp.loanPayments.filter((p) => inMonth(p.dueDate) && p.status !== "skipped").map(due));
  const debtPayments = debtOutflow(ym, inp.friendDebts, inp.friendPayments, today.slice(0, 7));
  const totalIncome = sum(Object.values(incomeBySource));
  const totalExpenses = oneOff + recurring;
  const totalOutflow = totalExpenses + emi + loan + debtPayments;
  return { month: ym, totalIncome, incomeBySource, oneOffExpenses: oneOff, recurringExpenses: recurring, totalExpenses, rent, categoryTotals, emi, loan, debtPayments, totalOutflow, remaining: totalIncome - totalOutflow };
}

/** n months starting at `start`. Same engine as the dashboard, so forecast == dashboard logic. */
export const forecast = (start: string, n: number, inp: EngineInputs, today: string) =>
  [...Array(Math.max(1, n))].map((_, i) => summarize(shiftMonth(start, i), inp, today));

/** Spend counted against a budget: category budgets use that category's total (one-off + recurring); "ALL" uses total expenses. */
export function budgetSpent(s: MonthSummary, category: string): number {
  if (category === "ALL") return s.totalExpenses;
  const key = Object.keys(s.categoryTotals).filter((k) => k.toLowerCase() === category.toLowerCase());
  return sum(key.map((k) => s.categoryTotals[k]));
}

export interface Health { savingsRatePct: number | null; debtToIncomePct: number | null; emiBurdenPct: number | null; fixedExpensePct: number | null; monthlySurplus: number; warnings: string[] }
export function health(s: MonthSummary, fixedMonthly: number): Health {
  const pct = (a: number) => (s.totalIncome > 0 ? Math.trunc((a * 100) / s.totalIncome) : null);
  const warnings: string[] = [];
  const emiPct = pct(s.emi + s.loan);
  if (s.totalIncome > 0 && s.totalIncome < s.totalOutflow) warnings.push("Your expenses are higher than your income");
  if (emiPct !== null && emiPct >= 40) warnings.push("High EMI burden");
  const sav = pct(Math.max(s.remaining, 0));
  if (sav !== null && sav >= 20) warnings.push("Good savings progress");
  return { savingsRatePct: sav, debtToIncomePct: pct(s.emi + s.loan + s.debtPayments), emiBurdenPct: emiPct, fixedExpensePct: pct(fixedMonthly), monthlySurplus: s.remaining, warnings };
}

/** Debt I owe, still outstanding at the end of each given month (for the "debt reduction" report). */
export function owedAtEnd(ym: string, debts: FriendDebt[], pays: FriendPayment[]): number {
  const end = monthEnd(ym), owe = debts.filter((d) => d.direction === "I owe" && d.date <= end), ids = new Set(owe.map((d) => d.id));
  return Math.max(0, sum(owe.map((d) => d.amount)) - sum(pays.filter((p) => ids.has(p.debtId) && p.date <= end).map((p) => p.amount)));
}
export { monthIndex };
