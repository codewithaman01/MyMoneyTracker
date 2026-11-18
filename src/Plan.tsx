import { useState } from "react";
import { Crud, type Field } from "./Crud";
import { parseMoney, shiftMonth, thisMonth, todayIso } from "./lib/calc";
import { db, type Change, type ChangeTarget, type Freq, type IncomeSource, type Recurring } from "./lib/db";
import { monthLabel, prettyDate } from "./lib/dates";
import { forecast } from "./lib/engine";
import { FREQ_LABELS, useCategories, useEngine } from "./lib/hooks";
import * as repo from "./lib/repo";

import { fmt, Glass, Title } from "./ui";

const FREQS: Freq[] = ["monthly", "daily", "weekly", "yearly", "custom", "once"];
const when = (r: { frequency: Freq; startDate: string; endDate: string; customDays: number; dueDay: number }) =>
  `${r.frequency === "custom" ? `Every ${r.customDays} days` : FREQ_LABELS[r.frequency]}${r.frequency === "monthly" ? ` (day ${r.dueDay})` : ""} · from ${prettyDate(r.startDate)}${r.endDate ? ` to ${prettyDate(r.endDate)}` : ""}`;

/** Checks shared by income plans and recurring payments. */
const ruleProblem = (o: any, dayLabel: string) =>
  o.endDate && o.endDate < o.startDate ? "End date cannot be before the start date."
  : o.frequency === "custom" && !(o.customDays > 0) ? "Enter the number of days between repeats."
  : o.frequency === "monthly" && !(o.dueDay >= 1 && o.dueDay <= 31) ? `${dayLabel} must be between 1 and 31.` : null;

const PauseResume = (table: typeof db.incomeSources | typeof db.recurring) => (r: { id?: number; status: string }) => (
  <button className="link" onClick={() => (table as any).update(r.id, { status: r.status === "paused" ? "active" : "paused" })}>{r.status === "paused" ? "Resume" : "Pause"}</button>
);

export function IncomePlansPage({ arg }: { arg?: any }) {
  const fields: Field[] = [
    { key: "name", label: "Income name (e.g. Salary)", type: "text" }, { key: "amount", label: "Amount", type: "money" },
    { key: "source", label: "Source", type: "text", optional: true },
    { key: "frequency", label: "Frequency", type: "select", options: FREQS, labels: FREQ_LABELS },
    { key: "customDays", label: "Repeat every N days", type: "number", showIf: (f) => f.frequency === "custom" },
    { key: "dueDay", label: "Payment day of month (1-31)", type: "number", def: "1", showIf: (f) => f.frequency === "monthly" },
    { key: "startDate", label: "Start date", type: "date" },
    { key: "endDate", label: "End date (optional, repeats stop after it)", type: "date", optional: true, def: "", showIf: (f) => f.frequency !== "once" },
    { key: "status", label: "Status", type: "select", options: ["active", "paused"], labels: { active: "Active", paused: "Paused" } },
    { key: "note", label: "Notes", type: "text", optional: true }];
  return (
    <Crud title="Income plans" table={db.incomeSources} exportName="income-plans" fields={fields} autoOpen={arg?.add}
      headerExtra={<Glass className="muted">Recurring income that feeds the monthly plan, e.g. salary ₹29,800 every month, or extra income that stops after 3 months. Use “Future changes” for raises.</Glass>}
      validate={(o) => ruleProblem(o, "Payment day")} onDelete={(r) => repo.deleteIncomeSource(r.id)} confirmText="Delete this income plan and its scheduled changes?"
      actions={PauseResume(db.incomeSources)}
      cols={(r: IncomeSource) => ({ title: r.name, sub: `${when(r)}${r.source ? " · " + r.source : ""}`, amount: r.amount, badge: r.status === "paused" ? "Paused" : undefined })} />
  );
}

export function RecurringPage({ arg }: { arg?: any }) {
  const { cats, add } = useCategories();
  const fields: Field[] = [
    { key: "name", label: "Name (Rent, Internet, Gym, Travel…)", type: "text" }, { key: "amount", label: "Amount per payment", type: "money" },
    { key: "category", label: "Category", type: "select", options: cats, creatable: add, def: "Rent" },
    { key: "method", label: "Payment method", type: "select", options: ["Bank", "UPI", "Cash", "Debit card", "Credit card", "Other"] },
    { key: "frequency", label: "Frequency", type: "select", options: FREQS.filter((f) => f !== "once"), labels: FREQ_LABELS },
    { key: "customDays", label: "Repeat every N days", type: "number", showIf: (f) => f.frequency === "custom" },
    { key: "dueDay", label: "Due day of month (1-31)", type: "number", def: "1", showIf: (f) => f.frequency === "monthly" },
    { key: "weekdays", label: "Days", type: "select", options: ["all", "monsat"], labels: { all: "Every day", monsat: "Monday–Saturday only (no Sundays)" }, showIf: (f) => f.frequency === "daily" },
    { key: "startDate", label: "Start date", type: "date" }, { key: "endDate", label: "End date (optional)", type: "date", optional: true, def: "" },
    { key: "status", label: "Status", type: "select", options: ["active", "paused"], labels: { active: "Active", paused: "Paused" } },
    { key: "note", label: "Notes", type: "text", optional: true }];
  return (
    <Crud title="Recurring payments" table={db.recurring} exportName="recurring-payments" fields={fields} autoOpen={arg?.add}
      headerExtra={<Glass className="muted">Rent, bills, subscriptions or daily travel. They count in the monthly plan, dashboard and budgets without you entering them every month.</Glass>}
      validate={(o) => ruleProblem(o, "Due day")} onDelete={(r) => repo.deleteRecurring(r.id)} confirmText="Delete this recurring payment and its scheduled changes?"
      actions={PauseResume(db.recurring)}
      cols={(r: Recurring) => ({ title: r.name, sub: `${when(r)} · ${r.category}${r.frequency === "daily" && r.weekdays === "monsat" ? " · Mon–Sat" : ""}`, amount: r.amount, badge: r.status === "paused" ? "Paused" : undefined })} />
  );
}

// ===================== FUTURE CHANGES =====================
const TARGET_LABELS: Record<ChangeTarget, string> = { income: "Income plan", recurring: "Rent / recurring payment", emi: "EMI" };

export function ChangesPage() {
  const d = useEngine();
  const [show, setShow] = useState(false);
  const [type, setType] = useState<ChangeTarget>("income"), [sel, setSel] = useState(""), [from, setFrom] = useState(`${shiftMonth(thisMonth(), 1)}-01`), [amt, setAmt] = useState(""), [err, setErr] = useState("");
  if (!d) return null;
  const items = (t: ChangeTarget) => (t === "income" ? d.incomeSources : t === "recurring" ? d.recurring : d.emis).map((x) => ({ id: x.id!, name: x.name }));
  const nameOf = (c: Change) => items(c.target).find((x) => x.id === c.targetId)?.name ?? "(deleted)";
  const targets = items(type);
  const save = async () => {
    const a = parseMoney(amt), id = Number(sel || targets[0]?.id);
    if (!targets.length) return setErr("Add that item first.");
    if (a === null) return setErr("Enter a valid amount.");
    if (!from) return setErr("Choose the date the change starts.");
    await repo.addChange({ target: type, targetId: id, from, amount: a });
    setShow(false); setAmt(""); setErr("");
  };
  return (
    <>
      <Title right={<button className="btn" onClick={() => { setShow(true); setSel(""); setErr(""); }}>+ Add</button>}>Future changes</Title>
      <Glass className="muted">Schedule a new amount from a date onward, e.g. salary ₹35,000 from January, rent ₹8,500 from February, or an EMI that drops after 6 months. The plan, dashboard and calendar use the right amount for each month.</Glass>
      {show && (
        <Glass className="form">
          <label>What changes
            <select value={type} onChange={(e) => { setType(e.target.value as ChangeTarget); setSel(""); }}>{(Object.keys(TARGET_LABELS) as ChangeTarget[]).map((t) => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}</select></label>
          <label>Item
            <select value={sel || targets[0]?.id || ""} onChange={(e) => setSel(e.target.value)}>{targets.length ? targets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>) : <option value="">No items yet</option>}</select></label>
          <label>Effective from<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>New amount<input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
          {err && <p className="err">{err}</p>}
          <div className="row"><button className="btn" onClick={save}>Save</button><button className="btn ghost" onClick={() => setShow(false)}>Cancel</button></div>
        </Glass>
      )}
      {d.changes.length === 0 && <Glass className="empty">No scheduled changes.</Glass>}
      {[...d.changes].sort((a, b) => a.from.localeCompare(b.from)).map((c) => (
        <Glass key={c.id} className="item">
          <div className="line"><div><b>{nameOf(c)} → {fmt(c.amount)}</b><small>{TARGET_LABELS[c.target]} · from {prettyDate(c.from)}</small></div></div>
          <div className="row"><button className="link danger" onClick={async () => { if (confirm("Delete this change? The original amount applies again.")) await repo.deleteChange(c); }}>Delete</button></div>
        </Glass>
      ))}
    </>
  );
}

// ===================== MONTHLY PLAN =====================
export function PlanPage() {
  const d = useEngine();
  const [n, setN] = useState(12), [custom, setCustom] = useState("");
  if (!d) return null;
  const rows = forecast(thisMonth(), n, d, todayIso());
  const presets = [1, 3, 6, 12, 24];
  return (
    <>
      <Title>Monthly plan</Title>
      <Glass className="muted">What each coming month looks like, worked out from your income plans, recurring payments, expense entries, EMIs, loans and friend debts. Scheduled changes are applied month by month.</Glass>
      <Glass className="filters chips-row">
        {presets.map((c) => <button key={c} className={`chip ${n === c ? "on" : ""}`} onClick={() => setN(c)}>{c} mo</button>)}
        <input className="mini" inputMode="numeric" placeholder="Custom (1-120)" value={custom}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setCustom(v); const k = Number(v); if (k >= 1 && k <= 120) setN(k); }} />
      </Glass>
      {rows.map((s) => (
        <Glass key={s.month}>
          <b>{monthLabel(s.month)}</b>
          {Object.entries(s.incomeBySource).map(([k, v]) => <div key={k} className="line"><span>{k}</span><span>{fmt(v)}</span></div>)}
          <div className="line strong"><span>Total income</span><span>{fmt(s.totalIncome)}</span></div>
          <hr />
          <div className="line"><span>Rent</span><span>{fmt(s.rent)}</span></div>
          <div className="line"><span>Other expenses</span><span>{fmt(s.totalExpenses - s.rent)}</span></div>
          <div className="line"><span>EMI</span><span>{fmt(s.emi)}</span></div>
          <div className="line"><span>Loan</span><span>{fmt(s.loan)}</span></div>
          <div className="line"><span>Friend / debt payments</span><span>{fmt(s.debtPayments)}</span></div>
          <hr />
          <div className={`line strong ${s.remaining < 0 ? "t-over" : "t-good"}`}><span>Remaining</span><span>{fmt(s.remaining)}</span></div>
        </Glass>
      ))}
    </>
  );
}
