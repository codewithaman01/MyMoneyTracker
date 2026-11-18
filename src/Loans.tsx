import { useState } from "react";
import { Crud, type Field } from "./Crud";
import { parseMoney } from "./lib/calc";
import { db, type Emi, type EmiPayment, type Loan, type LoanPayment, type PayStatus } from "./lib/db";
import { prettyDate } from "./lib/dates";
import { INTEREST_LABELS, STATUS_LABELS, useEngine } from "./lib/hooks";
import { emiStats, loanStats, monthsBetween, optNum, suggestedEmi } from "./lib/loanmath";
import * as repo from "./lib/repo";
import { Assume, Badge, fmt, Glass, Progress, Title } from "./ui";

const PURPOSES = ["Mobile Phone", "Laptop", "Bike", "Car", "TV", "Furniture", "Education", "Medical", "Personal Loan", "Home Appliance", "Credit Card", "Other"];
const STATUSES = ["active", "paused", "completed", "cancelled"];
const INTERESTS = ["unknown", "reducing", "flat"];
const num = (v: any) => (v === "" || v == null ? 0 : Number(v));
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const view = (arg: any) => (typeof arg === "number" ? { id: arg } : {});

/** Paid / Pending / Skip / Partial buttons shared by the EMI and loan instalment lists. */
function PayButtons<T extends { status: PayStatus; amountDue: number }>({ p, set }: { p: T; set: (p: T, s: PayStatus, amount: number) => Promise<void> }) {
  const partial = async () => {
    const a = parseMoney(prompt(`Amount paid so far (due ${fmt(p.amountDue)}):`) || "");
    if (!a) return;
    if (a >= p.amountDue) await set(p, "paid", 0); else await set(p, "partial", a);
  };
  return (
    <div className="row">
      {p.status !== "paid" && <button className="link" onClick={() => set(p, "paid", 0)}>Mark paid</button>}
      {p.status !== "pending" && <button className="link" onClick={() => set(p, "pending", 0)}>Pending</button>}
      {p.status !== "skipped" && <button className="link" onClick={() => set(p, "skipped", 0)}>Skip</button>}
      <button className="link" onClick={partial}>Partial</button>
    </div>
  );
}
const Stat = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => <div className={`line ${bold ? "strong" : ""}`}><span>{k}</span><span>{v}</span></div>;

// ===================== EMI MANAGER =====================
function EmiDetail({ id, back, edit }: { id: number; back: () => void; edit: () => void }) {
  const d = useEngine();
  if (!d) return null;
  const e = d.emis.find((x) => x.id === id);
  if (!e) return <><Title right={<button className="btn ghost" onClick={back}>Back</button>}>EMI</Title><Glass className="empty">This EMI no longer exists.</Glass></>;
  const pays = d.emiPayments.filter((p) => p.emiId === id).sort((a, b) => a.no - b.no), st = emiStats(e, pays);
  return (
    <>
      <Title right={<button className="btn ghost" onClick={back}>Back</button>}>{e.name}</Title>
      <Glass>
        {st.isComplete && <b className="t-good">COMPLETED — {fmt(e.monthly)}/month freed</b>}
        <small>{e.purpose}{e.lender ? ` · ${e.lender}` : ""}</small>
        <Stat k="Total payments" v={String(st.totalPayments)} /><Stat k="Paid" v={`${st.paidCount} (${fmt(st.paidAmount)})`} />
        <Stat k="Remaining amount" v={fmt(st.remainingAmount)} /><Stat k="Remaining months" v={String(st.remainingMonths)} />
        <Stat k="Next due" v={prettyDate(st.nextDue)} /><Stat k="Completion date" v={prettyDate(st.completionDate)} />
        <Stat k="Total interest" v={optNum(e.rate) === null && st.totalInterest === 0 ? "Not set" : fmt(st.totalInterest)} /><Stat k="Charges (fee + other)" v={fmt(st.totalCharges)} />
        <Progress pct={st.totalPayments ? (st.paidCount / st.totalPayments) * 100 : 0} /><small>{st.paidCount}/{st.totalPayments} paid</small>
        <div className="row"><button className="link" onClick={edit}>Edit EMI</button>
          <button className="link danger" onClick={async () => { if (confirm("Delete this EMI? Its payment history is deleted too.")) { await repo.deleteEmi(id); back(); } }}>Delete EMI</button></div>
      </Glass>
      {pays.map((p) => (
        <Glass key={p.id} className="item">
          <b>Payment {p.no}</b><Badge kind={p.status}>{label(p.status)}</Badge>
          <small>Due {prettyDate(p.dueDate)} · {fmt(p.amountDue)}{p.amountPaid > 0 ? ` · paid ${fmt(p.amountPaid)}` : ""}</small>
          <PayButtons p={p} set={(x: EmiPayment, s, a) => repo.setEmiPayment(x, s, a)} />
        </Glass>
      ))}
      <button className="link" onClick={() => repo.addManualEmiPayment(e)}>+ Add manual payment</button>
    </>
  );
}

export function EmisPage({ arg }: { arg?: any }) {
  const d = useEngine();
  const [v, setV] = useState<{ id?: number; edit?: number }>(view(arg));
  if (!d) return null;
  if (v.id != null) return <EmiDetail id={v.id} back={() => setV({})} edit={() => setV({ edit: v.id })} />;

  const months = (f: Record<string, string>) => (Number(f.totalMonths) > 0 ? Number(f.totalMonths) : f.endDate && f.startDate ? monthsBetween(f.startDate, f.endDate) ?? 0 : 0);
  const fields: Field[] = [
    { key: "name", label: "EMI name", type: "text" },
    { key: "purpose", label: "Purpose", type: "select", options: PURPOSES, def: "Other" },
    { key: "customPurpose", label: "…or custom purpose (e.g. Phone bought for work)", type: "text", optional: true },
    { key: "lender", label: "Lender / company", type: "text", optional: true }, { key: "description", label: "Description", type: "text", optional: true },
    { key: "original", label: "Original purchase / loan amount", type: "money", optional: true, zero: true },
    { key: "down", label: "Down payment", type: "money", optional: true, zero: true }, { key: "remaining", label: "Remaining principal", type: "money", optional: true, zero: true },
    { key: "monthly", label: "Monthly EMI", type: "money" },
    { key: "rate", label: "Interest rate % p.a. (optional)", type: "number", optional: true },
    { key: "interestType", label: "Interest type", type: "select", options: INTERESTS, labels: INTEREST_LABELS },
    { key: "fee", label: "Processing fee", type: "money", optional: true, zero: true }, { key: "other", label: "Other charges", type: "money", optional: true, zero: true },
    { key: "totalMonths", label: "Number of months", type: "number", optional: true },
    { key: "endDate", label: "…or end date (months are counted for you)", type: "date", optional: true, def: "" },
    { key: "startDate", label: "Start date", type: "date" }, { key: "dueDay", label: "EMI due day of month (1-31)", type: "number", def: "5" },
    { key: "status", label: "Status", type: "select", options: STATUSES, labels: STATUS_LABELS }];
  return (
    <Crud key={v.edit ?? "list"} title="EMI Manager" table={db.emis} exportName="emis" fields={fields} autoOpen={(arg as any)?.add} autoEdit={v.edit}
      empty="No EMIs yet. Tap “+ Add”." confirmText="Delete this EMI? Its payment history is deleted too."
      validate={(o) => {
        const n = o.totalMonths > 0 ? o.totalMonths : o.endDate ? monthsBetween(o.startDate, o.endDate) : undefined;
        return n === undefined ? "Enter the number of months or an end date." : n === null ? "End date must be on or after the start date." : n > 600 ? "Duration is too long." : !(o.dueDay >= 1 && o.dueDay <= 31) ? "Due day must be 1-31." : null;
      }}
      onSave={async (o, editId) => {
        const row: Omit<Emi, "id"> = { name: o.name, purpose: o.customPurpose || o.purpose, lender: o.lender, description: o.description, original: num(o.original), down: num(o.down), remaining: num(o.remaining),
          monthly: o.monthly, rate: o.rate, interestType: o.interestType, fee: num(o.fee), other: num(o.other), totalMonths: (o.totalMonths > 0 ? o.totalMonths : monthsBetween(o.startDate, o.endDate))!, startDate: o.startDate, dueDay: o.dueDay, status: o.status };
        if (editId) await repo.updateEmi({ ...row, id: editId }); else await repo.addEmi(row);
      }}
      onDelete={(r) => repo.deleteEmi(r.id)}
      extra={(f, set) => {
        const base = (parseMoney(f.original || "0") ?? 0) - (parseMoney(f.down || "0") ?? 0);
        const sug = f.rate && Number(f.rate) >= 0 ? suggestedEmi(base, Number(f.rate), months(f), f.interestType as any) : null;
        return sug ? <button className="link" onClick={() => set("monthly", (sug / 100).toFixed(2))}>Use calculated EMI: {fmt(sug)}</button> : null;
      }}
      onOpen={(r) => setV({ id: r.id })}
      cols={(e: Emi) => { const st = emiStats(e, d.emiPayments.filter((p) => p.emiId === e.id));
        return { title: e.name, amount: e.monthly, badge: e.status === "active" ? undefined : label(e.status), progress: st.totalPayments ? (st.paidCount / st.totalPayments) * 100 : 0,
          sub: `${e.purpose} · per month · ${st.paidCount}/${st.totalPayments} paid · ${st.remainingMonths} months left` }; }} />
  );
}

// ===================== LOAN MANAGER =====================
function LoanDetail({ id, back, edit }: { id: number; back: () => void; edit: () => void }) {
  const d = useEngine();
  if (!d) return null;
  const l = d.loans.find((x) => x.id === id);
  if (!l) return <><Title right={<button className="btn ghost" onClick={back}>Back</button>}>Loan</Title><Glass className="empty">This loan no longer exists.</Glass></>;
  const pays = d.loanPayments.filter((p) => p.loanId === id).sort((a, b) => a.no - b.no), st = loanStats(l, pays), rate = optNum(l.rate);
  return (
    <>
      <Title right={<button className="btn ghost" onClick={back}>Back</button>}>{l.name}</Title>
      <Glass>
        {pays.length === 0 && <p className="err">No schedule yet. Edit the loan and enter the interest rate and type, or the EMI.</p>}
        <Stat k="Principal" v={fmt(l.principal)} /><Stat k="Interest rate" v={rate === null ? "Not entered" : `${rate}% (${INTEREST_LABELS[l.interestType]})`} />
        <Stat k="Total interest" v={fmt(st.totalInterest)} /><Stat k="Total repayment" v={fmt(st.totalRepayment)} />
        <Stat k="Principal paid" v={fmt(st.principalPaid)} /><Stat k="Interest paid" v={fmt(st.interestPaid)} />
        <Stat k="Remaining principal" v={fmt(st.remainingPrincipal)} /><Stat k="Remaining EMIs" v={String(st.remainingEmis)} />
        <Stat k="Completion date" v={prettyDate(st.completionDate)} />
        <Progress pct={st.progressPercent} /><small>{fmt(st.paidAmount)} / {fmt(st.totalRepayment)} paid · {st.progressPercent}% complete</small>
        {l.interestType === "unknown" && rate !== null && <Assume items={["Interest type is “unknown”, so the split between interest and principal is not calculated. Choose Reducing or Flat for an exact schedule."]} />}
        <div className="row"><button className="link" onClick={edit}>Edit loan</button>
          <button className="link danger" onClick={async () => { if (confirm("Delete this loan? Its payment history is deleted too.")) { await repo.deleteLoan(id); back(); } }}>Delete loan</button></div>
      </Glass>
      {pays.map((p) => (
        <Glass key={p.id} className="item">
          <b>EMI {p.no}</b><Badge kind={p.status}>{label(p.status)}</Badge>
          <small>Due {prettyDate(p.dueDate)} · {fmt(p.amountDue)} (principal {fmt(p.principalPart)}, interest {fmt(p.interestPart)})</small>
          <PayButtons p={p} set={(x: LoanPayment, s, a) => repo.setLoanPayment(x, s, a)} />
        </Glass>
      ))}
    </>
  );
}

export function LoansPage({ arg }: { arg?: any }) {
  const d = useEngine();
  const [v, setV] = useState<{ id?: number; edit?: number }>(view(arg));
  if (!d) return null;
  if (v.id != null) return <LoanDetail id={v.id} back={() => setV({})} edit={() => setV({ edit: v.id })} />;
  const fields: Field[] = [
    { key: "name", label: "Loan name", type: "text" }, { key: "provider", label: "Provider (bank / company)", type: "text", optional: true }, { key: "purpose", label: "Purpose", type: "text", optional: true },
    { key: "principal", label: "Principal amount", type: "money" },
    { key: "rate", label: "Interest rate % p.a. (you enter it)", type: "number", optional: true },
    { key: "interestType", label: "Interest type", type: "select", options: INTERESTS, labels: INTEREST_LABELS },
    { key: "tenure", label: "Tenure (months)", type: "number" }, { key: "startDate", label: "Start date", type: "date" },
    { key: "emi", label: "EMI (leave empty if unknown)", type: "money", optional: true, zero: true },
    { key: "fee", label: "Processing fee", type: "money", optional: true, zero: true }, { key: "insurance", label: "Insurance", type: "money", optional: true, zero: true },
    { key: "other", label: "Other charges", type: "money", optional: true, zero: true },
    { key: "totalOverride", label: "Total repayment (optional, overrides the calculation)", type: "money", optional: true, zero: true },
    { key: "dueDay", label: "EMI due day of month (1-31)", type: "number", def: "5" }];
  return (
    <Crud key={v.edit ?? "list"} title="Loan Manager" table={db.loans} exportName="loans" fields={fields} autoOpen={(arg as any)?.add} autoEdit={v.edit}
      empty="No loans yet. Tap “+ Add”. Leave the rate and EMI empty if you don't know them yet." confirmText="Delete this loan? Its payment history is deleted too."
      validate={(o) => !Number.isInteger(o.tenure) || o.tenure < 1 || o.tenure > 600 ? "Tenure must be a whole number of months (1-600)." : !(o.dueDay >= 1 && o.dueDay <= 31) ? "Due day must be 1-31." : null}
      onSave={async (o, editId) => {
        const old = editId ? await db.loans.get(editId) : undefined;
        const row: Omit<Loan, "id"> = { name: o.name, provider: o.provider, purpose: o.purpose, principal: o.principal, rate: o.rate, interestType: o.interestType, tenure: o.tenure, startDate: o.startDate,
          emi: o.emi === 0 ? "" : o.emi, fee: num(o.fee), insurance: num(o.insurance), other: num(o.other), totalOverride: o.totalOverride === 0 ? "" : o.totalOverride, dueDay: o.dueDay, status: old?.status ?? "active" };
        if (editId) await repo.updateLoan({ ...row, id: editId }); else await repo.addLoan(row);
      }}
      onDelete={(r) => repo.deleteLoan(r.id)}
      extra={(f, set) => {
        const sug = f.rate !== "" && Number(f.rate) >= 0 ? suggestedEmi(parseMoney(f.principal || "0") ?? 0, Number(f.rate), Number(f.tenure) || 0, f.interestType as any) : null;
        return sug ? <button className="link" onClick={() => set("emi", (sug / 100).toFixed(2))}>Use calculated EMI: {fmt(sug)}</button> : null;
      }}
      onOpen={(r) => setV({ id: r.id })}
      cols={(l: Loan) => { const pays = d.loanPayments.filter((p) => p.loanId === l.id), st = loanStats(l, pays);
        return { title: l.name, amount: l.principal, badge: l.status === "active" ? undefined : label(l.status), progress: pays.length ? st.progressPercent : undefined,
          sub: `${l.provider ? l.provider + " · " : ""}${l.tenure} months · ${pays.length ? `${fmt(st.paidAmount)} / ${fmt(st.totalRepayment)} paid · ${st.progressPercent}%` : "Enter the interest rate / EMI to build the schedule"}` }; }} />
  );
}
