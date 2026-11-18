import { Capacitor } from "@capacitor/core";
import { useState } from "react";
import { PinSetupFields } from "./Lock";
import { DATA_TABLES, DEVICE_KEYS, db, getSettings, setSetting, useSettings, type Settings as S } from "./lib/db";
import { saveAndShare } from "./lib/files";
import { biometricAvailable, clearPin, hasPin, setPin, setPrivacyScreen } from "./lib/lock";
import { scheduleEmiReminders, sendTestReminder } from "./lib/notify";
import { loadPlanSample, loadSample } from "./lib/sample";
import { fmt, Glass, Title } from "./ui";

const TIMEOUTS: [string, number][] = [["Every time", 0], ["After 1 minute", 1], ["After 5 minutes", 5], ["After 15 minutes", 15], ["Never (only after app restart)", -1]];
const REMIND: [string, number][] = [["Same day", 0], ["1 day before", 1], ["3 days before", 3], ["7 days before", 7]];
/** Settings that travel with a backup. Lock, notification and API-key settings stay on this phone. */
const PORTABLE: (keyof S)[] = ["currency", "alertPct", "theme", "customCategories", "remindDays", "showAmounts", "model"];
const AMOUNT_KEYS = ["amount", "amountDue", "amountPaid", "monthly", "principal", "limit", "outstanding", "invested", "current", "target"];

/** Checks a parsed backup before anything is erased, as My Money Tracker does. Returns an error message or null. */
export function validateBackup(j: any): string | null {
  if (!j || j.app !== "finglass" || (j.version !== 1 && j.version !== 2) || typeof j.tables !== "object" || j.tables === null) return "Not a FinGlass backup file.";
  for (const t of DATA_TABLES) {
    const rows = j.tables[t];
    if (rows === undefined) continue;
    if (!Array.isArray(rows) || rows.some((r: any) => !r || typeof r !== "object" || Array.isArray(r))) return `The backup has an invalid “${t}” section.`;
    if (rows.some((r: any) => AMOUNT_KEYS.some((k) => k in r && typeof r[k] === "number" && r[k] < 0))) return "The backup contains invalid (negative) amounts.";
  }
  return null;
}

export default function Settings() {
  const s = useSettings();
  const [msg, setMsg] = useState(""), [key, setKey] = useState("");
  const [pinMode, setPinMode] = useState<null | "enable" | "change">(null), [newPin, setNewPin] = useState<string | null>(null), [bio, setBio] = useState<boolean | null>(null);
  const note = (m: string) => setMsg(m);
  if (bio === null) biometricAvailable().then(setBio);

  const exportBackup = async () => {
    const tables: Record<string, unknown[]> = {};
    for (const t of DATA_TABLES) tables[t] = await (db as any)[t].toArray();
    const all = await getSettings(), settings = Object.fromEntries(PORTABLE.map((k) => [k, all[k]])); // API key, lock and reminder settings are never exported
    await saveAndShare(`finglass-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "finglass", version: 2, exportedAt: Date.now(), settings, tables }), "application/json");
    note("Backup created. Save it somewhere safe (Drive, email to yourself). It is not encrypted.");
  };
  /** One CSV with a "## table" section per table; opens in Excel / Google Sheets. Cannot be restored; use the JSON backup for that. */
  const exportCsv = async () => {
    const esc = (v: unknown) => { const t = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    let csv = "";
    for (const t of DATA_TABLES) {
      const rows: any[] = await (db as any)[t].toArray();
      if (!rows.length) continue;
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      csv += `## ${t}\n${cols.join(",")}\n${rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n")}\n\n`;
    }
    await saveAndShare(`finglass-export-${new Date().toISOString().slice(0, 10)}.csv`, csv || "No data yet\n", "text/csv");
    note("CSV created (amounts are in the smallest unit, e.g. paise).");
  };
  const importBackup = async (file: File) => {
    try {
      if (file.size > 20_000_000) throw new Error("That file is too large to be a backup.");
      const j = JSON.parse(await file.text());
      const bad = validateBackup(j);
      if (bad) throw new Error(bad);
      if (!confirm("This REPLACES all data on this phone with the backup. If the file is invalid nothing is changed. Continue?")) return;
      await db.transaction("rw", [...DATA_TABLES.map((t) => (db as any)[t]), db.settings], async () => {
        for (const t of DATA_TABLES) { await (db as any)[t].clear(); const rows = j.tables[t]; if (Array.isArray(rows)) await (db as any)[t].bulkPut(rows); }
        for (const k of PORTABLE) if (j.settings && k in j.settings) await db.settings.put({ key: k, value: j.settings[k] });
      });
      note("Backup restored.");
    } catch (e: any) { note(`Import failed, your existing data was kept. ${e.message}`); }
  };
  const reminders = async (on: boolean) => {
    await setSetting("reminders", on);
    const r = await scheduleEmiReminders(await db.debts.toArray(), on, fmt);
    if (!r.ok) await setSetting("reminders", false);
    note(r.msg);
  };
  const lockToggle = async (on: boolean) => {
    if (on && !(await hasPin())) { setPinMode("enable"); setNewPin(null); return; }
    await setSetting("lockEnabled", on);
  };
  const savePin = async () => {
    if (!newPin) return;
    await setPin(newPin);
    if (pinMode === "enable") await setSetting("lockEnabled", true);
    note(pinMode === "enable" ? "App lock turned on." : "PIN changed.");
    setPinMode(null);
  };
  const erase = async () => {
    if (!confirm("Delete ALL data on this phone, including your PIN? This cannot be undone.")) return;
    for (const t of DATA_TABLES) await (db as any)[t].clear();
    await clearPin(); await setSetting("lockEnabled", false); await setSetting("customCategories", []); await setSetting("onboarded", false);
    note("All data erased.");
  };
  void DEVICE_KEYS;

  return (
    <>
      <Title>Settings</Title>
      <Glass className="form">
        <b>Security</b>
        <label className="check"><input type="checkbox" checked={s.lockEnabled} onChange={(e) => lockToggle(e.target.checked)} /> App lock (PIN)</label>
        {s.lockEnabled && <>
          <label>Require authentication<select value={s.lockTimeout} onChange={(e) => setSetting("lockTimeout", Number(e.target.value))}>{TIMEOUTS.map(([l, v]) => <option key={v} value={v}>{l}</option>)}</select></label>
          {bio ? <label className="check"><input type="checkbox" checked={s.biometric} onChange={(e) => setSetting("biometric", e.target.checked)} /> Fingerprint / face / screen lock</label>
            : <small className="muted">No fingerprint / face unlock available here. The PIN is used.</small>}
          <div className="row"><button className="btn ghost" onClick={() => { setPinMode("change"); setNewPin(null); }}>Change PIN</button></div>
        </>}
        {pinMode && <div className="subform"><PinSetupFields onValid={setNewPin} />
          <div className="row"><button className="btn" disabled={!newPin} onClick={savePin}>Save PIN</button><button className="btn ghost" onClick={() => setPinMode(null)}>Cancel</button></div></div>}
        <label className="check"><input type="checkbox" checked={s.privacy} onChange={(e) => { setSetting("privacy", e.target.checked); setPrivacyScreen(e.target.checked); }} /> Hide app from screenshots and recent-apps preview</label>
        <small className="muted">The PIN is stored only as a salted hash on this phone. It is not backed by the phone's hardware keystore, so treat it as a screen lock, not as encryption of your data.</small>
      </Glass>
      <Glass className="form">
        <b>Reminders</b>
        <label className="check"><input type="checkbox" checked={s.payReminders} onChange={async (e) => { await setSetting("payReminders", e.target.checked); if (e.target.checked && !Capacitor.isNativePlatform()) note("Reminders are scheduled in the installed Android app."); }} /> Payment reminders (on this phone)</label>
        <label>Remind me<select value={s.remindDays} onChange={(e) => setSetting("remindDays", Number(e.target.value))}>{REMIND.map(([l, v]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={s.showAmounts} onChange={(e) => setSetting("showAmounts", e.target.checked)} /> Show amounts in notifications (visible on the lock screen)</label>
        <small className="muted">Covers EMIs, loans, rent, bills, friend debts, expected income, goal deadlines, budget warnings (75%+) and a monthly savings nudge on the 1st. Rebuilt whenever you open the app; delivered around 9:00.</small>
        <div className="row"><button className="btn ghost" onClick={async () => note((await sendTestReminder()).msg)}>Send a test reminder</button></div>
        <label className="check"><input type="checkbox" checked={s.reminders} onChange={(e) => reminders(e.target.checked)} /> Monthly EMI reminders for “Debts &amp; EMIs” (day before, 9:00)</label>
      </Glass>
      <Glass className="form">
        <b>Appearance &amp; money</b>
        <label>Theme<select value={s.theme} onChange={(e) => setSetting("theme", e.target.value)}><option value="dark">Dark glass</option><option value="light">Light glass</option></select></label>
        <label>Currency<select value={s.currency} onChange={(e) => setSetting("currency", e.target.value)}>{["INR", "USD", "EUR", "GBP", "AED"].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Budget alert at (% of limit)<input inputMode="numeric" value={s.alertPct} onChange={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= 100) setSetting("alertPct", n); }} /></label>
      </Glass>
      <Glass className="form">
        <b>AI assistant (Google Gemini)</b>
        <small className="muted">Your key is stored only on this phone and sent only to Google. Anyone with access to your unlocked phone could use it, so use a restricted key you can revoke.</small>
        <label>API key<input type="password" autoComplete="off" placeholder={s.apiKey ? "•••••••• saved" : "Paste key"} value={key} onChange={(e) => setKey(e.target.value)} /></label>
        <label>Model<input value={s.model} onChange={(e) => setSetting("model", e.target.value.trim())} /></label>
        <div className="row"><button className="btn" onClick={() => { if (key.trim()) { setSetting("apiKey", key.trim()); setKey(""); note("Key saved."); } }}>Save key</button>
          {s.apiKey && <button className="btn ghost" onClick={() => { setSetting("apiKey", ""); note("Key removed."); }}>Remove</button>}</div>
      </Glass>
      <Glass className="form">
        <b>Backup &amp; restore</b>
        <small className="muted">Your data lives only on this phone. If you uninstall the app or lose the phone, it is gone. Backups are saved only where you choose and are NOT encrypted. Restoring replaces everything, and an invalid file changes nothing. Lock, reminder and API-key settings are never part of a backup.</small>
        <div className="row"><button className="btn" onClick={exportBackup}>Export backup (JSON)</button>
          <label className="btn ghost filebtn">Import backup<input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importBackup(f); }} /></label></div>
        <div className="row"><button className="btn ghost" onClick={exportCsv}>Export all as CSV (Excel / Sheets)</button></div>
      </Glass>
      <Glass className="form">
        <b>Sample data &amp; reset</b>
        <div className="row"><button className="btn ghost" onClick={async () => { await loadSample(); note("Sample data added."); }}>Load sample data</button>
          <button className="btn ghost" onClick={async () => { await loadPlanSample(); note("Sample plan added (income plans, rent, EMIs, loan, friend debts)."); }}>Load sample plan</button></div>
        <div className="row"><button className="btn danger" onClick={erase}>Erase all data</button></div>
      </Glass>
      {msg && <Glass className="alert">{msg}</Glass>}
      <small className="muted">FinGlass is for financial organisation and education only. It never asks for bank passwords, UPI PINs, CVVs or OTPs and does not execute trades.</small>
    </>
  );
}
