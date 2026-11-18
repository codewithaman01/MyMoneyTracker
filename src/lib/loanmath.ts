// EMI / loan calculations ported from My Money Tracker (LoanMath). The interest rate always comes from the user;
// "" / null means "not entered yet" and nothing is hard-coded. Intermediate maths uses Decimal like calc.ts.
import Decimal from "decimal.js";
import { shiftMonth } from "./calc";
import { amountOn } from "./engine";
import type { Change, Emi, EmiPayment, InterestType, Loan, LoanPayment, Opt } from "./db";
import { dayInMonth, addDays } from "./dates";

const rnd = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const optNum = (v: Opt | null | undefined): number | null => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

/** Suggested EMI in paise, or null if the rate / type is unknown. The user can always override it. */
export function suggestedEmi(principal: number, rate: Opt | null, months: number, type: InterestType): number | null {
  const r = optNum(rate);
  if (!(months > 0) || r === null || type === "unknown" || !(principal > 0)) return null;
  if (type === "flat") return rnd(new Decimal(principal).plus(new Decimal(principal).mul(r).div(100).mul(months).div(12)).div(months));
  const mr = new Decimal(r).div(1200);
  if (mr.isZero()) return Math.floor(principal / months);
  const f = mr.plus(1).pow(months);
  return rnd(new Decimal(principal).mul(mr).mul(f).div(f.minus(1)));
}

export interface Row { no: number; dueDate: string; amount: number; principalPart: number; interestPart: number }
/** Month `offset` after start, on dueDay (clamped to the month length). */
export const dueDateFor = (start: string, offset: number, dueDay: number) =>
  dayInMonth(shiftMonth(start.slice(0, 7), offset), dueDay >= 1 && dueDay <= 31 ? dueDay : Number(start.slice(8)));

export function schedule(principal: number, rate: Opt | null, type: InterestType, months: number, emi: number, start: string, dueDay: number): Row[] {
  const r = optNum(rate) ?? 0, mr = new Decimal(r).div(1200), rows: Row[] = [];
  let balance = principal;
  for (let i = 1; i <= months; i++) {
    const interest = type === "reducing" ? rnd(new Decimal(balance).mul(mr)) : type === "flat" ? rnd(new Decimal(principal).mul(r).div(100).mul(months).div(12).div(months)) : 0;
    let pr = emi - interest, amt = emi;
    if (i === months && type === "reducing") { pr = balance; amt = pr + interest; } // clear rounding drift
    rows.push({ no: i, dueDate: dueDateFor(start, i - 1, dueDay), amount: amt, principalPart: pr, interestPart: interest });
    balance -= pr;
  }
  return rows;
}

/** Option B: start/end date -> number of monthly instalments (null if end is before start). */
export function monthsBetween(start: string, end: string): number | null {
  if (end < start) return null;
  const [y1, m1] = start.split("-").map(Number), [y2, m2] = end.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

export function emiSchedule(e: Emi, changes: Change[]): Omit<EmiPayment, "id">[] {
  return [...Array(e.totalMonths)].map((_, i) => {
    const due = dueDateFor(e.startDate, i, e.dueDay);
    // "Months 1-6 ₹3000, months 7-12 ₹2000" = scheduled changes on the EMI
    return { emiId: e.id!, no: i + 1, dueDate: due, amountDue: amountOn(e.monthly, "emi", e.id, changes, due), amountPaid: 0, paidDate: "", status: "pending" as const };
  });
}
export function loanSchedule(l: Loan): Omit<LoanPayment, "id">[] {
  const emi = optNum(l.emi) ?? suggestedEmi(l.principal, l.rate, l.tenure, l.interestType);
  if (emi === null) return [];
  return schedule(l.principal, l.rate, l.interestType, l.tenure, emi, l.startDate, l.dueDay)
    .map((r) => ({ loanId: l.id!, no: r.no, dueDate: r.dueDate, amountDue: r.amount, amountPaid: 0, principalPart: r.principalPart, interestPart: r.interestPart, paidDate: "", status: "pending" as const }));
}

const open = (p: { status: string }) => p.status === "pending" || p.status === "partial";
export function emiStats(e: Emi, pays: EmiPayment[]) {
  const counted = pays.filter((p) => p.status !== "skipped"), paid = counted.filter((p) => p.status === "paid"), openP = counted.filter(open);
  const paidAmount = sum(pays.map((p) => p.amountPaid)), totalDue = sum(counted.map((p) => p.amountDue));
  const base = e.original - e.down > 0 ? e.original - e.down : e.remaining;
  const sorted = (xs: EmiPayment[]) => [...xs].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    totalPayments: counted.length, paidCount: paid.length, remainingMonths: openP.length, paidAmount, remainingAmount: Math.max(totalDue - paidAmount, 0),
    nextDue: sorted(openP)[0]?.dueDate ?? "", completionDate: sorted(counted).at(-1)?.dueDate ?? "",
    totalInterest: Math.max(totalDue - base, 0), totalCharges: e.fee + e.other, isComplete: counted.length > 0 && openP.length === 0,
  };
}
export function loanStats(l: Loan, pays: LoanPayment[]) {
  const scheduled = pays.filter((p) => p.status !== "skipped"), charges = l.fee + l.insurance + l.other;
  const override = optNum(l.totalOverride);
  const totalRepayment = override ?? sum(scheduled.map((p) => p.amountDue)) + charges;
  const paidPays = pays.filter((p) => p.status === "paid" || p.status === "partial"), paidAmount = sum(paidPays.map((p) => p.amountPaid));
  const principalPaid = sum(paidPays.map((p) => p.principalPart));
  return {
    totalRepayment, totalInterest: Math.max(sum(scheduled.map((p) => p.amountDue)) - l.principal, 0), principalPaid, interestPaid: sum(paidPays.map((p) => p.interestPart)),
    remainingPrincipal: Math.max(l.principal - principalPaid, 0), remainingEmis: scheduled.filter(open).length,
    completionDate: [...scheduled].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).at(-1)?.dueDate ?? "", paidAmount,
    progressPercent: totalRepayment > 0 ? Math.min(100, Math.max(0, Math.trunc((paidAmount * 100) / totalRepayment))) : 0,
  };
}
export { addDays };
