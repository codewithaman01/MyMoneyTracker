import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Crud } from "./Crud";
import { budgetStatus, goalCompletion, goalMonthlyNeeded, monthlyInterest, parseMoney, planPayoff, portfolio, remainingTenure, sum, thisMonth, todayIso, type Method } from "./lib/calc";
import { db, INV_TYPES, METHODS, SOURCES, useSettings } from "./lib/db";
import { budgetSpent, summarize } from "./lib/engine";
import { useCategories, useEngine } from "./lib/hooks";
import * as repo from "./lib/repo";
import { Assume, fmt, Glass, Progress, Title } from "./ui";

const COLORS = ["#7c9cff", "#ff8fb1", "#7ef0c9", "#ffd479", "#b388ff", "#6fd3ff", "#ff9e7a", "#a5f3a0"];
export { COLORS };

export const IncomePage = ({ arg }: { arg?: any }) => (
  <Crud title="Income" table={db.income} dateKey="date" exportName="income" autoOpen={arg?.add}
    fields={[
      { key: "date", label: "Date", type: "date" }, { key: "source", label: "Source", type: "select", options: SOURCES },
      { key: "amount", label: "Amount", type: "money" }, { key: "status", label: "Status", type: "select", options: ["received", "expected"] },
      { key: "recurring", label: "Repeats", type: "select", options: ["none", "monthly"] }, { key: "note", label: "Note", type: "text", optional: true }]}
    cols={(r) => ({ title: r.source, sub: `${r.date}${r.note ? " · " + r.note : ""}`, amount: r.amount, badge: r.status === "received" ? "Received" : "Expected" })} />
);

export function ExpensesPage({ arg }: { arg?: any }) {
  const { cats, add } = useCategories();
  return (
    <Crud title="Expenses" table={db.expenses} dateKey="date" exportName="expenses" autoOpen={arg?.add} categoryFilter={{ key: "category", options: cats }}
      fields={[
        { key: "date", label: "Date", type: "date" }, { key: "category", label: "Category", type: "select", options: cats, creatable: add },
        { key: "method", label: "Payment method", type: "select", options: METHODS }, { key: "amount", label: "Amount", type: "money" },
        { key: "recurring", label: "Repeats", type: "select", options: ["none", "monthly"] }, { key: "note", label: "Description / note", type: "text", optional: true }]}
      cols={(r) => ({ title: r.category, sub: `${r.date} · ${r.method}${r.note ? " · " + r.note : ""}`, amount: r.amount })} />
  );
}

function BudgetStatus() {
  const { alertPct } = useSettings();
  const m = thisMonth();
  const d = useEngine();
  if (!d) return null;
  const sm = summarize(m, d, todayIso());
  return (
    <Glass>
      <b>This month · planned vs actual</b>
      {d.budgets.filter((b) => b.month === m).length === 0 && <small className="muted"> Add a budget below (category “ALL” = overall).</small>}
      {d.budgets.filter((b) => b.month === m).map((b) => {
        const spent = budgetSpent(sm, b.category), s = budgetStatus(b.limit, spent, alertPct);
        return <div key={b.id} className="bstat"><div className="line"><span>{b.category}</span><span className={`t-${s.level}`}>{fmt(spent)} / {fmt(b.limit)} · {s.pct}%</span></div><Progress pct={s.pct} level={s.level} /></div>;
      })}
      <small className="muted">Spending includes expense entries and recurring payments. Money left in the monthly plan: {fmt(sm.remaining)}</small>
    </Glass>
  );
}
export function BudgetsPage({ arg }: { arg?: any }) {
  const { cats } = useCategories();
  return (
    <>
      <BudgetStatus />
      <Crud title="Budgets" table={db.budgets} dateKey="month" exportName="budgets" autoOpen={arg?.add}
        fields={[{ key: "month", label: "Month", type: "month" }, { key: "category", label: "Category", type: "select", options: ["ALL", ...cats] }, { key: "limit", label: "Limit", type: "money" }]}
        cols={(r) => ({ title: r.category, sub: r.month, amount: r.limit })} />
    </>
  );
}

export const GoalsPage = ({ arg }: { arg?: any }) => (
  <Crud title="Goals" table={db.goals} exportName="goals" autoOpen={arg?.add}
    fields={[
      { key: "name", label: "Goal (e.g. Emergency fund)", type: "text" }, { key: "target", label: "Target amount", type: "money" },
      { key: "saved", label: "Saved so far", type: "money", zero: true }, { key: "deadline", label: "Deadline", type: "date" },
      { key: "monthly", label: "Planned monthly contribution", type: "money", zero: true }]}
    cols={(g) => {
      const n = goalMonthlyNeeded(g.target, g.saved, g.deadline, todayIso()), done = goalCompletion(g.target, g.saved, g.monthly, todayIso());
      return { title: g.name, amount: g.target, progress: (g.saved / g.target) * 100,
        sub: `${fmt(g.saved)} saved (${Math.min(100, Math.round((g.saved / g.target) * 100))}%) · by ${g.deadline} · need ${fmt(n.monthly)}/mo · est. done ${done ?? "set a monthly amount"} (estimate)` };
    }}
    actions={(g) => <>
      <button className="link" onClick={async () => { const p = parseMoney(prompt("Amount to add to this goal:") || ""); if (p) await repo.adjustSavings(g.id, p); }}>+ Contribute</button>
      <button className="link" onClick={async () => { const p = parseMoney(prompt("Amount to withdraw from this goal:") || ""); if (p && !(await repo.adjustSavings(g.id, -p))) alert(`You only have ${fmt(g.saved)} saved.`); }}>Withdraw</button></>} />
);

export function InvestmentsPage({ arg }: { arg?: any }) {
  const inv = useLiveQuery(() => db.investments.toArray(), [], []);
  const p = portfolio(inv);
  const data = Object.entries(p.byType).map(([name, v]) => ({ name, value: v / 100 }));
  return (
    <>
      {inv.length > 0 && (
        <Glass>
          <b>Portfolio {fmt(p.current)}</b>
          <small className="muted"> invested {fmt(p.invested)} · P/L {fmt(p.pnl)}{p.pnlPct !== null ? ` (${p.pnlPct}%)` : ""} · values are as you entered them</small>
          <div className="chart sm"><ResponsiveContainer><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} stroke="none">{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v) => fmt(Number(v) * 100)} /></PieChart></ResponsiveContainer></div>
        </Glass>
      )}
      <Crud title="Investments" table={db.investments} exportName="investments" autoOpen={arg?.add}
        fields={[
          { key: "type", label: "Type", type: "select", options: INV_TYPES }, { key: "name", label: "Name", type: "text" },
          { key: "quantity", label: "Quantity", type: "number" }, { key: "invested", label: "Amount invested", type: "money" },
          { key: "current", label: "Current value (you update it)", type: "money", zero: true }, { key: "date", label: "Purchase date", type: "date" }]}
        cols={(r) => { const pl = r.current - r.invested; return { title: r.name, amount: r.current, badge: `${pl >= 0 ? "Gain" : "Loss"} ${fmt(Math.abs(pl))}`, sub: `${r.type} · qty ${r.quantity} · invested ${fmt(r.invested)} · ${r.date}` }; }} />
    </>
  );
}

function Planner() {
  const debts = useLiveQuery(() => db.debts.toArray(), [], []);
  const pays = useLiveQuery(() => db.debtPayments.orderBy("id").reverse().limit(5).toArray(), [], []);
  const [extra, setExtra] = useState("0"), [method, setMethod] = useState<Method>("avalanche");
  const live = debts.filter((d) => d.outstanding > 0);
  if (!live.length) return null;
  const budget = sum(live.map((d) => d.emi)) + (parseMoney(extra) ?? 0);
  const run = (m: Method) => { try { return planPayoff(live.map((d) => ({ name: d.lender, balance: d.outstanding, rate: d.rate, min: d.emi })), budget, m, todayIso()); } catch (e: any) { return e.message as string; } };
  const plans = { avalanche: run("avalanche"), snowball: run("snowball") };
  const chosen = plans[method];
  return (
    <Glass>
      <b>Repayment planner</b>
      <label>Extra per month<input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} /></label>
      <div className="seg">{(["avalanche", "snowball"] as Method[]).map((m) => <button key={m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{m}</button>)}</div>
      {typeof chosen === "string" ? <p className="err">{chosen}</p> : (
        <>
          {(["avalanche", "snowball"] as Method[]).map((m) => { const p = plans[m]; return typeof p === "string" ? null :
            <div key={m} className="line"><span>{m}</span><span>{p.months} mo · debt-free {p.payoffDate} · interest {fmt(p.totalInterest)}</span></div>; })}
          <small className="muted">Payoff order ({method}): {[...chosen.debts].sort((a, b) => a.payoffMonth - b.payoffMonth).map((d) => `${d.name} (month ${d.payoffMonth})`).join(" → ")}</small>
          <Assume items={chosen.assumptions} />
        </>
      )}
      {pays.length > 0 && <small className="muted">Recent payments: {pays.map((p) => `${p.date} ${fmt(p.amount)}${p.early ? " (early)" : ""}`).join(" · ")}</small>}
    </Glass>
  );
}

export const DebtsPage = ({ arg }: { arg?: any }) => (
  <>
    <Planner />
    <Crud title="Debts & EMIs" table={db.debts} exportName="debts" autoOpen={arg?.add}
      fields={[
        { key: "lender", label: "Lender", type: "text" }, { key: "principal", label: "Original loan amount", type: "money" },
        { key: "outstanding", label: "Outstanding balance", type: "money", zero: true }, { key: "rate", label: "Interest rate (% per year)", type: "number" },
        { key: "emi", label: "EMI amount", type: "money" }, { key: "dueDay", label: "Due day of month (1-31)", type: "number" }, { key: "note", label: "Note", type: "text", optional: true }]}
      cols={(d) => {
        let tenure = "n/a";
        try { tenure = d.outstanding > 0 ? `${remainingTenure(d.outstanding, d.rate, d.emi)} mo left (est.)` : "cleared"; } catch { tenure = "EMI below interest"; }
        return { title: d.lender, amount: d.outstanding, progress: d.principal ? ((d.principal - d.outstanding) / d.principal) * 100 : 0, sub: `${d.rate}% · EMI ${fmt(d.emi)} · due day ${d.dueDay} · ${tenure}` };
      }}
      actions={(d) => <button className="link" onClick={async () => {
        const amount = parseMoney(prompt("Payment amount:") || "");
        if (!amount) return;
        const early = confirm("Is this an early / extra repayment?\n(OK = early repayment, Cancel = regular EMI)");
        const interest = early ? 0 : Math.min(monthlyInterest(d.outstanding, d.rate), amount);
        const principal = Math.min(amount - interest, d.outstanding);
        await db.transaction("rw", db.debts, db.debtPayments, async () => {
          await db.debtPayments.add({ debtId: d.id, date: todayIso(), amount, interest, principal, early });
          await db.debts.update(d.id, { outstanding: d.outstanding - principal });
        });
      }}>Record payment</button>} />
  </>
);
