import { anomalies, cashflow, debtToIncomePct, forecastNext, goalMonthlyNeeded, inMonth, shiftMonth, sum, todayIso } from "./calc";
import type { Data } from "./db";

export interface Insight { title: string; value: string; kind: "historical" | "current" | "estimate"; why: string }

export function monthSeries(d: Data, month: string, n: number) {
  return [...Array(n)].map((_, i) => {
    const m = shiftMonth(month, i - n + 1);
    return { month: m, ...cashflow(d.income, d.expenses, m) };
  });
}
const byCat = (rows: { category: string; amount: number }[]) => {
  const o: Record<string, number> = {};
  rows.forEach((r) => (o[r.category] = (o[r.category] || 0) + r.amount));
  return o;
};

export function buildInsights(d: Data, month: string, f: (p: number) => string): Insight[] {
  const out: Insight[] = [];
  const cf = cashflow(d.income, d.expenses, month);
  out.push({ title: "Cash flow", kind: "historical", value: `${f(cf.received)} in, ${f(cf.spent)} out, net ${f(cf.net)}`,
    why: `Only income marked Received counts. ${cf.expected ? f(cf.expected) + " expected income is excluded." : "No expected income pending."}` });
  out.push({ title: "Savings rate", kind: "historical", value: cf.savingsRatePct === null ? "n/a" : `${cf.savingsRatePct}%`,
    why: cf.savingsRatePct === null ? "No received income recorded for this month." : "(Received income − expenses) ÷ received income." });
  const dti = debtToIncomePct(sum(d.debts.map((x) => x.emi)), cf.received);
  out.push({ title: "Debt-to-income", kind: "current", value: dti === null ? "n/a" : `${dti}%`, why: "Total monthly EMIs ÷ this month's received income." });

  const spend = byCat(inMonth(d.expenses, month)), top = Object.entries(spend).sort((a, b) => b[1] - a[1])[0];
  if (top) out.push({ title: "Biggest category", kind: "historical", value: `${top[0]} · ${f(top[1])} (${Math.round((top[1] / cf.spent) * 100)}%)`, why: "Largest share of this month's expenses." });
  const prev = byCat(inMonth(d.expenses, shiftMonth(month, -1)));
  const move = Object.keys({ ...spend, ...prev }).map((c) => [c, (spend[c] || 0) - (prev[c] || 0)] as const).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  if (move && move[1] !== 0) out.push({ title: "Biggest change vs last month", kind: "historical", value: `${move[0]} ${move[1] > 0 ? "+" : "−"}${f(Math.abs(move[1]))}`, why: "Category difference between this and the previous month." });

  const odd = anomalies(d.expenses).slice(0, 3);
  out.push({ title: "Unusual expenses", kind: "historical", value: odd.length ? odd.map((o) => `${o.category} ${f(o.amount)} on ${o.date}`).join("; ") : "None detected",
    why: "Expense more than 2 standard deviations above its category's average (needs 5+ entries in the category)." });

  const series = monthSeries(d, month, 12).filter((x) => x.spent > 0 || x.received > 0).map((x) => x.spent);
  const fc = forecastNext(series);
  out.push(fc.ok
    ? { title: "Next month's expenses", kind: "estimate", value: f(fc.value), why: fc.assumptions.join(" ") }
    : { title: "Next month's expenses", kind: "estimate", value: "Not enough data", why: fc.reason });

  const avg3 = sum(monthSeries(d, shiftMonth(month, -1), 3).map((x) => x.spent)) / 3;
  if (avg3 > 0) out.push({ title: "Suggested overall budget", kind: "estimate", value: f(Math.round(avg3 * 1.05)), why: "Average spending of the previous 3 months plus 5% headroom. A starting point, not advice." });

  d.goals.forEach((g) => {
    const n = goalMonthlyNeeded(g.target, g.saved, g.deadline, todayIso());
    out.push({ title: `Goal: ${g.name}`, kind: "estimate", value: `${Math.min(100, Math.round((g.saved / g.target) * 100))}% · need ${f(n.monthly)}/mo`, why: `${f(n.remaining)} left, ${n.months} months to deadline, equal contributions, no returns.` });
  });
  return out;
}
