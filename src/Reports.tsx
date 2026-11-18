import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { shiftMonth, thisMonth, todayIso } from "./lib/calc";
import { monthLabel } from "./lib/dates";
import { owedAtEnd, summarize } from "./lib/engine";
import { useEngine } from "./lib/hooks";
import { fmt, Glass, Progress, Title } from "./ui";

const tip = { contentStyle: { background: "rgba(20,16,50,.9)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 12, color: "#fff" }, formatter: (v: unknown) => fmt(Number(v) * 100) };
const axis = { stroke: "rgba(255,255,255,.55)", fontSize: 11 };
const grid = <CartesianGrid stroke="rgba(255,255,255,.1)" vertical={false} />;

/** Month-by-month reports computed by the same engine as the dashboard and plan. */
export default function Reports() {
  const d = useEngine();
  const [n, setN] = useState(6), [custom, setCustom] = useState("");
  if (!d) return null;
  const today = todayIso(), now = thisMonth();
  const list = [...Array(n)].map((_, i) => summarize(shiftMonth(now, i - n + 1), d, today));
  const labels = list.map((s) => monthLabel(s.month, false));
  const income = list.map((s, i) => ({ m: labels[i], Income: s.totalIncome / 100 }));
  const outflow = list.map((s, i) => ({ m: labels[i], Expenses: s.totalOutflow / 100 }));
  const both = list.map((s, i) => ({ m: labels[i], Income: s.totalIncome / 100, Expenses: s.totalOutflow / 100 }));
  const left = list.map((s, i) => ({ m: labels[i], "Money left": s.remaining / 100 }));
  const debt = list.map((s, i) => ({ m: labels[i], "Debt I owe": owedAtEnd(s.month, d.friendDebts, d.friendPayments) / 100 }));
  const cat: Record<string, number> = {};
  list.forEach((s) => Object.entries(s.categoryTotals).forEach(([k, v]) => (cat[k] = (cat[k] || 0) + v)));
  cat.EMI = (cat.EMI || 0) + list.reduce((a, s) => a + s.emi, 0); cat.Loan = (cat.Loan || 0) + list.reduce((a, s) => a + s.loan, 0);
  const cats = Object.entries(cat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10), top = cats[0]?.[1] || 1;
  const bar = (data: any[], keys: [string, string][]) => (
    <div className="chart"><ResponsiveContainer><BarChart data={data}>{grid}<XAxis dataKey="m" {...axis} /><YAxis {...axis} width={48} /><Tooltip {...tip} />{keys.length > 1 && <Legend />}
      {keys.map(([k, c]) => <Bar key={k} dataKey={k} fill={c} radius={[6, 6, 0, 0]} />)}</BarChart></ResponsiveContainer></div>);
  const line = (data: any[], key: string, color: string) => (
    <div className="chart sm"><ResponsiveContainer><LineChart data={data}>{grid}<XAxis dataKey="m" {...axis} /><YAxis {...axis} width={48} /><Tooltip {...tip} /><Line dataKey={key} stroke={color} strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div>);
  return (
    <>
      <Title>Reports</Title>
      <Glass className="filters chips-row">
        {[1, 3, 6, 12].map((c) => <button key={c} className={`chip ${n === c ? "on" : ""}`} onClick={() => setN(c)}>{c === 1 ? "1 month" : `${c} months`}</button>)}
        <input className="mini" inputMode="numeric" placeholder="Custom (1-60)" value={custom}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setCustom(v); const k = Number(v); if (k >= 1 && k <= 60) setN(k); }} />
      </Glass>
      <Glass><b>Monthly income</b>{bar(income, [["Income", "#7ef0c9"]])}</Glass>
      <Glass><b>Monthly expenses</b><small>Including EMI, loan and debt payments</small>{bar(outflow, [["Expenses", "#ff8fb1"]])}</Glass>
      <Glass><b>Category spending</b>
        {cats.length === 0 && <small>No spending in this period.</small>}
        {cats.map(([k, v]) => <div key={k} className="bstat"><div className="line"><span>{k}</span><span>{fmt(v)}</span></div><Progress pct={(v / top) * 100} /></div>)}</Glass>
      <Glass><b>Income vs expense</b>{bar(both, [["Income", "#7ef0c9"], ["Expenses", "#ff8fb1"]])}</Glass>
      <Glass><b>Savings trend</b><small>Money left each month</small>{line(left, "Money left", "#7c9cff")}</Glass>
      <Glass><b>Debt reduction</b><small>Money I owe friends, outstanding at each month end</small>{line(debt, "Debt I owe", "#ffd479")}</Glass>
    </>
  );
}
