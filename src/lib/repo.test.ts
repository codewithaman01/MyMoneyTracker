import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { validateBackup } from "../Settings";
import { DATA_TABLES, db, loadEngine, type Emi } from "./db";
import { forecast, summarize } from "./engine";
import * as repo from "./repo";
import { loadPlanSample, loadSample } from "./sample";

const P = (n: number) => n * 100;
const emi = (over: Partial<Emi> = {}): Omit<Emi, "id"> => ({ name: "Phone", purpose: "Mobile Phone", lender: "", description: "", original: 0, down: 0, remaining: 0, monthly: P(3000), rate: "", interestType: "unknown", fee: 0, other: 0, totalMonths: 4, startDate: "2026-10-01", dueDay: 5, status: "active", ...over });
beforeEach(async () => { for (const t of DATA_TABLES) await (db as any)[t].clear(); });

describe("EMI lifecycle", () => {
  it("builds a schedule, tracks paid/partial/skipped, and completes automatically", async () => {
    const id = await repo.addEmi(emi());
    let pays = await db.emiPayments.where("emiId").equals(id).sortBy("no");
    expect(pays.map((p) => p.dueDate)).toEqual(["2026-10-05", "2026-11-05", "2026-12-05", "2027-01-05"]);
    await repo.setEmiPayment(pays[0], "paid", 0);
    await repo.setEmiPayment(pays[1], "partial", P(1000));
    expect((await db.emiPayments.get(pays[1].id!))!).toMatchObject({ status: "partial", amountPaid: P(1000) });
    await repo.setEmiPayment(pays[1], "paid", 0);
    await repo.setEmiPayment(pays[2], "skipped", 0);
    expect((await db.emis.get(id))!.status).toBe("active");
    await repo.setEmiPayment(pays[3], "paid", 0);
    expect((await db.emis.get(id))!.status).toBe("completed");
    await repo.setEmiPayment(pays[3], "pending", 0); // undo -> active again
    expect((await db.emis.get(id))!.status).toBe("active");
  });
  it("editing keeps paid history and rebuilds only pending instalments", async () => {
    const id = await repo.addEmi(emi());
    const first = (await db.emiPayments.where("emiId").equals(id).sortBy("no"))[0];
    await repo.setEmiPayment(first, "paid", 0);
    await repo.updateEmi({ ...emi({ monthly: P(2000), totalMonths: 6 }), id });
    const pays = await db.emiPayments.where("emiId").equals(id).sortBy("no");
    expect(pays).toHaveLength(6);
    expect(pays[0]).toMatchObject({ status: "paid", amountDue: P(3000) });
    expect(pays.slice(1).every((p) => p.amountDue === P(2000) && p.status === "pending")).toBe(true);
  });
  it("a scheduled EMI change rewrites pending instalments; deleting it restores them", async () => {
    const id = await repo.addEmi(emi({ totalMonths: 6 }));
    await repo.addChange({ target: "emi", targetId: id, from: "2027-01-01", amount: P(2000) });
    let pays = await db.emiPayments.where("emiId").equals(id).sortBy("no");
    expect(pays.map((p) => p.amountDue / 100)).toEqual([3000, 3000, 3000, 2000, 2000, 2000]);
    await repo.deleteChange((await db.changes.toArray())[0]);
    pays = await db.emiPayments.where("emiId").equals(id).sortBy("no");
    expect(pays.every((p) => p.amountDue === P(3000))).toBe(true);
  });
  it("deleting an EMI removes its payments and changes only", async () => {
    const a = await repo.addEmi(emi()), b = await repo.addEmi(emi({ name: "Other" }));
    await repo.addChange({ target: "emi", targetId: a, from: "2027-01-01", amount: 1 });
    await repo.deleteEmi(a);
    expect(await db.emiPayments.where("emiId").equals(a).count()).toBe(0);
    expect(await db.changes.count()).toBe(0);
    expect(await db.emiPayments.where("emiId").equals(b).count()).toBe(4);
  });
});

describe("loans, friend debts, savings", () => {
  it("a loan without a rate has no schedule; adding rate + type builds it and keeps paid rows", async () => {
    const base = { name: "TVS", provider: "", purpose: "", principal: P(25000), rate: "" as const, interestType: "unknown" as const, tenure: 12, startDate: "2026-10-01", emi: "" as const, fee: 0, insurance: 0, other: 0, totalOverride: "" as const, dueDay: 5, status: "active" as const };
    const id = await repo.addLoan(base);
    expect(await db.loanPayments.count()).toBe(0);
    await repo.updateLoan({ ...base, id, rate: 18, interestType: "reducing" });
    const pays = await db.loanPayments.where("loanId").equals(id).sortBy("no");
    expect(pays).toHaveLength(12);
    await repo.setLoanPayment(pays[0], "paid", 0);
    await repo.updateLoan({ ...base, id, rate: 12, interestType: "reducing" });
    const after = await db.loanPayments.where("loanId").equals(id).sortBy("no");
    expect(after[0]).toMatchObject({ status: "paid", amountPaid: pays[0].amountDue });
    expect(after).toHaveLength(12);
    await repo.deleteLoan(id);
    expect(await db.loanPayments.count()).toBe(0);
  });
  it("savings: withdraw cannot exceed what is saved", async () => {
    const id = await db.goals.add({ name: "Trip", target: P(1000), saved: P(100), deadline: "2027-01-01", monthly: 0 });
    expect(await repo.adjustSavings(id, P(50))).toBe(true);
    expect(await repo.adjustSavings(id, -P(200))).toBe(false);
    expect((await db.goals.get(id))!.saved).toBe(P(150));
    expect(await repo.adjustSavings(id, -P(150))).toBe(true);
  });
  it("deleting a friend debt deletes its payments", async () => {
    const id = await db.friendDebts.add({ person: "A", direction: "I owe", amount: 100, purpose: "", date: "2026-10-01", dueDate: "", note: "" });
    await db.friendPayments.add({ debtId: id, amount: 10, date: "2026-10-02", note: "" });
    await repo.deleteFriendDebt(id);
    expect(await db.friendPayments.count()).toBe(0);
  });
});

describe("sample data & backup validation", () => {
  it("plan sample reproduces the original app's numbers and loads alongside the FinGlass sample without double counting", async () => {
    await loadSample({ finglass: true, plan: true });
    const d = await loadEngine(), m = new Date().toISOString().slice(0, 7);
    const s = summarize(m, d, `${m}-10`);
    expect(s.incomeBySource).toMatchObject({ Salary: P(29800), "Extra income": P(15000) });
    expect(s.rent).toBe(P(16200)); // only the plan's rent: the FinGlass sample's own Rent rows are skipped
    expect(s.emi).toBe(P(4500));
    expect(d.friendDebts).toHaveLength(5);
    expect(d.loans[0].rate).toBe("");
    expect(await db.loanPayments.count()).toBe(0);
    const f = forecast(m, 6, d, `${m}-10`); // rent drops to ₹8,500 from the 1st of the month 4 months ahead
    expect(f[3].rent).toBe(P(16200));
    expect(f[4].rent).toBe(P(8500));
  });
  it("plan sample alone can be loaded twice without errors", async () => {
    await loadPlanSample(); await loadPlanSample();
    expect(await db.emis.count()).toBe(4);
  });
  it("backup validation rejects bad files before anything is erased", () => {
    expect(validateBackup({ app: "finglass", version: 1, tables: {} })).toBeNull();
    expect(validateBackup({ app: "finglass", version: 2, tables: { expenses: [{ amount: 5 }] } })).toBeNull();
    expect(validateBackup({ app: "other", version: 2, tables: {} })).toMatch(/Not a FinGlass/);
    expect(validateBackup({ app: "finglass", version: 3, tables: {} })).toMatch(/Not a FinGlass/);
    expect(validateBackup({ app: "finglass", version: 2, tables: { expenses: "x" } })).toMatch(/invalid/);
    expect(validateBackup({ app: "finglass", version: 2, tables: { expenses: [{ amount: -5 }] } })).toMatch(/negative/);
    expect(validateBackup(null)).toMatch(/Not a FinGlass/);
  });
});
