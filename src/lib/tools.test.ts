import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { askGemini } from "./gemini";
import { db } from "./db";
import { runTool } from "./tools";

const M = new Date().toISOString().slice(0, 7);
beforeEach(async () => {
  for (const t of [db.income, db.expenses, db.debts, db.goals]) await (t as any).clear();
  await db.income.bulkAdd([
    { date: `${M}-01`, source: "Salary", amount: 5_000_000, status: "received", recurring: "none", note: "" },
    { date: `${M}-02`, source: "Freelance", amount: 2_000_000, status: "expected", recurring: "none", note: "" }]);
  await db.expenses.bulkAdd([
    { date: `${M}-03`, category: "Food", method: "UPI", amount: 300_000, recurring: "none", note: "" },
    { date: `${M}-04`, category: "Rent", method: "UPI", amount: 1_500_000, recurring: "none", note: "" }]);
  await db.debts.add({ lender: "Loan", principal: 10_000_000, outstanding: 10_000_000, rate: 12, emi: 888_488, dueDay: 5, note: "" });
});

describe("assistant tools", () => {
  it("spend and savings come from stored data; expected income excluded", async () => {
    expect((await runTool("get_spend", { category: "food" })).total_spent).toBe(3000);
    const s = await runTool("savings_capacity", {});
    expect(s).toMatchObject({ received_income: 50000, expected_income_not_counted: 20000, expenses: 18000, net_savings: 32000 });
    const t = await runTool("top_categories", {});
    expect(t.categories[0]).toMatchObject({ category: "Rent", share_pct: 83.3 });
  });
  it("debt-free estimate carries assumptions", async () => {
    const r = await runTool("debt_free_date", { method: "snowball" });
    expect(r).toMatchObject({ kind: "estimate", months: 12 });
    expect(r.assumptions.length).toBeGreaterThan(3);
  });
  it("can_afford uses net cash flow only", async () => {
    expect((await runTool("can_afford", { amount: 30000 })).fits_this_months_net_cash_flow).toBe(true);
    expect((await runTool("can_afford", { amount: 40000 })).fits_this_months_net_cash_flow).toBe(false);
    await expect(runTool("can_afford", { amount: -5 })).rejects.toThrow();
  });
  it("rejects unknown tools", async () => {
    await expect(runTool("drop_database", {})).rejects.toThrow("Unknown tool");
  });
});

describe("gemini loop", () => {
  it("runs the requested tool locally, sends key in header, returns final text", async () => {
    const replies = [
      { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "get_spend", args: { category: "Food" } } }] } }] },
      { candidates: [{ content: { role: "model", parts: [{ text: "You spent 3000 on food." }] } }] }];
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => replies.shift() }) as any);
    vi.stubGlobal("fetch", fetchMock);
    const out = await askGemini("KEY123", "gemini-2.5-flash", [], "food spend?", runTool);
    expect(out).toBe("You spent 3000 on food.");
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).not.toContain("KEY123");
    expect(init.headers["x-goog-api-key"]).toBe("KEY123");
    const second = JSON.parse((fetchMock.mock.calls[1] as any)[1].body);
    expect(second.contents.at(-1).parts[0].functionResponse.response.result.total_spent).toBe(3000);
    vi.unstubAllGlobals();
  });
  it("surfaces API errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, text: async () => "denied" }) as any));
    await expect(askGemini("k", "m", [], "hi", runTool)).rejects.toThrow("403");
    vi.unstubAllGlobals();
  });
  it("plan and due-date tools read the new tables", async () => {
    await db.incomeSources.clear(); await db.recurring.clear();
    await db.incomeSources.add({ name: "Salary", amount: 4_000_000, source: "", frequency: "monthly", customDays: 0, startDate: `${M}-01`, endDate: "", dueDay: 1, status: "active", note: "" });
    const p = await runTool("monthly_plan", { months: 2 });
    expect(p.months).toHaveLength(2);
    expect(p.months[0]).toMatchObject({ income: 40000, expenses: 18000, remaining: 22000 });
    expect(p.assumptions.length).toBeGreaterThan(1);
    const u = await runTool("upcoming_dues", { days: 400 });
    expect(u.events.some((e: any) => e.type === "income")).toBe(true);
    await db.incomeSources.clear();
  });
});
