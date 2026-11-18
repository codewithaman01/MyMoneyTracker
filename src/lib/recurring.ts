import { addMonths, todayIso } from "./calc";
import { db } from "./db";

/** Creates missing monthly copies of recurring entries up to today. Generated income is "expected"
 *  (never "received") until the user confirms it; generated rows are tagged "(auto)". */
export async function applyRecurring() {
  const today = todayIso();
  for (const [table, isIncome] of [[db.income, true], [db.expenses, false]] as const) {
    const t = table as any;
    const all: any[] = await t.toArray();
    for (const p of all.filter((r) => r.recurring === "monthly" && !r.parentId)) {
      const have = new Set(all.filter((r) => r.parentId === p.id).map((r) => r.date.slice(0, 7)));
      have.add(p.date.slice(0, 7));
      for (let i = 1; i <= 120; i++) {
        const date = addMonths(p.date, i);
        if (date > today) break;
        if (have.has(date.slice(0, 7))) continue;
        const { id, ...rest } = p;
        await t.add({ ...rest, date, recurring: "none", parentId: id, ...(isIncome ? { status: "expected" } : {}), note: `${p.note ? p.note + " " : ""}(auto)` });
      }
    }
  }
}
