import { useLiveQuery } from "dexie-react-hooks";
import { allCategories, loadEngine, setSetting, useSettings, type Freq } from "./db";

/** Live snapshot of every table the plan engine, calendar, reports and reminders need (null until loaded). */
export const useEngine = () => useLiveQuery(loadEngine, [], null);

/** Built-in categories plus the ones the user created from the expense form. */
export function useCategories() {
  const s = useSettings();
  const cats = allCategories(s.customCategories);
  const add = async (name: string) => {
    const n = name.trim();
    if (n && !cats.some((c) => c.toLowerCase() === n.toLowerCase())) await setSetting("customCategories", [...s.customCategories, n]);
  };
  return { cats, add };
}

export const FREQ_LABELS: Record<Freq, string> = { once: "One time", daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly", custom: "Every N days" };
export const STATUS_LABELS = { active: "Active", paused: "Paused", completed: "Completed", cancelled: "Cancelled" } as const;
export const INTEREST_LABELS = { reducing: "Reducing balance", flat: "Flat", unknown: "Unknown / not sure" } as const;
