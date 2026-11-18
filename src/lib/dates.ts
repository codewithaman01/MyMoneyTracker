// ISO-date ("YYYY-MM-DD") helpers using UTC arithmetic, so results never depend on the phone's time zone or DST.
const p2 = (n: number) => String(n).padStart(2, "0");
const toMs = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso: string, n: number) => fromMs(toMs(iso) + n * 86_400_000);
export const diffDays = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / 86_400_000);
/** Monday = 1 … Sunday = 7 */
export const weekday = (iso: string) => { const d = new Date(toMs(iso)).getUTCDay(); return d === 0 ? 7 : d; };
export const daysInMonth = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const monthStart = (ym: string) => `${ym}-01`;
export const monthEnd = (ym: string) => `${ym}-${p2(daysInMonth(ym))}`;
export const dayInMonth = (ym: string, day: number) => `${ym}-${p2(Math.min(Math.max(day, 1), daysInMonth(ym)))}`;
export const monthIndex = (ym: string) => { const [y, m] = ym.split("-").map(Number); return y * 12 + (m - 1); };
export const monthLabel = (ym: string, long = true) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: long ? "long" : "short", year: long ? "numeric" : "2-digit", timeZone: "UTC" });
};
export const prettyDate = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};
