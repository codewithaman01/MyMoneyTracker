import { useLiveQuery } from "dexie-react-hooks";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { budgetStatus, cashflow, inMonth, portfolio, sum, thisMonth, todayIso } from "./lib/calc";
import { loadAll, useSettings } from "./lib/db";
import { budgetSpent, health, summarize } from "./lib/engine";
import { useEngine } from "./lib/hooks";
import { MonthNav } from "./Calendar";
import { useState } from "react";
import { monthSeries } from "./lib/insights";
import { COLORS } from "./Pages";
import { fmt, Glass, Kpi, Progress, Title } from "./ui";

const tip = { contentStyle: { background: "rgba(20,16,50,.9)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 12, color: "#fff" }, formatter: (v: unknown) => fmt(Number(v) * 100) };
const axis = { stroke: "rgba(255,255,255,.55)", fontSize: 11 };

export default function Dashboard({ go }: { go: (p: string) => void }) {
  const { alertPct } = useSettings();
  const d = useLiveQuery(loadAll, [], null);
  const eng = useEngine();
  const [pm, setPm] = useState(thisMonth());
  if (!d) return null;
  const m = thisMonth(), cf = cashflow(d.income, d.expenses, m), series = monthSeries(d, m, 6);
  const debt = sum(d.debts.map((x) => x.outstanding)), emi = sum(d.debts.map((x) => x.emi));
  const pf = portfolio(d.investments);
  const emergency = sum(d.goals.filter((g) => /emergency/i.test(g.name)).map((g) => g.saved));
  const cats: Record<string, number> = {};
  inMonth(d.expenses, m).forEach((e) => (cats[e.category] = (cats[e.category] || 0) + e.amount));
  const pie = Object.entries(cats).map(([name, v]) => ({ name, value: v / 100 }));
  const invPie = Object.entries(pf.byType).map(([name, v]) => ({ name, value: v / 100 }));
  const sm = summarize(m, eng ?? { incomeSources: [], recurring: [], changes: [], expenses: d.expenses, emiPayments: [], loanPayments: [], friendDebts: [], friendPayments: [] }, todayIso());
  const budgets = d.budgets.filter((b) => b.month === m).map((b) => ({ b, s: budgetStatus(b.limit, budgetSpent(sm, b.category), alertPct) }));
  const alerts = budgets.filter((x) => x.s.level !== "ok").map((x) => `${x.b.category} budget at ${x.s.pct}%`);
  const day = Number(todayIso().slice(8));
  const due = d.debts.filter((x) => x.outstanding > 0 && x.dueDay >= day && x.dueDay - day <= 7).map((x) => `${x.lender} EMI ${fmt(x.emi)} on day ${x.dueDay}`);
  const goalPct = d.goals.length ? Math.round(sum(d.goals.map((g) => Math.min(1, g.saved / g.target))) / d.goals.length * 100) : 0;
  const empty = !d.income.length && !d.expenses.length;

  return (
    <>
      <Title>Overview · {m}</Title>
      {empty && <Glass className="empty">Welcome! Add income and expenses, or load sample data in <a onClick={() => go("settings")}>Settings</a>.</Glass>}
      {eng && (() => {
        const ps = summarize(pm, eng, todayIso()), h = health(ps, ps.rent + ps.emi + ps.loan), food = ps.categoryTotals.Food ?? 0, travel = ps.categoryTotals.Travel ?? 0;
        const empty = ps.totalIncome === 0 && ps.totalOutflow === 0;
        return (
          <Glass>
            <b>Monthly plan</b>
            <MonthNav ym={pm} onChange={setPm} />
            <small className="muted">Remaining balance</small>
            <div className={`big ${ps.remaining < 0 ? "t-over" : "t-good"}`}>{fmt(ps.remaining)}</div>
            {empty && <small className="muted">Nothing planned yet. Use “+ Add” to add an income plan, recurring payment, EMI or loan.</small>}
            {[["Total income", ps.totalIncome], ["Total expenses", ps.totalExpenses], ["Total EMI", ps.emi], ["Loan payments", ps.loan], ["Debt payments", ps.debtPayments], ["Rent", ps.rent], ["Food", food], ["Travel", travel], ["Savings (all goals)", d.goals.reduce((a, g) => a + g.saved, 0)]]
              .map(([k, v]) => <div key={k as string} className="line"><span>{k}</span><span>{fmt(v as number)}</span></div>)}
            {h.warnings.map((w) => <div key={w}>• {w}</div>)}
            {h.savingsRatePct !== null && <small className="muted">Savings rate {h.savingsRatePct}% · EMI burden {h.emiBurdenPct ?? 0}%</small>}
          </Glass>
        );
      })()}
      {(alerts.length > 0 || due.length > 0) && <Glass className="alert">{[...alerts, ...due.map((x) => "Due soon: " + x)].map((a) => <div key={a}>⚠ {a}</div>)}</Glass>}
      <div className="grid">
        <Kpi label="Income received" value={fmt(cf.received)} tone="g" />
        <Kpi label="Expenses" value={fmt(cf.spent)} tone="r" />
        <Kpi label="Net savings" value={fmt(cf.net)} tone={cf.net >= 0 ? "g" : "r"} />
        <Kpi label="Outstanding debt" value={fmt(debt)} />
        <Kpi label="Monthly EMI" value={fmt(emi)} />
        <Kpi label="Emergency fund" value={fmt(emergency)} />
        <Kpi label="Portfolio value" value={fmt(pf.current)} />
        <Kpi label="Goal progress" value={`${goalPct}%`} />
      </div>
      <Glass><b>Income vs expenses (6 months)</b>
        <div className="chart"><ResponsiveContainer><BarChart data={series.map((s) => ({ m: s.month.slice(5), Income: s.received / 100, Expenses: s.spent / 100 }))}>
          <CartesianGrid stroke="rgba(255,255,255,.1)" vertical={false} /><XAxis dataKey="m" {...axis} /><YAxis {...axis} width={44} /><Tooltip {...tip} /><Legend />
          <Bar dataKey="Income" fill="#7ef0c9" radius={[6, 6, 0, 0]} /><Bar dataKey="Expenses" fill="#ff8fb1" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></Glass>
      <Glass><b>Savings trend</b>
        <div className="chart sm"><ResponsiveContainer><LineChart data={series.map((s) => ({ m: s.month.slice(5), Net: s.net / 100 }))}>
          <CartesianGrid stroke="rgba(255,255,255,.1)" vertical={false} /><XAxis dataKey="m" {...axis} /><YAxis {...axis} width={44} /><Tooltip {...tip} /><Line dataKey="Net" stroke="#7c9cff" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></Glass>
      {pie.length > 0 && <Glass><b>Expense categories</b>
        <div className="chart"><ResponsiveContainer><PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} stroke="none">{pie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip {...tip} /><Legend /></PieChart></ResponsiveContainer></div></Glass>}
      {budgets.length > 0 && <Glass><b>Budget utilisation</b>{budgets.map(({ b, s }) => <div key={b.id} className="bstat"><div className="line"><span>{b.category}</span><span className={`t-${s.level}`}>{s.pct}%</span></div><Progress pct={s.pct} level={s.level} /></div>)}</Glass>}
      {d.debts.length > 0 && <Glass><b>Debt repayment progress</b>{d.debts.map((x) => <div key={x.id} className="bstat"><div className="line"><span>{x.lender}</span><span>{fmt(x.outstanding)} left</span></div><Progress pct={x.principal ? ((x.principal - x.outstanding) / x.principal) * 100 : 0} /></div>)}</Glass>}
      {invPie.length > 0 && <Glass><b>Investment allocation</b>
        <div className="chart sm"><ResponsiveContainer><PieChart><Pie data={invPie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} stroke="none">{invPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip {...tip} /><Legend /></PieChart></ResponsiveContainer></div></Glass>}
    </>
  );
}
