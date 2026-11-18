import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { todayIso } from "./calc";
import { addDays } from "./dates";
import { db, type Debt, type EngineData, type Settings } from "./db";
import { budgetSpent, summarize } from "./engine";
import { eventsBetween } from "./events";

/** One monthly reminder per debt at 09:00 the day before its due day (days capped at 28). */
export async function scheduleEmiReminders(debts: Debt[], enable: boolean, fmt: (p: number) => string) {
  if (!Capacitor.isNativePlatform()) return { ok: false, msg: "Reminders work in the installed Android app." };
  const pending = await LocalNotifications.getPending();
  const mine = pending.notifications.filter((n) => n.id >= 1000 && n.id < 2000);
  if (mine.length) await LocalNotifications.cancel({ notifications: mine.map((n) => ({ id: n.id })) });
  if (!enable) return { ok: true, msg: "EMI reminders turned off." };
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") return { ok: false, msg: "Notification permission was denied." };
  const list = debts.filter((d) => d.id && d.id < 1000 && d.outstanding > 0);
  if (list.length) await LocalNotifications.schedule({ notifications: list.map((d) => ({
    id: 1000 + d.id!, title: "EMI due tomorrow", body: `${d.lender}: ${fmt(d.emi)} (day ${d.dueDay})`,
    schedule: { on: { day: Math.min(28, Math.max(1, d.dueDay - 1)), hour: 9, minute: 0 }, allowWhileIdle: true } })) });
  return { ok: true, msg: `Scheduled ${list.length} monthly reminder(s).` };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Payment reminders (ported from My Money Tracker's ReminderWorker). Everything is computed on the phone from the same rows as
// the plan; nothing leaves the device. Capacitor has no background worker, so the schedule is rebuilt whenever the app is opened
// or the data changes, and the system then delivers the notifications at 9:00 on the chosen day even if the app is closed.
// ---------------------------------------------------------------------------------------------------------------------------

export interface Planned { id: number; at: Date; title: string; body: string }
const EVENT_BASE = 2000, EVENT_MAX = 60, SAVINGS_ID = 2950, BUDGET_BASE = 2960;
const inRange = (n: { id: number }) => n.id >= EVENT_BASE && n.id < 3000;

/** The dated notifications for the next 60 days: each financial event, `remindDays` before it, at 9:00 local time. Amounts only if asked. */
export function planEventReminders(d: EngineData, remindDays: number, showAmounts: boolean, fmt: (p: number) => string, now = new Date()): Planned[] {
  const today = todayIso(), horizon = addDays(today, 60 + remindDays);
  const when = remindDays === 0 ? "today" : remindDays === 1 ? "tomorrow" : `in ${remindDays} days`;
  const out: Planned[] = [];
  for (const e of eventsBetween(addDays(today, remindDays), horizon, d)) {
    const [y, m, day] = addDays(e.date, -remindDays).split("-").map(Number);
    const at = new Date(y, m - 1, day, 9, 0, 0);
    if (at <= now) continue;
    const verb = e.type === "income" ? "expected" : e.type === "savings" ? "deadline" : "due";
    out.push({ id: 0, at, title: e.title, body: `${verb} ${when}${showAmounts && e.amount > 0 ? ` · ${fmt(e.amount)}` : ""}` });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, EVENT_MAX).map((n, i) => ({ ...n, id: EVENT_BASE + i }));
}

/** Budget categories at 75% or more this month, one warning per category per level per day. */
export function budgetWarnings(d: EngineData, today = todayIso()) {
  const ym = today.slice(0, 7), s = summarize(ym, d, today);
  return d.budgets.filter((b) => b.month === ym && b.limit > 0).map((b) => {
    const pct = Math.floor((budgetSpent(s, b.category) * 100) / b.limit);
    return { category: b.category, pct, level: pct >= 100 ? 100 : pct >= 90 ? 90 : pct >= 75 ? 75 : 0 };
  }).filter((w) => w.level > 0);
}

async function ensurePermission() {
  const perm = await LocalNotifications.requestPermissions();
  return perm.display === "granted";
}

export async function syncReminders(d: EngineData, s: Settings, fmt: (p: number) => string): Promise<{ ok: boolean; msg: string }> {
  if (!Capacitor.isNativePlatform()) return { ok: false, msg: "Reminders work in the installed Android app." };
  const pending = await LocalNotifications.getPending();
  const mine = pending.notifications.filter((n) => inRange(n));
  if (mine.length) await LocalNotifications.cancel({ notifications: mine.map((n) => ({ id: n.id })) });
  if (!s.payReminders) return { ok: true, msg: "Payment reminders turned off." };
  if (!(await ensurePermission())) return { ok: false, msg: "Notification permission was denied." };

  const events = planEventReminders(d, s.remindDays, s.showAmounts, fmt);
  const batch: any[] = events.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true } }));
  if (d.goals.some((g) => g.saved < g.target)) // monthly savings nudge on the 1st
    batch.push({ id: SAVINGS_ID, title: "Savings reminder", body: "Add money to your savings goals this month", schedule: { on: { day: 1, hour: 9, minute: 0 }, allowWhileIdle: true } });

  const row = await db.settings.get("budgetNotified"), seen: Record<string, string> = { ...((row?.value as Record<string, string>) ?? {}) };
  const today = todayIso();
  budgetWarnings(d).forEach((w, i) => {
    const mark = `${today}:${w.level}`;
    if (seen[w.category] === mark) return;
    seen[w.category] = mark;
    batch.push({ id: BUDGET_BASE + i, title: `Budget: ${w.category}`, body: w.level === 100 ? "You have reached your budget" : `${w.pct}% of your budget used`, schedule: { at: new Date(Date.now() + 4000) } });
  });
  await db.settings.put({ key: "budgetNotified", value: seen });
  if (batch.length) await LocalNotifications.schedule({ notifications: batch });
  return { ok: true, msg: `Scheduled ${events.length} payment reminder(s) for the next 60 days.` };
}

export async function sendTestReminder(): Promise<{ ok: boolean; msg: string }> {
  if (!Capacitor.isNativePlatform()) return { ok: false, msg: "Reminders work in the installed Android app." };
  if (!(await ensurePermission())) return { ok: false, msg: "Notification permission was denied." };
  await LocalNotifications.schedule({ notifications: [{ id: 2999, title: "Test reminder", body: "Reminders are working", schedule: { at: new Date(Date.now() + 2000) } }] });
  return { ok: true, msg: "Test reminder sent." };
}
