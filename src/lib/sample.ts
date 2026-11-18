import { shiftMonth, thisMonth, toPaise, todayIso } from "./calc";
import { addDays } from "./dates";
import { db } from "./db";
import * as repo from "./repo";

/** Loads sample data. `plan` adds the plan-style sample (income plans, rent, EMIs, loan, friend debts); when both are loaded the
 *  FinGlass sample leaves out its own Rent and EMI expense rows so the plan does not count them twice. */
export async function loadSample(opts: { finglass?: boolean; plan?: boolean } = {}) {
  const { finglass = true, plan = false } = opts;
  if (finglass) await loadFinglassSample(plan);
  if (plan) await loadPlanSample();
}

/** SAMPLE ONLY (from My Money Tracker). Ordinary editable rows; nothing here is referenced by the calculation code.
 *  The loan's rate / EMI / charges are intentionally left empty: the user enters the real values. */
export async function loadPlanSample(today = todayIso()) {
  const start = `${today.slice(0, 7)}-01`, P = toPaise, plusMonths = (n: number) => `${shiftMonth(today.slice(0, 7), n)}-01`;
  const common = { customDays: 0, endDate: "", status: "active" as const, note: "" };
  await db.incomeSources.bulkAdd([
    { name: "Salary", amount: P(29800), source: "Employer", frequency: "monthly", startDate: start, dueDay: 1, ...common },
    { name: "Extra income", amount: P(15000), source: "", frequency: "monthly", startDate: start, dueDay: 1, ...common, endDate: addDays(plusMonths(3), -1) }]);
  const rentId = await db.recurring.add({ name: "Rent", amount: P(16200), frequency: "monthly", startDate: start, dueDay: 1, category: "Rent", method: "Bank", weekdays: "all", ...common });
  await db.changes.add({ target: "recurring", targetId: rentId, from: plusMonths(4), amount: P(8500) });
  await db.recurring.add({ name: "Travel", amount: P(100), frequency: "daily", startDate: start, dueDay: 1, category: "Travel", method: "Cash", weekdays: "monsat", ...common });
  const emi = (name: string, purpose: string, monthly: number, months: number) => ({ name, purpose, lender: "", description: "", original: 0, down: 0, remaining: 0, monthly: P(monthly), rate: "" as const, interestType: "unknown" as const, fee: 0, other: 0, totalMonths: months, startDate: start, dueDay: 5, status: "active" as const });
  await repo.addEmi(emi("Phone EMI", "Mobile Phone", 2500, 10));
  await repo.addEmi(emi("Other EMI", "Other", 2000, 12));
  const m1 = addDays(start, 24), m2 = addDays(plusMonths(1), 24);
  const owe = (person: string, rupees: number, dueDate: string) => ({ person, direction: "I owe" as const, amount: P(rupees), purpose: "", date: start, dueDate, note: "" });
  await db.friendDebts.bulkAdd([owe("Abdul", 1100, m1), owe("Abhi", 200, m1), owe("Rahul Bhaiya", 2000, m1), owe("Hussain", 1000, m2), owe("Rihan", 1000, m2)]);
  await repo.addLoan({ name: "TVS Loan", provider: "TVS", purpose: "Personal", principal: P(25000), rate: "", interestType: "unknown", tenure: 12, startDate: start, emi: "", fee: 0, insurance: 0, other: 0, totalOverride: "", dueDay: 5, status: "active" });
}

async function loadFinglassSample(skipPlanOverlap = false) {
  const now = thisMonth(), P = toPaise;
  const inc: any[] = [], exp: any[] = [];
  for (let i = 7; i >= 0; i--) {
    const m = shiftMonth(now, -i);
    inc.push({ date: `${m}-01`, source: "Salary", amount: P(85000), status: "received", recurring: "none", note: "" });
    if (i % 3 === 0) inc.push({ date: `${m}-12`, source: "Freelance", amount: P(12000 + i * 500), status: i === 0 ? "expected" : "received", recurring: "none", note: "" });
    if (!skipPlanOverlap) exp.push({ date: `${m}-02`, category: "Rent", method: "Bank transfer", amount: P(22000), recurring: "none", note: "" });
    if (!skipPlanOverlap) exp.push({ date: `${m}-05`, category: "EMIs", method: "Bank transfer", amount: P(9500), recurring: "none", note: "" });
    exp.push({ date: `${m}-09`, category: "Utilities", method: "UPI", amount: P(2400 + (i % 3) * 150), recurring: "none", note: "" });
    for (let k = 0; k < 6; k++) exp.push({ date: `${m}-${String(3 + k * 4).padStart(2, "0")}`, category: "Food", method: "UPI", amount: P(1200 + ((i * 7 + k * 13) % 5) * 180), recurring: "none", note: "" });
    exp.push({ date: `${m}-18`, category: i % 2 ? "Shopping" : "Travel", method: "Card", amount: P(3000 + i * 400), recurring: "none", note: "" });
  }
  exp.push({ date: `${now}-15`, category: "Shopping", method: "Card", amount: P(24000), recurring: "none", note: "Headphones" });
  await db.transaction("rw", [db.income, db.expenses, db.budgets, db.debts, db.goals, db.investments], async () => {
    await db.income.bulkAdd(inc); await db.expenses.bulkAdd(exp);
    await db.budgets.bulkAdd([{ month: now, category: "ALL", limit: P(60000) }, { month: now, category: "Food", limit: P(9000) }, { month: now, category: "Shopping", limit: P(8000) }]);
    await db.debts.bulkAdd([
      { lender: "Bike loan", principal: P(120000), outstanding: P(78000), rate: 11, emi: P(9500), dueDay: 5, note: "" },
      { lender: "Credit card", principal: P(40000), outstanding: P(32000), rate: 36, emi: P(4000), dueDay: 20, note: "" }]);
    await db.goals.bulkAdd([
      { name: "Emergency fund", target: P(250000), saved: P(90000), deadline: shiftMonth(now, 14) + "-01", monthly: P(10000) },
      { name: "Laptop", target: P(90000), saved: P(30000), deadline: shiftMonth(now, 8) + "-01", monthly: P(7000) }]);
    await db.investments.bulkAdd([
      { type: "Mutual fund", name: "Index fund SIP", quantity: 120.5, invested: P(60000), current: P(68250), date: `${shiftMonth(now, -6)}-01` },
      { type: "Fixed deposit", name: "Bank FD", quantity: 1, invested: P(50000), current: P(52100), date: `${shiftMonth(now, -5)}-01` }]);
  });
}
