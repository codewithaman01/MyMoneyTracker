// App lock: PIN (salted PBKDF2-SHA256, never stored in clear) + optional fingerprint / face / screen lock on the phone.
// 5 wrong PIN tries lock the keypad for 30 s, growing with every further 5 failures.
import { Capacitor } from "@capacitor/core";
import { db } from "./db";

const ITER = 120_000, KEY = "pin";
interface PinRecord { salt: string; hash: string; fails: number; lockUntil: number }
export type PinResult = "ok" | "wrong" | "locked";

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITER }, key, 256));
}
const read = async () => (await db.settings.get(KEY))?.value as PinRecord | undefined;
const write = (r: PinRecord) => db.settings.put({ key: KEY, value: r });
const same = (a: string, b: string) => { let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };

export const validPin = (p: string) => /^\d{4,8}$/.test(p);
export const hasPin = async () => !!(await read());
export async function setPin(pin: string) {
  if (!validPin(pin)) throw new Error("PIN must be 4-8 digits");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await write({ salt: b64(salt), hash: await derive(pin, salt), fails: 0, lockUntil: 0 });
}
export const clearPin = () => db.settings.delete(KEY);
export async function lockedSeconds(now = Date.now()): Promise<number> {
  const r = await read();
  const left = (r?.lockUntil ?? 0) - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}
export async function verifyPin(pin: string, now = Date.now()): Promise<PinResult> {
  const r = await read();
  if (!r) return "wrong";
  if (r.lockUntil > now) return "locked";
  if (same(r.hash, await derive(pin, unb64(r.salt)))) { await write({ ...r, fails: 0 }); return "ok"; }
  const fails = r.fails + 1;
  await write({ ...r, fails, lockUntil: fails % 5 === 0 ? now + 30_000 * (fails / 5) : r.lockUntil });
  return "wrong";
}

// ---- biometrics (native app only) ----
/** While the system prompt is open the app can be paused/resumed by Android; this flag stops that re-locking the app. */
export const authState = { busy: false, ignoreUntil: 0 };
export async function biometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try { const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth"); return (await BiometricAuth.checkBiometry()).isAvailable; } catch { return false; }
}
export async function biometricUnlock(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  authState.busy = true;
  try {
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    await BiometricAuth.authenticate({ reason: "Unlock FinGlass", cancelTitle: "Use PIN", allowDeviceCredential: true, androidTitle: "Unlock FinGlass" });
    return true;
  } catch { return false; } finally { authState.busy = false; authState.ignoreUntil = Date.now() + 1500; }
}
/** Blocks screenshots and the recent-apps preview of financial data (Android FLAG_SECURE). */
export async function setPrivacyScreen(on: boolean) {
  if (!Capacitor.isNativePlatform()) return;
  try { const { PrivacyScreen } = await import("@capacitor-community/privacy-screen"); await (on ? PrivacyScreen.enable() : PrivacyScreen.disable()); } catch { /* plugin unavailable: not fatal */ }
}
