// Trusted calculation layer. All money is an integer number of paise/cents; Decimal is used for every
// intermediate step so no floating-point arithmetic touches balances. No DB, no network, no LLM here.
import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const rnd = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

export const toPaise = (v: string | number) => rnd(new Decimal(v).mul(100));
export const parseMoney = (s: string): number | null => {
  try {
    const d = new Decimal(s.replace(/,/g, "").trim());
    return d.isNaN() || d.isNeg() ? null : rnd(d.mul(100));
  } catch {
    return null;
  }
};

// ---------- dates ----------
const p2 = (n: number) => String(n).padStart(2, "0");
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
export const thisMonth = () => todayIso().slice(0, 7);
export const addMonths = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const idx = m - 1 + n;
  const yy = y + Math.floor(idx / 12);
  const mm = (((idx % 12) + 12) % 12) + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${p2(mm)}-${p2(Math.min(d, last))}`;
};
export const shiftMonth = (m: string, n: number) => addMonths(m + "-01", n).slice(0, 7);

// ---------- EMI ----------
const monthlyRate = (annual: number) => {
  if (!(annual >= 0 && annual <= 100)) throw new Error("annual rate must be between 0 and 100 (%)");
  return new Decimal(annual).div(1200);
};
export const monthlyInterest = (bal: number, annual: number) => rnd(new Decimal(bal).mul(monthlyRate(annual)));

export function emi(principal: number, annualRate: number, months: number): number {
  if (!(principal > 0) || !Number.isInteger(months) || months <= 0) throw new Error("principal and months must be positive");
  const r = monthlyRate(annualRate);
  if (r.isZero()) return rnd(new Decimal(principal).div(months));
  const f = r.plus(1).pow(months);
  return rnd(new Decimal(principal).mul(r).mul(f).div(f.minus(1)));
}

export interface Row { month: number; payment: number; interest: number; principal: number; balance: number }
export const EMI_ASSUMPTIONS = [
  "Fixed annual rate for the whole tenure (reducing-balance method).",
  "Interest accrues monthly at annual rate / 12 on the opening balance.",
  "Payments at month end; no prepayments or missed payments; last instalment absorbs rounding.",
];
export function schedule(principal: number, annualRate: number, months: number, payment?: number) {
  const r = monthlyRate(annualRate);
  const pay = payment ?? emi(principal, annualRate, months);
  let bal = principal, total = 0;
  const rows: Row[] = [];
  for (let m = 1; m <= months; m++) {
    const interest = rnd(new Decimal(bal).mul(r));
    const paid = m === months || pay >= bal + interest ? bal + interest : pay;
    bal -= paid - interest;
    total += interest;
    rows.push({ month: m, payment: paid, interest, principal: paid - interest, balance: bal });
    if (bal === 0) break;
  }
  return { rows, totalInterest: total, totalPaid: rows.reduce((s, x) => s + x.payment, 0), kind: "estimate" as const, assumptions: EMI_ASSUMPTIONS };
}

export function remainingTenure(outstanding: number, annualRate: number, emiAmount: number, max = 1200): number {
  if (outstanding < 0 || emiAmount <= 0) throw new Error("outstanding must be >= 0 and EMI > 0");
  let bal = outstanding, months = 0;
  while (bal > 0) {
    const i = monthlyInterest(bal, annualRate);
    if (emiAmount <= i) throw new Error("EMI does not cover the monthly interest");
    bal = bal + i > emiAmount ? bal + i - emiAmount : 0;
    if (++months > max) throw new Error("not repaid within max months");
  }
  return months;
}

// ---------- debt payoff ----------
export interface DebtIn { name: string; balance: number; rate: number; min: number }
export type Method = "avalanche" | "snowball";
export function planPayoff(debts: DebtIn[], budget: number, method: Method, start: string) {
  if (!debts.length) throw new Error("no debts");
  if (debts.reduce((s, d) => s + (d.balance > 0 ? d.min : 0), 0) > budget) throw new Error("monthly budget is lower than the sum of minimum payments");
  const n = debts.length;
  const bal = debts.map((d) => d.balance), interest = debts.map(() => 0);
  const done: (number | null)[] = bal.map((b) => (b === 0 ? 0 : null));
  const idx = [...Array(n).keys()];
  const order = idx.sort(method === "avalanche"
    ? (a, b) => debts[b].rate - debts[a].rate || debts[a].balance - debts[b].balance
    : (a, b) => debts[a].balance - debts[b].balance || debts[b].rate - debts[a].rate);
  let paidTotal = 0, month = 0;
  while (bal.some((b) => b > 0)) {
    if (++month > 1200) throw new Error("debts are not repaid within 100 years at this budget");
    for (let k = 0; k < n; k++) if (bal[k] > 0) { const i = monthlyInterest(bal[k], debts[k].rate); bal[k] += i; interest[k] += i; }
    let left = budget;
    for (let k = 0; k < n; k++) if (bal[k] > 0) { const p = Math.min(debts[k].min, bal[k]); bal[k] -= p; left -= p; }
    for (const k of order) { if (left <= 0) break; if (bal[k] > 0) { const p = Math.min(left, bal[k]); bal[k] -= p; left -= p; } }
    paidTotal += budget - left;
    for (let k = 0; k < n; k++) if (bal[k] === 0 && done[k] === null) done[k] = month;
  }
  return {
    method, months: month, payoffDate: addMonths(start, month),
    totalInterest: interest.reduce((a, b) => a + b, 0), totalPaid: paidTotal,
    debts: debts.map((d, k) => ({ name: d.name, payoffMonth: done[k] as number, interest: interest[k] })),
    kind: "estimate" as const,
    assumptions: [
      "Total monthly payment is fixed; payments freed by cleared debts roll into the next target.",
      "Each debt gets its minimum (its EMI) first; the rest goes to the priority debt.",
      `Priority (${method}): ${method === "avalanche" ? "highest interest rate first" : "smallest balance first"}.`,
      "Interest accrues monthly at annual rate / 12 on the balance before that month's payment.",
      "Fixed rates, no new borrowing, no missed payments, no fees. An estimate for planning, not a guarantee.",
    ],
  };
}

// ---------- cash flow, budgets, goals ----------
export interface Tx { date: string; amount: number; category?: string; status?: string }
export const inMonth = <T extends { date: string }>(rows: T[], m: string) => rows.filter((r) => r.date.startsWith(m));
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Only income with status "received" is ever counted. Expected income is reported separately. */
export function cashflow(income: Tx[], expenses: Tx[], m: string) {
  const inc = inMonth(income, m);
  const received = sum(inc.filter((x) => x.status === "received").map((x) => x.amount));
  const expected = sum(inc.filter((x) => x.status !== "received").map((x) => x.amount));
  const spent = sum(inMonth(expenses, m).map((x) => x.amount));
  const net = received - spent;
  return { received, expected, spent, net, savingsRatePct: received > 0 ? Number(new Decimal(net).div(received).mul(100).toFixed(1)) : null };
}

export function budgetStatus(limit: number, spent: number, thresholdPct: number) {
  const pct = limit > 0 ? Number(new Decimal(spent).div(limit).mul(100).toFixed(1)) : 0;
  return { pct, remaining: limit - spent, level: pct >= 100 ? ("over" as const) : pct >= thresholdPct ? ("warn" as const) : ("ok" as const) };
}

const monthsBetween = (a: string, b: string) => {
  const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
};
export function goalMonthlyNeeded(target: number, saved: number, deadline: string, today: string) {
  const remaining = Math.max(target - saved, 0);
  const months = monthsBetween(today, deadline);
  if (remaining === 0) return { remaining, months, monthly: 0 };
  return { remaining, months: Math.max(months, 0), monthly: months <= 0 ? remaining : Math.ceil(remaining / months) };
}
export function goalCompletion(target: number, saved: number, monthly: number, today: string): string | null {
  if (saved >= target) return today;
  if (monthly <= 0) return null;
  return addMonths(today, Math.ceil((target - saved) / monthly));
}
export const debtToIncomePct = (monthlyEmi: number, monthlyReceived: number) =>
  monthlyReceived > 0 ? Number(new Decimal(monthlyEmi).div(monthlyReceived).mul(100).toFixed(1)) : null;

export function portfolio(inv: { type: string; invested: number; current: number }[]) {
  const invested = sum(inv.map((i) => i.invested)), current = sum(inv.map((i) => i.current));
  const byType: Record<string, number> = {};
  inv.forEach((i) => (byType[i.type] = (byType[i.type] || 0) + i.current));
  return { invested, current, pnl: current - invested, pnlPct: invested > 0 ? Number(new Decimal(current - invested).div(invested).mul(100).toFixed(1)) : null, byType };
}

// ---------- statistics (estimates; floats are acceptable here, results are rounded to whole paise) ----------
export const MIN_FORECAST_MONTHS = 6;
export function forecastNext(series: number[]): { ok: true; value: number; assumptions: string[] } | { ok: false; reason: string } {
  if (series.length < MIN_FORECAST_MONTHS) return { ok: false, reason: `Need at least ${MIN_FORECAST_MONTHS} months of history (have ${series.length}); no forecast shown.` };
  const n = series.length, xs = series.map((_, i) => i), mx = (n - 1) / 2, my = sum(series) / n;
  const slope = sum(xs.map((x, i) => (x - mx) * (series[i] - my))) / sum(xs.map((x) => (x - mx) ** 2));
  return { ok: true, value: Math.max(0, Math.round(my + slope * (n - mx))), assumptions: ["Straight-line trend through the monthly totals.", "Assumes past behaviour continues; one-off events are not modelled."] };
}

export function anomalies<T extends { category: string; amount: number; date: string }>(rows: T[], minSamples = 5, z = 2) {
  const by: Record<string, T[]> = {};
  rows.forEach((r) => (by[r.category] ||= []).push(r));
  const out: (T & { mean: number })[] = [];
  for (const list of Object.values(by)) {
    if (list.length < minSamples) continue;
    const amts = list.map((x) => x.amount), mean = sum(amts) / amts.length;
    const sd = Math.sqrt(sum(amts.map((a) => (a - mean) ** 2)) / amts.length);
    if (sd === 0) continue;
    list.filter((x) => x.amount > mean + z * sd).forEach((x) => out.push({ ...x, mean: Math.round(mean) }));
  }
  return out.sort((a, b) => b.amount - a.amount);
}
