// Calendar events + reminders, derived from the same rows as the dashboard. Nothing is stored twice.
import { amountOn, occurrences } from "./engine";
import type { EngineData } from "./db";

export type EventType = "income" | "rent" | "bill" | "emi" | "loan" | "debt" | "savings";
export interface CalEvent { date: string; type: EventType; title: string; amount: number; page: string; arg?: number }
export const EVENT_COLORS: Record<EventType, string> = { income: "#7ef0c9", emi: "#ff9e7a", loan: "#ff8fb1", rent: "#b388ff", bill: "#6fd3ff", debt: "#ff6fb5", savings: "#ffd479" };
const isOpen = (s: string) => s === "pending" || s === "partial";
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function eventsBetween(from: string, to: string, d: EngineData): CalEvent[] {
  const out: CalEvent[] = [];
  const emiBy = new Map(d.emis.map((e) => [e.id, e])), loanBy = new Map(d.loans.map((l) => [l.id, l]));
  for (const i of d.incomeSources.filter((x) => x.status === "active"))
    for (const date of occurrences(i, from, to)) out.push({ date, type: "income", title: `${i.name} expected`, amount: amountOn(i.amount, "income", i.id, d.changes, date), page: "incomeplans" });
  // Daily items (e.g. travel) would flood the calendar, so they are left out of it.
  for (const r of d.recurring.filter((x) => x.status === "active" && x.frequency !== "daily"))
    for (const date of occurrences(r, from, to)) out.push({ date, type: r.category.toLowerCase() === "rent" ? "rent" : "bill", title: `${r.name} due`, amount: amountOn(r.amount, "recurring", r.id, d.changes, date), page: "recurring" });
  for (const p of d.emiPayments.filter((x) => x.dueDate >= from && x.dueDate <= to && isOpen(x.status)))
    out.push({ date: p.dueDate, type: "emi", title: `EMI: ${emiBy.get(p.emiId)?.name ?? "EMI"}`, amount: p.amountDue - p.amountPaid, page: "emis", arg: p.emiId });
  for (const p of d.loanPayments.filter((x) => x.dueDate >= from && x.dueDate <= to && isOpen(x.status)))
    out.push({ date: p.dueDate, type: "loan", title: `Loan: ${loanBy.get(p.loanId)?.name ?? "Loan"}`, amount: p.amountDue - p.amountPaid, page: "loans", arg: p.loanId });
  for (const x of d.friendDebts) {
    if (!x.dueDate || x.dueDate < from || x.dueDate > to) continue;
    const rem = x.amount - sum(d.friendPayments.filter((p) => p.debtId === x.id).map((p) => p.amount));
    if (rem <= 0) continue;
    out.push({ date: x.dueDate, type: "debt", title: x.direction === "I owe" ? `Pay ${x.person}` : `Receive from ${x.person}`, amount: rem, page: "friends" });
  }
  for (const g of d.goals) if (g.deadline >= from && g.deadline <= to && g.saved < g.target)
    out.push({ date: g.deadline, type: "savings", title: `Goal deadline: ${g.name}`, amount: g.target - g.saved, page: "goals" });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
