import { useState } from "react";
import { thisMonth, shiftMonth, todayIso } from "./lib/calc";
import { dayInMonth, daysInMonth, monthEnd, monthLabel, monthStart, prettyDate, weekday } from "./lib/dates";
import { EVENT_COLORS, eventsBetween, type CalEvent } from "./lib/events";
import { useEngine } from "./lib/hooks";
import { fmt, Glass, Title } from "./ui";

export const MonthNav = ({ ym, onChange }: { ym: string; onChange: (m: string) => void }) => (
  <div className="monthnav">
    <button className="btn ghost" aria-label="Previous month" onClick={() => onChange(shiftMonth(ym, -1))}>‹</button>
    <strong>{monthLabel(ym)}</strong>
    <button className="btn ghost" aria-label="Next month" onClick={() => onChange(shiftMonth(ym, 1))}>›</button>
  </div>
);

/** Month calendar of everything due: EMIs, loans, rent, bills, friend debts, expected income and goal deadlines. */
export default function Calendar({ go }: { go: (p: string, arg?: any) => void }) {
  const d = useEngine();
  const [ym, setYm] = useState(thisMonth());
  const [sel, setSel] = useState<string | null>(todayIso());
  if (!d) return null;
  const events = eventsBetween(monthStart(ym), monthEnd(ym), d);
  const byDay = new Map<string, CalEvent[]>();
  events.forEach((e) => byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]));
  const lead = weekday(monthStart(ym)) - 1; // Monday first
  const cells = [...Array(lead).fill(null), ...[...Array(daysInMonth(ym))].map((_, i) => dayInMonth(ym, i + 1))];
  const list = sel && sel.startsWith(ym) ? byDay.get(sel) ?? [] : events;
  return (
    <>
      <Title>Calendar</Title>
      <Glass>
        <MonthNav ym={ym} onChange={(m) => { setYm(m); setSel(null); }} />
        <div className="cal">
          {["M", "T", "W", "T", "F", "S", "S"].map((x, i) => <span key={i} className="dow">{x}</span>)}
          {cells.map((c, i) => c === null ? <span key={i} /> : (
            <button key={i} className={`day ${c === sel ? "on" : ""} ${c === todayIso() ? "today" : ""}`} onClick={() => setSel(c)}
              aria-label={`${prettyDate(c)}, ${byDay.get(c)?.length ?? 0} events`}>
              {Number(c.slice(8))}
              <i>{[...new Set((byDay.get(c) ?? []).map((e) => e.type))].slice(0, 3).map((t) => <b key={t} style={{ background: EVENT_COLORS[t] }} />)}</i>
            </button>))}
        </div>
        <div className="legend">{(Object.keys(EVENT_COLORS) as (keyof typeof EVENT_COLORS)[]).map((t) => <span key={t}><b style={{ background: EVENT_COLORS[t] }} />{t}</span>)}</div>
      </Glass>
      {list.length === 0 && <Glass className="empty">Nothing scheduled{sel && sel.startsWith(ym) ? ` on ${prettyDate(sel)}` : " this month"}.</Glass>}
      {list.map((e, i) => (
        <Glass key={i} className="item event" >
          <div className="line"><div><b><b className="dot" style={{ background: EVENT_COLORS[e.type] }} />{e.title}</b><small>{prettyDate(e.date)}</small></div>
            {e.amount > 0 && <strong className="amt">{fmt(e.amount)}</strong>}</div>
          <div className="row"><button className="link" onClick={() => go(e.page, e.arg)}>Open</button></div>
        </Glass>
      ))}
    </>
  );
}
