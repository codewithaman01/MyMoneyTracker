// Write operations ported from My Money Tracker's Repository. Each multi-step change runs in one Dexie transaction.
import { todayIso } from "./calc";
import { db, type Change, type Emi, type EmiPayment, type Loan, type LoanPayment, type PayStatus } from "./db";
import { emiSchedule, loanSchedule } from "./loanmath";

const allTables = () => [db.emis, db.emiPayments, db.loans, db.loanPayments, db.changes, db.goals, db.incomeSources, db.recurring, db.friendDebts, db.friendPayments];
const paidFor = (p: { amountDue: number }, status: PayStatus, amount: number) => (status === "paid" ? p.amountDue : status === "partial" ? amount : 0);

// ---------- EMI ----------
export const addEmi = (e: Omit<Emi, "id">) => db.transaction("rw", allTables(), async () => {
  const id = await db.emis.add(e as Emi);
  await db.emiPayments.bulkAdd(emiSchedule({ ...e, id }, await db.changes.toArray()) as EmiPayment[]);
  return id;
});

/** Edit keeps paid history and rebuilds only the not-yet-paid instalments. */
export const updateEmi = (e: Emi) => db.transaction("rw", allTables(), async () => {
  await db.emis.put(e);
  const mine = await db.emiPayments.where("emiId").equals(e.id!).toArray();
  await db.emiPayments.bulkDelete(mine.filter((p) => p.status === "pending").map((p) => p.id!));
  const have = new Set(mine.filter((p) => p.status !== "pending").map((p) => p.no));
  await db.emiPayments.bulkAdd(emiSchedule(e, await db.changes.toArray()).filter((p) => !have.has(p.no)) as EmiPayment[]);
  await refreshEmiStatus(e.id!);
});

export const setEmiPayment = (p: EmiPayment, status: PayStatus, amount: number) => db.transaction("rw", allTables(), async () => {
  const paid = paidFor(p, status, amount);
  await db.emiPayments.put({ ...p, status, amountPaid: paid, paidDate: paid > 0 ? todayIso() : "" });
  await refreshEmiStatus(p.emiId);
});

export async function refreshEmiStatus(emiId: number) {
  const e = await db.emis.get(emiId);
  if (!e || e.status === "paused" || e.status === "cancelled") return;
  const pays = (await db.emiPayments.where("emiId").equals(emiId).toArray()).filter((p) => p.status !== "skipped");
  const done = pays.length > 0 && pays.every((p) => p.status === "paid");
  const target = done ? "completed" : "active";
  if (e.status !== target) await db.emis.update(emiId, { status: target });
}

export const addManualEmiPayment = async (e: Emi) => {
  const mine = await db.emiPayments.where("emiId").equals(e.id!).toArray();
  await db.emiPayments.add({ emiId: e.id!, no: Math.max(0, ...mine.map((p) => p.no)) + 1, dueDate: todayIso(), amountDue: e.monthly, amountPaid: 0, paidDate: "", status: "pending" });
  await refreshEmiStatus(e.id!);
};
export const deleteEmi = (id: number) => db.transaction("rw", allTables(), async () => {
  await db.emiPayments.where("emiId").equals(id).delete();
  await db.changes.where("target").equals("emi").filter((c) => c.targetId === id).delete();
  await db.emis.delete(id);
});

// ---------- Loan ----------
export const addLoan = (l: Omit<Loan, "id">) => db.transaction("rw", allTables(), async () => {
  const id = await db.loans.add(l as Loan);
  await db.loanPayments.bulkAdd(loanSchedule({ ...l, id }) as LoanPayment[]);
  return id;
});
export const updateLoan = (l: Loan) => db.transaction("rw", allTables(), async () => {
  await db.loans.put(l);
  const mine = await db.loanPayments.where("loanId").equals(l.id!).toArray();
  await db.loanPayments.bulkDelete(mine.filter((p) => p.status === "pending").map((p) => p.id!));
  const have = new Set(mine.filter((p) => p.status !== "pending").map((p) => p.no));
  await db.loanPayments.bulkAdd(loanSchedule(l).filter((p) => !have.has(p.no)) as LoanPayment[]);
  await refreshLoanStatus(l.id!);
});
export const setLoanPayment = (p: LoanPayment, status: PayStatus, amount: number) => db.transaction("rw", allTables(), async () => {
  const paid = paidFor(p, status, amount);
  await db.loanPayments.put({ ...p, status, amountPaid: paid, paidDate: paid > 0 ? todayIso() : "" });
  await refreshLoanStatus(p.loanId);
});
export async function refreshLoanStatus(loanId: number) {
  const l = await db.loans.get(loanId);
  if (!l || l.status === "paused" || l.status === "cancelled") return;
  const pays = (await db.loanPayments.where("loanId").equals(loanId).toArray()).filter((p) => p.status !== "skipped");
  const target = pays.length > 0 && pays.every((p) => p.status === "paid") ? "completed" : "active";
  if (l.status !== target) await db.loans.update(loanId, { status: target });
}
export const deleteLoan = (id: number) => db.transaction("rw", allTables(), async () => {
  await db.loanPayments.where("loanId").equals(id).delete();
  await db.loans.delete(id);
});

// ---------- Scheduled changes (an EMI change also rebuilds that EMI's pending instalments) ----------
const rebuildEmi = async (c: Pick<Change, "target" | "targetId">) => { if (c.target === "emi") { const e = await db.emis.get(c.targetId); if (e) await updateEmi(e); } };
export const addChange = async (c: Omit<Change, "id">) => { await db.changes.add(c as Change); await rebuildEmi(c); };
export const deleteChange = async (c: Change) => { await db.changes.delete(c.id!); await rebuildEmi(c); };

// ---------- Cascading deletes for plan items ----------
export const deleteIncomeSource = (id: number) => db.transaction("rw", allTables(), async () => {
  await db.changes.where("target").equals("income").filter((c) => c.targetId === id).delete(); await db.incomeSources.delete(id);
});
export const deleteRecurring = (id: number) => db.transaction("rw", allTables(), async () => {
  await db.changes.where("target").equals("recurring").filter((c) => c.targetId === id).delete(); await db.recurring.delete(id);
});
export const deleteFriendDebt = (id: number) => db.transaction("rw", allTables(), async () => {
  await db.friendPayments.where("debtId").equals(id).delete(); await db.friendDebts.delete(id);
});

// ---------- Savings goals ----------
/** delta > 0 adds, delta < 0 withdraws. Returns false when withdrawing more than is saved. */
export async function adjustSavings(goalId: number, delta: number): Promise<boolean> {
  const g = await db.goals.get(goalId);
  if (!g || g.saved + delta < 0) return false;
  await db.goals.update(goalId, { saved: g.saved + delta });
  return true;
}
