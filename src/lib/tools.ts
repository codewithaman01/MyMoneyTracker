// The only functions the AI assistant may call. They read local data, use calc.ts, and return plain facts.
// The model never sees raw tables and never computes numbers.
import { cashflow, goalMonthlyNeeded, inMonth, planPayoff, sum, thisMonth, todayIso, goalCompletion } from "./calc";
import { loadAll, loadEngine } from "./db";
import { addDays } from "./dates";
import { forecast, health } from "./engine";
import { eventsBetween } from "./events";

const M = (p: number) => Number((p / 100).toFixed(2)); // minor units -> major units for the model
const monthOf = (a: any) => (/^\d{4}-\d{2}$/.test(a?.month || "") ? a.month : thisMonth());

export const TOOL_DECLS = [
  { name: "get_spend", description: "Total spent in a month, optionally for one category.", parameters: { type: "OBJECT", properties: { month: { type: "STRING", description: "YYYY-MM, default current month" }, category: { type: "STRING" } } } },
  { name: "top_categories", description: "Spending by category for a month, largest first.", parameters: { type: "OBJECT", properties: { month: { type: "STRING" } } } },
  { name: "savings_capacity", description: "Received income, expenses and net savings for a month. Expected income is excluded.", parameters: { type: "OBJECT", properties: { month: { type: "STRING" } } } },
  { name: "debt_summary", description: "All debts: outstanding balance, rate, EMI.", parameters: { type: "OBJECT", properties: {} } },
  { name: "debt_free_date", description: "Estimated payoff date using avalanche or snowball with optional extra monthly payment.", parameters: { type: "OBJECT", properties: { method: { type: "STRING", description: "avalanche or snowball" }, extra_monthly: { type: "NUMBER", description: "extra amount per month in currency units" } } } },
  { name: "can_afford", description: "Whether a purchase fits this month's net cash flow.", parameters: { type: "OBJECT", properties: { amount: { type: "NUMBER", description: "price in currency units" } }, required: ["amount"] } },
  { name: "monthly_plan", description: "Planned month from income plans, recurring payments, expense entries, EMIs, loans and friend debts: income, expenses, EMI, loan, debt payments and remaining balance. Optionally several months ahead.", parameters: { type: "OBJECT", properties: { month: { type: "STRING", description: "YYYY-MM, default current month" }, months: { type: "NUMBER", description: "how many months to show, 1-12, default 1" } } } },
  { name: "upcoming_dues", description: "EMIs, loan instalments, rent/bills, friend debts, expected income and goal deadlines in the next N days.", parameters: { type: "OBJECT", properties: { days: { type: "NUMBER", description: "1-90, default 30" } } } },
  { name: "goal_monthly_needed", description: "Monthly saving needed for a goal (matched by name).", parameters: { type: "OBJECT", properties: { goal_name: { type: "STRING" } }, required: ["goal_name"] } },
];

export async function runTool(name: string, args: any = {}): Promise<any> {
  const d = await loadAll();
  const m = monthOf(args);
  switch (name) {
    case "get_spend": {
      let rows = inMonth(d.expenses, m);
      if (args.category) rows = rows.filter((r) => r.category.toLowerCase() === String(args.category).toLowerCase());
      return { kind: "historical", month: m, category: args.category || "all", total_spent: M(sum(rows.map((r) => r.amount))) };
    }
    case "top_categories": {
      const rows = inMonth(d.expenses, m), total = sum(rows.map((r) => r.amount)), by: Record<string, number> = {};
      rows.forEach((r) => (by[r.category] = (by[r.category] || 0) + r.amount));
      return { kind: "historical", month: m, total: M(total), categories: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([category, t]) => ({ category, total: M(t), share_pct: total ? Number(((t / total) * 100).toFixed(1)) : 0 })) };
    }
    case "savings_capacity": {
      const c = cashflow(d.income, d.expenses, m);
      return { kind: m === thisMonth() ? "current" : "historical", month: m, received_income: M(c.received), expected_income_not_counted: M(c.expected), expenses: M(c.spent), net_savings: M(c.net), savings_rate_pct: c.savingsRatePct };
    }
    case "debt_summary":
      return { kind: "current", total_outstanding: M(sum(d.debts.map((x) => x.outstanding))), monthly_emi: M(sum(d.debts.map((x) => x.emi))), debts: d.debts.map((x) => ({ lender: x.lender, outstanding: M(x.outstanding), annual_rate_pct: x.rate, emi: M(x.emi), due_day: x.dueDay })) };
    case "debt_free_date": {
      const live = d.debts.filter((x) => x.outstanding > 0);
      if (!live.length) return { kind: "current", message: "No outstanding debt." };
      const method = args.method === "snowball" ? "snowball" : "avalanche";
      const extra = Math.max(0, Math.round(Number(args.extra_monthly || 0) * 100));
      try {
        const p = planPayoff(live.map((x) => ({ name: x.lender, balance: x.outstanding, rate: x.rate, min: x.emi })), sum(live.map((x) => x.emi)) + extra, method, todayIso());
        return { kind: "estimate", method, extra_monthly: M(extra), months: p.months, debt_free_date: p.payoffDate, total_interest: M(p.totalInterest), order: [...p.debts].sort((a, b) => a.payoffMonth - b.payoffMonth).map((x) => x.name), assumptions: p.assumptions };
      } catch (e: any) { return { kind: "estimate", error: e.message }; }
    }
    case "can_afford": {
      const price = Math.round(Number(args.amount) * 100);
      if (!(price > 0)) throw new Error("amount must be positive");
      const c = cashflow(d.income, d.expenses, thisMonth());
      return { kind: "estimate", price: M(price), net_so_far_this_month: M(c.net), left_after_purchase: M(c.net - price), fits_this_months_net_cash_flow: c.net - price >= 0,
        assumptions: ["Uses only received income and recorded expenses for the current month.", "Upcoming EMIs, bills and goals are not deducted.", "Not financial advice."] };
    }
    case "goal_monthly_needed": {
      const g = d.goals.find((x) => x.name.toLowerCase().includes(String(args.goal_name || "").toLowerCase()));
      if (!g) return { error: "No goal with that name." };
      const n = goalMonthlyNeeded(g.target, g.saved, g.deadline, todayIso());
      return { kind: "estimate", goal: g.name, target: M(g.target), saved: M(g.saved), remaining: M(n.remaining), deadline: g.deadline, months_left: n.months, monthly_needed: M(n.monthly),
        completion_at_planned_monthly: goalCompletion(g.target, g.saved, g.monthly, todayIso()), assumptions: ["Equal monthly contributions, no returns."] };
    }
    case "monthly_plan": {
      const e = await loadEngine(), n = Math.min(12, Math.max(1, Math.round(Number(args.months) || 1)));
      const rows = forecast(m, n, e, todayIso());
      return { kind: "estimate", months: rows.map((s) => ({ month: s.month, income: M(s.totalIncome), expenses: M(s.totalExpenses), rent: M(s.rent), emi: M(s.emi), loan: M(s.loan), debt_payments: M(s.debtPayments), remaining: M(s.remaining), warnings: health(s, s.rent + s.emi + s.loan).warnings })),
        assumptions: ["Built from income plans, recurring payments, expense entries, EMI/loan schedules and friend debts, including scheduled changes.", "Skipped instalments and paused items are not counted.", "Not financial advice."] };
    }
    case "upcoming_dues": {
      const e = await loadEngine(), days = Math.min(90, Math.max(1, Math.round(Number(args.days) || 30))), today = todayIso();
      const list = eventsBetween(today, addDays(today, days), e).slice(0, 40);
      return { kind: "current", from: today, days, events: list.map((x) => ({ date: x.date, type: x.type, title: x.title, amount: M(x.amount) })) };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
