import { useEffect, useState } from "react";
import { setSetting } from "./lib/db";
import { biometricAvailable, biometricUnlock, lockedSeconds, setPin, validPin, verifyPin } from "./lib/lock";
import { loadSample } from "./lib/sample";
import { Glass } from "./ui";

/** Two PIN fields. Reports the PIN through onValid only when both match and are 4-8 digits (otherwise null). */
export function PinSetupFields({ onValid }: { onValid: (pin: string | null) => void }) {
  const [a, setA] = useState(""), [b, setB] = useState("");
  const upd = (x: string, y: string) => onValid(validPin(x) && x === y ? x : null);
  const digits = (s: string) => s.replace(/\D/g, "").slice(0, 8);
  return (
    <>
      <label>New PIN (4-8 digits)<input type="password" inputMode="numeric" autoComplete="off" value={a} onChange={(e) => { const v = digits(e.target.value); setA(v); upd(v, b); }} /></label>
      <label>Confirm PIN<input type="password" inputMode="numeric" autoComplete="off" value={b} onChange={(e) => { const v = digits(e.target.value); setB(v); upd(a, v); }} /></label>
      {b !== "" && a !== b && <p className="err">PINs do not match</p>}
    </>
  );
}

export function LockScreen({ biometric, onUnlock }: { biometric: boolean; onUnlock: () => void }) {
  const [pin, setPinText] = useState(""), [err, setErr] = useState(""), [wait, setWait] = useState(0), [bio, setBio] = useState(false);
  const tryBio = async () => { if (await biometricUnlock()) onUnlock(); };
  useEffect(() => { lockedSeconds().then(setWait); biometricAvailable().then((ok) => { setBio(biometric && ok); if (biometric && ok) tryBio(); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (wait <= 0) return; const t = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000); return () => clearInterval(t); }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    const r = await verifyPin(pin);
    setPinText("");
    if (r === "ok") return onUnlock();
    if (r === "locked") { const s = await lockedSeconds(); setWait(s); return setErr(`Too many attempts. Try again in ${s} seconds.`); }
    setErr("Wrong PIN");
    setWait(await lockedSeconds());
  };
  return (
    <div className="center">
      <Glass className="form lock">
        <h2>🔒 FinGlass</h2>
        <small className="muted">Enter your PIN to unlock</small>
        <label>PIN<input type="password" inputMode="numeric" autoComplete="off" autoFocus value={pin} disabled={wait > 0}
          onChange={(e) => { setPinText(e.target.value.replace(/\D/g, "").slice(0, 8)); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && pin.length >= 4 && submit()} /></label>
        {wait > 0 ? <p className="err">Too many attempts. Try again in {wait} seconds.</p> : err && <p className="err">{err}</p>}
        <button className="btn" disabled={pin.length < 4 || wait > 0} onClick={submit}>Unlock</button>
        {bio && <button className="btn ghost" onClick={tryBio}>Use fingerprint / face / screen lock</button>}
      </Glass>
    </div>
  );
}

/** First launch: step 1 choose your data, step 2 protect it with a PIN (or skip). */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [sample, setSample] = useState<boolean | null>(null), [pin, setPinValue] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const finish = async (withPin: boolean) => {
    setBusy(true);
    if (sample) await loadSample({ finglass: true, plan: true });
    if (withPin && pin) { await setPin(pin); await setSetting("lockEnabled", true); }
    await setSetting("onboarded", true);
    onDone();
  };
  return (
    <div className="center">
      <Glass className="form lock">
        {sample === null ? (
          <>
            <h2>Welcome to FinGlass</h2>
            <small className="muted">Everything stays on this phone. No account, no server.</small>
            <button className="btn" onClick={() => setSample(false)}>Start from zero</button>
            <button className="btn ghost" onClick={() => setSample(true)}>Load sample data</button>
            <small className="muted">Sample data is only for trying the app. You can edit or delete all of it.</small>
          </>
        ) : (
          <>
            <h2>Protect your data</h2>
            <small className="muted">Set a PIN. You can also unlock with fingerprint or face from Settings.</small>
            <PinSetupFields onValid={setPinValue} />
            <button className="btn" disabled={!pin || busy} onClick={() => finish(true)}>Set PIN and continue</button>
            <button className="btn ghost" disabled={busy} onClick={() => finish(false)}>Skip for now</button>
          </>
        )}
      </Glass>
    </div>
  );
}
