import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState, type ReactElement } from "react";
import Assistant from "./Assistant";
import Calendar from "./Calendar";
import Dashboard from "./Dashboard";
import { FriendDebtsPage } from "./Friends";
import Insights from "./Insights";
import { LockScreen, Onboarding } from "./Lock";
import { EmisPage, LoansPage } from "./Loans";
import { BudgetsPage, DebtsPage, ExpensesPage, GoalsPage, IncomePage, InvestmentsPage } from "./Pages";
import { ChangesPage, IncomePlansPage, PlanPage, RecurringPage } from "./Plan";
import Reports from "./Reports";
import Settings from "./Settings";
import { applyRecurring } from "./lib/recurring";
import { db, getSettings, loadEngine, setSetting } from "./lib/db";
import { authState, hasPin, setPrivacyScreen } from "./lib/lock";
import { syncReminders } from "./lib/notify";
import { fmt, Glass, setCurrency } from "./ui";

const TABS = [["home", "🏠", "Home"], ["income", "💰", "Income"], ["expenses", "🧾", "Expenses"], ["debts", "🏦", "Debts"], ["more", "✨", "More"]] as const;
const MORE = [
  ["plan", "🗓️", "Monthly plan"], ["budgets", "📊", "Budgets"], ["goals", "🎯", "Goals"], ["emis", "💳", "EMI Manager"], ["loans", "🏛️", "Loan Manager"],
  ["friends", "🤝", "Friend debts"], ["incomeplans", "💼", "Income plans"], ["recurring", "🔁", "Recurring payments"], ["changes", "📈", "Future changes"],
  ["calendar", "📅", "Calendar"], ["reports", "📉", "Reports"], ["invest", "💹", "Investments"], ["insights", "💡", "Insights"], ["assistant", "🤖", "AI Assistant"], ["settings", "⚙️", "Settings & backup"]];
const ADD: [string, string][] = [["expenses", "Expense"], ["income", "Income (one entry)"], ["incomeplans", "Income plan (recurring)"], ["recurring", "Recurring payment"], ["emis", "EMI"], ["loans", "Loan"], ["friends", "Friend debt"], ["goals", "Savings goal"], ["budgets", "Budget"], ["invest", "Investment"]];

export default function App() {
  const [nav, setNav] = useState<{ page: string; arg?: any; n: number }>({ page: "home", n: 0 });
  const go = (page: string, arg?: any) => setNav((x) => ({ page, arg, n: x.n + 1 }));
  const [locked, setLocked] = useState(true), [addMenu, setAddMenu] = useState(false);
  const s = useLiveQuery(getSettings, [], undefined);
  const pinSet = useLiveQuery(hasPin, [], undefined);
  const anyData = useLiveQuery(async () => (await Promise.all([db.income, db.expenses, db.debts, db.emis, db.loans, db.incomeSources].map((t) => t.count()))).some((n) => n > 0), [], undefined);
  const eng = useLiveQuery(loadEngine, [], null);

  useEffect(() => { applyRecurring(); }, []);
  useEffect(() => { if (s) { setCurrency(s.currency); document.documentElement.dataset.theme = s.theme; } }, [s?.currency, s?.theme]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (s) setPrivacyScreen(s.privacy); }, [s?.privacy]); // eslint-disable-line react-hooks/exhaustive-deps
  // Existing installs that already have data skip the welcome screen.
  useEffect(() => { if (s && !s.onboarded && anyData) setSetting("onboarded", true); }, [s?.onboarded, anyData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-lock when the app comes back from the background (every time / after N minutes / never).
  useEffect(() => {
    if (!s?.lockEnabled) return;
    let left = 0;
    const h = () => {
      if (document.hidden) { left = Date.now(); return; }
      if (authState.busy || Date.now() < authState.ignoreUntil) return;
      if (s.lockTimeout === 0 || (s.lockTimeout > 0 && Date.now() - left >= s.lockTimeout * 60_000)) setLocked(true);
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [s?.lockEnabled, s?.lockTimeout]);

  // Rebuild payment reminders shortly after the data or reminder settings change.
  useEffect(() => {
    if (!s || !eng || !s.payReminders) return;
    const t = setTimeout(() => { syncReminders(eng, s, fmt).catch(() => {}); }, 2500);
    return () => clearTimeout(t);
  }, [eng, s?.payReminders, s?.remindDays, s?.showAmounts, s?.currency]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s || pinSet === undefined || anyData === undefined) return null; // nothing is drawn until settings are known, so data never flashes before the lock
  if (s.lockEnabled && pinSet && locked) return <><div className="blobs" aria-hidden><i /><i /><i /></div><LockScreen biometric={s.biometric} onUnlock={() => setLocked(false)} /></>;
  if (!s.onboarded && !anyData) return <><div className="blobs" aria-hidden><i /><i /><i /></div><Onboarding onDone={() => setLocked(false)} /></>;

  const { page, arg } = nav;
  const view: Record<string, ReactElement> = {
    home: <Dashboard go={go} />, income: <IncomePage arg={arg} />, expenses: <ExpensesPage arg={arg} />, debts: <DebtsPage arg={arg} />,
    budgets: <BudgetsPage arg={arg} />, goals: <GoalsPage arg={arg} />, invest: <InvestmentsPage arg={arg} />, insights: <Insights />,
    assistant: <Assistant go={go} />, settings: <Settings />, plan: <PlanPage />, emis: <EmisPage arg={arg} />, loans: <LoansPage arg={arg} />,
    friends: <FriendDebtsPage arg={arg} />, incomeplans: <IncomePlansPage arg={arg} />, recurring: <RecurringPage arg={arg} />, changes: <ChangesPage />,
    calendar: <Calendar go={go} />, reports: <Reports />,
    more: <div className="grid">{MORE.map(([k, i, l]) => <button key={k} className="glass tile" onClick={() => go(k)}><span>{i}</span>{l}</button>)}</div>,
  };
  const active = TABS.some((t) => t[0] === page) ? page : "more";

  return (
    <>
      <div className="blobs" aria-hidden><i /><i /><i /></div>
      <main key={`${s.currency}-${nav.n}`}>{view[page] ?? view.home}</main>
      {page !== "assistant" && page !== "settings" && <button className="fab" aria-label="Add" onClick={() => setAddMenu(true)}>＋ Add</button>}
      {addMenu && (
        <div className="overlay" onClick={() => setAddMenu(false)}>
          <Glass className="menu"><b>Add</b>
            {ADD.map(([k, l]) => <button key={k} className="link big" onClick={() => { setAddMenu(false); go(k, { add: true }); }}>Add {l}</button>)}
            <button className="btn ghost" onClick={() => setAddMenu(false)}>Close</button></Glass>
        </div>
      )}
      <nav className="glass nav">
        {TABS.map(([k, icon, label]) => <button key={k} className={active === k ? "on" : ""} onClick={() => go(k)}><span>{icon}</span>{label}</button>)}
      </nav>
    </>
  );
}
