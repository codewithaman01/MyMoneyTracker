import { describe, expect, it } from "vitest";
import { addMonths, anomalies, budgetStatus, cashflow, emi, forecastNext, goalCompletion, goalMonthlyNeeded, planPayoff, remainingTenure, schedule } from "./calc";

describe("EMI", () => {
  it("matches known values (paise)", () => {
    expect(emi(10_000_000, 12, 12)).toBe(888_488);
    expect(emi(50_000_000, 10, 60)).toBe(1_062_352);
    expect(emi(1_200_000, 0, 12)).toBe(100_000);
  });
  it("rejects bad input", () => {
    expect(() => emi(0, 10, 12)).toThrow();
    expect(() => emi(1000, 101, 12)).toThrow();
    expect(() => emi(1000, 10, 0)).toThrow();
  });
  it("schedule clears the loan and balances", () => {
    const s = schedule(10_000_000, 12, 12);
    expect(s.rows[0]).toMatchObject({ interest: 100_000, principal: 788_488 });
    expect(s.rows.at(-1)!.balance).toBe(0);
    expect(s.rows.reduce((a, r) => a + r.principal, 0)).toBe(10_000_000);
    expect(s.totalPaid).toBe(10_000_000 + s.totalInterest);
  });
  it("remaining tenure", () => {
    expect(remainingTenure(10_000_000, 12, 888_488)).toBe(12);
    expect(remainingTenure(0, 12, 100)).toBe(0);
    expect(() => remainingTenure(10_000_000, 12, 100_000)).toThrow();
  });
});

describe("payoff", () => {
  it("hand-computed single debt", () => {
    const p = planPayoff([{ name: "A", balance: 100_000, rate: 12, min: 10_000 }], 60_000, "avalanche", "2026-01-31");
    expect(p.months).toBe(2);
    expect(p.totalInterest).toBe(1410);
    expect(p.totalPaid).toBe(101_410);
    expect(p.payoffDate).toBe("2026-03-31");
  });
  const two = [{ name: "small", balance: 50_000, rate: 5, min: 2500 }, { name: "big", balance: 200_000, rate: 20, min: 2500 }];
  it("strategy order and conservation", () => {
    const av = planPayoff(two, 50_000, "avalanche", "2026-01-01"), sn = planPayoff(two, 50_000, "snowball", "2026-01-01");
    const m = (p: typeof av, n: string) => p.debts.find((d) => d.name === n)!.payoffMonth;
    expect(m(av, "big")).toBeLessThan(m(av, "small"));
    expect(m(sn, "small")).toBeLessThan(m(sn, "big"));
    expect(av.totalInterest).toBeLessThanOrEqual(sn.totalInterest);
    for (const p of [av, sn]) expect(p.totalPaid).toBe(250_000 + p.totalInterest);
  });
  it("errors", () => {
    expect(() => planPayoff([{ name: "A", balance: 1000, rate: 10, min: 100 }], 50, "avalanche", "2026-01-01")).toThrow();
    expect(() => planPayoff([{ name: "A", balance: 1_000_000, rate: 12, min: 50 }], 50, "avalanche", "2026-01-01")).toThrow();
  });
});

describe("cash flow, budgets, goals, forecast", () => {
  it("never counts expected income as received", () => {
    const inc = [{ date: "2026-05-01", amount: 100_000, status: "received" }, { date: "2026-05-10", amount: 50_000, status: "expected" }];
    const cf = cashflow(inc, [{ date: "2026-05-03", amount: 40_000 }], "2026-05");
    expect(cf).toMatchObject({ received: 100_000, expected: 50_000, spent: 40_000, net: 60_000, savingsRatePct: 60 });
    expect(cashflow([], [], "2026-05").savingsRatePct).toBeNull();
  });
  it("budget thresholds", () => {
    expect(budgetStatus(100_000, 79_000, 80).level).toBe("ok");
    expect(budgetStatus(100_000, 80_000, 80).level).toBe("warn");
    expect(budgetStatus(100_000, 100_000, 80).level).toBe("over");
  });
  it("goal maths", () => {
    expect(goalMonthlyNeeded(120_000, 0, "2027-01-15", "2026-01-15")).toMatchObject({ months: 12, monthly: 10_000 });
    expect(goalMonthlyNeeded(100, 0, "2026-01-01", "2026-02-01").monthly).toBe(100);
    expect(goalCompletion(120_000, 20_000, 10_000, "2026-01-15")).toBe("2026-11-15");
    expect(goalCompletion(100, 0, 0, "2026-01-15")).toBeNull();
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
  it("forecast refuses thin data and fits a line", () => {
    expect(forecastNext([1, 2, 3]).ok).toBe(false);
    const f = forecastNext([100, 200, 300, 400, 500, 600]);
    expect(f.ok && f.value).toBe(700);
  });
  it("anomaly detection", () => {
    const rows = [...Array(9)].map((_, i) => ({ category: "Food", amount: 1000, date: `2026-01-0${i + 1}` }));
    rows.push({ category: "Food", amount: 9000, date: "2026-01-20" });
    expect(anomalies(rows).map((r) => r.amount)).toEqual([9000]);
    expect(anomalies(rows.slice(0, 3))).toEqual([]);
  });
});
