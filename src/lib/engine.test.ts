import { describe, expect, it } from "vitest";
import type { Change, Emi, EmiPayment, FriendDebt, FriendPayment, IncomeSource, Loan, Recurring } from "./db";
import { amountOn, budgetSpent, forecast, health, occurrences, owedAtEnd, summarize, type EngineInputs } from "./engine";
import { dueDateFor, emiSchedule, emiStats, loanSchedule, loanStats, monthsBetween, schedule, suggestedEmi } from "./loanmath";
import { parseMoney } from "./calc";

const P = (s: string) => parseMoney(s)!;
const D = "2026-10-01";
const inc = (amount: number, extra: Partial<IncomeSource> = {}): IncomeSource => ({ id: 1, name: "Salary", amount, source: "", frequency: "monthly", customDays: 0, startDate: D, endDate: "", dueDay: 1, status: "active", note: "", ...extra });
const rec = (extra: Partial<Recurring> = {}): Recurring => ({ id: 1, name: "Rent", amount: P("10000"), frequency: "monthly", customDays: 0, startDate: D, endDate: "", dueDay: 1, category: "Rent", method: "Bank", weekdays: "all", status: "active", note: "", ...extra });
const empty: EngineInputs = { incomeSources: [], recurring: [], changes: [], expenses: [], emiPayments: [], loanPayments: [], friendDebts: [], friendPayments: [] };
const pay = (id: number, emiId: number, amt: string): EmiPayment => ({ id, emiId, no: 1, dueDate: D, amountDue: P(amt), amountPaid: 0, paidDate: "", status: "pending" });
const exp = (id: number, amt: string, category: string) => ({ id, date: D, category, method: "Cash", amount: P(amt), recurring: "none", note: "" });

describe("monthly engine (spec examples from My Money Tracker)", () => {
  const inputs = (salary: number): EngineInputs => ({ ...empty, incomeSources: [inc(salary)], recurring: [rec()],
    expenses: [exp(1, "5000", "Food"), exp(2, "2000", "Travel")], emiPayments: [pay(1, 1, "3000"), pay(2, 2, "2000")] });

  it("remaining updates when salary changes", () => {
    const a = summarize("2026-10", inputs(P("40000")), "2026-10-06");
    expect(a.totalExpenses + a.emi).toBe(P("22000"));
    expect(a.remaining).toBe(P("18000"));
    expect(summarize("2026-10", inputs(P("45000")), "2026-10-06").remaining).toBe(P("23000"));
  });
  it("rent change applies from February", () => {
    const ch: Change = { id: 1, target: "recurring", targetId: 1, from: "2027-02-01", amount: P("8500") };
    const inp = { ...empty, recurring: [rec({ amount: P("16200") })], changes: [ch] };
    expect(summarize("2027-01", inp, D).rent).toBe(P("16200"));
    expect(summarize("2027-02", inp, D).rent).toBe(P("8500"));
  });
  it("income stops after its end date", () => {
    const inp = { ...empty, incomeSources: [inc(P("15000"), { name: "Teaching", endDate: "2026-12-31" })] };
    expect(summarize("2026-12", inp, D).totalIncome).toBe(P("15000"));
    expect(summarize("2027-01", inp, D).totalIncome).toBe(0);
  });
  it("paused items are ignored", () => {
    expect(summarize("2026-10", { ...empty, incomeSources: [inc(P("100"), { status: "paused" })] }, D).totalIncome).toBe(0);
  });
  it("travel Mon-Sat skips Sundays", () => {
    const travel = rec({ name: "Travel", amount: 10000, frequency: "daily", category: "Travel", weekdays: "monsat" });
    // Oct 2026 has 31 days and 4 Sundays (4, 11, 18, 25) -> 27 travel days
    expect(summarize("2026-10", { ...empty, recurring: [travel] }, D).recurringExpenses).toBe(27 * 10000);
  });
  it("EMI month uses paid amount once paid, due amount while pending, nothing when skipped", () => {
    const p = [{ ...pay(1, 1, "1000"), status: "paid" as const, amountPaid: P("1000") }, pay(2, 1, "500"), { ...pay(3, 1, "700"), status: "skipped" as const }];
    expect(summarize("2026-10", { ...empty, emiPayments: p }, D).emi).toBe(P("1500"));
  });
  it("overdue 'I owe' debts roll into the current month; owed-to-me debts never count as outflow", () => {
    const d = (id: number, direction: FriendDebt["direction"], due: string): FriendDebt => ({ id, person: "X", direction, amount: P("1000"), purpose: "", date: "2026-08-01", dueDate: due, note: "" });
    const pays: FriendPayment[] = [{ id: 1, debtId: 1, amount: P("400"), date: "2026-09-10", note: "" }];
    const inp = { ...empty, friendDebts: [d(1, "I owe", "2026-09-24"), d(2, "Owed to me", "2026-10-24")], friendPayments: pays };
    expect(summarize("2026-09", inp, "2026-10-06").debtPayments).toBe(P("400")); // past month: only what was actually paid
    expect(summarize("2026-10", inp, "2026-10-06").debtPayments).toBe(P("600")); // overdue remainder planned into the current month
    expect(owedAtEnd("2026-09", inp.friendDebts, pays)).toBe(P("600"));
  });
  it("forecast gives one summary per month and budgets use recurring + one-off spend", () => {
    const inp = { ...empty, incomeSources: [inc(P("1000"))], recurring: [rec({ amount: P("100") })], expenses: [exp(1, "50", "Rent")] };
    const f = forecast("2026-10", 3, inp, D);
    expect(f.map((x) => x.month)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(budgetSpent(f[0], "rent")).toBe(P("150"));
    expect(budgetSpent(f[0], "ALL")).toBe(P("150"));
    expect(budgetSpent(f[1], "Rent")).toBe(P("100"));
  });
  it("financial health warnings", () => {
    const s = summarize("2026-10", { ...empty, incomeSources: [inc(P("10000"))], emiPayments: [pay(1, 1, "4500")] }, D);
    expect(health(s, 0).warnings).toContain("High EMI burden");
    const over = summarize("2026-10", { ...empty, incomeSources: [inc(P("1000"))], expenses: [exp(1, "2000", "Food")] }, D);
    expect(health(over, 0).warnings).toContain("Your expenses are higher than your income");
    expect(health(summarize("2026-10", { ...empty, incomeSources: [inc(P("1000"))] }, D), 0).warnings).toContain("Good savings progress");
  });
});

describe("recurrence", () => {
  const base = { customDays: 0, startDate: "2026-01-31", endDate: "", dueDay: 31, weekdays: "all" as const };
  it("monthly on the 31st clamps to short months", () => {
    expect(occurrences({ ...base, frequency: "monthly" }, "2026-01-01", "2026-03-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
  it("weekly / custom intervals step from the start date", () => {
    expect(occurrences({ ...base, startDate: "2026-10-01", frequency: "weekly" }, "2026-10-10", "2026-10-31")).toEqual(["2026-10-15", "2026-10-22", "2026-10-29"]);
    expect(occurrences({ ...base, startDate: "2026-10-01", customDays: 10, frequency: "custom" }, "2026-10-01", "2026-10-31")).toEqual(["2026-10-01", "2026-10-11", "2026-10-21", "2026-10-31"]);
    expect(occurrences({ ...base, customDays: 0, frequency: "custom" }, "2026-01-01", "2026-12-31")).toEqual([]);
  });
  it("yearly and once", () => {
    expect(occurrences({ ...base, startDate: "2024-02-29", frequency: "yearly" }, "2025-01-01", "2026-12-31")).toEqual(["2025-02-28", "2026-02-28"]);
    expect(occurrences({ ...base, startDate: "2026-05-05", frequency: "once" }, "2026-05-01", "2026-05-31")).toEqual(["2026-05-05"]);
    expect(occurrences({ ...base, startDate: "2026-05-05", frequency: "once" }, "2026-06-01", "2026-06-30")).toEqual([]);
  });
  it("latest effective change wins; a change never applies before its date", () => {
    const ch: Change[] = [{ target: "emi", targetId: 7, from: "2026-07-01", amount: 200 }, { target: "emi", targetId: 7, from: "2026-04-01", amount: 300 }, { target: "income", targetId: 7, from: "2026-01-01", amount: 1 }];
    expect(amountOn(500, "emi", 7, ch, "2026-03-31")).toBe(500);
    expect(amountOn(500, "emi", 7, ch, "2026-05-01")).toBe(300);
    expect(amountOn(500, "emi", 7, ch, "2026-09-01")).toBe(200);
  });
});

describe("loan & EMI maths", () => {
  it("reducing schedule clears principal to exactly zero", () => {
    const emi = suggestedEmi(P("25000"), 18, 12, "reducing")!;
    const rows = schedule(P("25000"), 18, "reducing", 12, emi, "2026-11-01", 5);
    expect(rows.reduce((s, r) => s + r.principalPart, 0)).toBe(P("25000"));
    expect(rows[0].dueDate).toBe("2026-11-05");
  });
  it("suggested EMI needs rate and type; flat interest is simple", () => {
    expect(suggestedEmi(P("25000"), "", 12, "reducing")).toBeNull();
    expect(suggestedEmi(P("25000"), 12, 12, "unknown")).toBeNull();
    expect(suggestedEmi(P("12000"), 10, 12, "flat")).toBe(P("1100")); // 12000 + 10% for 1 year = 13200 / 12
    expect(suggestedEmi(P("12000"), 0, 12, "reducing")).toBe(P("1000"));
  });
  it("monthsBetween and due dates", () => {
    expect(monthsBetween("2026-10-15", "2027-03-02")).toBe(6);
    expect(monthsBetween("2026-10-15", "2026-10-01")).toBeNull();
    expect(dueDateFor("2026-01-31", 1, 31)).toBe("2026-02-28");
  });
  it("EMI schedule honours scheduled changes (months 1-6 ₹3000, then ₹2000)", () => {
    const e: Emi = { id: 4, name: "Phone", purpose: "", lender: "", description: "", original: 0, down: 0, remaining: 0, monthly: P("3000"), rate: "", interestType: "unknown", fee: 0, other: 0, totalMonths: 12, startDate: "2026-10-01", dueDay: 5, status: "active" };
    const rows = emiSchedule(e, [{ target: "emi", targetId: 4, from: "2027-04-01", amount: P("2000") }]);
    expect(rows).toHaveLength(12);
    expect(rows.slice(0, 6).every((r) => r.amountDue === P("3000"))).toBe(true);
    expect(rows.slice(6).every((r) => r.amountDue === P("2000"))).toBe(true);
    const pays = rows.map((r, i) => ({ ...r, id: i + 1, ...(i < 2 ? { status: "paid" as const, amountPaid: r.amountDue } : {}) }));
    const st = emiStats(e, pays);
    expect(st).toMatchObject({ totalPayments: 12, paidCount: 2, remainingMonths: 10, isComplete: false, nextDue: "2026-12-05", completionDate: "2027-09-05" });
    expect(st.paidAmount).toBe(P("6000"));
  });
  it("loan without rate has no schedule until the user enters it; with a rate it builds and reports stats", () => {
    const l: Loan = { id: 2, name: "TVS", provider: "", purpose: "", principal: P("25000"), rate: "", interestType: "unknown", tenure: 12, startDate: "2026-10-01", emi: "", fee: 0, insurance: 0, other: 0, totalOverride: "", dueDay: 5, status: "active" };
    expect(loanSchedule(l)).toEqual([]);
    const rows = loanSchedule({ ...l, rate: 18, interestType: "reducing" });
    expect(rows).toHaveLength(12);
    const pays = rows.map((r, i) => ({ ...r, id: i + 1, ...(i < 3 ? { status: "paid" as const, amountPaid: r.amountDue } : {}) }));
    const st = loanStats({ ...l, rate: 18, interestType: "reducing" }, pays);
    expect(st.remainingEmis).toBe(9);
    expect(st.principalPaid + st.remainingPrincipal).toBe(P("25000"));
    expect(st.progressPercent).toBeGreaterThan(0);
    // a typed EMI overrides the calculated one
    expect(loanSchedule({ ...l, emi: P("2500") })[0].amountDue).toBe(P("2500"));
  });
});
