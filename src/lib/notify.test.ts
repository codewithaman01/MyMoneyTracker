import { describe, expect, it } from "vitest";
import type { EngineData } from "./db";
import { budgetWarnings, planEventReminders } from "./notify";

const E = (over: Partial<EngineData> = {}): EngineData => ({ incomeSources: [], recurring: [], changes: [], expenses: [], emis: [], emiPayments: [], loans: [], loanPayments: [], friendDebts: [], friendPayments: [], goals: [], budgets: [], ...over });
const fmt = (p: number) => `₹${p / 100}`;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

describe("reminder planner", () => {
  const data = E({
    emis: [{ id: 1, name: "Phone EMI" } as any],
    emiPayments: [
      { id: 1, emiId: 1, no: 1, dueDate: inDays(10), amountDue: 250000, amountPaid: 0, paidDate: "", status: "pending" },
      { id: 2, emiId: 1, no: 2, dueDate: inDays(12), amountDue: 250000, amountPaid: 250000, paidDate: "", status: "paid" }, // paid: no reminder
      { id: 3, emiId: 1, no: 3, dueDate: inDays(90), amountDue: 250000, amountPaid: 0, paidDate: "", status: "pending" }, // beyond 60 days
    ],
  });
  it("one reminder, N days before at 9:00, only for unpaid items inside the horizon", () => {
    const [n, ...rest] = planEventReminders(data, 1, false, fmt);
    expect(rest).toHaveLength(0);
    expect(n.title).toBe("EMI: Phone EMI");
    expect(n.at.getHours()).toBe(9);
    expect(iso(n.at)).toBe(inDays(9));
    expect(n.body).toBe("due tomorrow");
  });
  it("amounts are hidden unless the user opts in", () => {
    expect(planEventReminders(data, 3, false, fmt)[0].body).toBe("due in 3 days");
    expect(planEventReminders(data, 3, true, fmt)[0].body).toBe("due in 3 days · ₹2500");
  });
  it("skips reminders whose time has already passed", () => {
    const tomorrow = E({ emis: data.emis, emiPayments: [{ ...data.emiPayments[0], dueDate: inDays(1) }] });
    expect(planEventReminders(tomorrow, 3, false, fmt)).toHaveLength(0);
  });
});

describe("budget warnings", () => {
  it("flags categories at 75 / 90 / 100 % of this month's budget", () => {
    const m = inDays(0).slice(0, 7);
    const exp = (id: number, category: string, amount: number) => ({ id, date: `${m}-01`, category, method: "Cash", amount, recurring: "none", note: "" });
    const w = budgetWarnings(E({
      budgets: [{ month: m, category: "Food", limit: 10000 }, { month: m, category: "Travel", limit: 10000 }, { month: m, category: "Rent", limit: 10000 }, { month: m, category: "Other", limit: 10000 }],
      expenses: [exp(1, "Food", 7500), exp(2, "Travel", 9000), exp(3, "Rent", 12000), exp(4, "Other", 7400)],
    }));
    expect(w.map((x) => [x.category, x.level])).toEqual([["Food", 75], ["Travel", 90], ["Rent", 100]]);
  });
});
