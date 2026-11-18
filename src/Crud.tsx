import { useLiveQuery } from "dexie-react-hooks";
import type { Table } from "dexie";
import { useEffect, useState, type ReactNode } from "react";
import { parseMoney, thisMonth } from "./lib/calc";
import { saveAndShare } from "./lib/files";
import { Badge, fmt, Glass, Progress, Title } from "./ui";

type Form = Record<string, string>;
export interface Field {
  key: string; label: string; type: "text" | "money" | "date" | "month" | "select" | "number"; options?: string[]; labels?: Record<string, string>; def?: string; optional?: boolean; zero?: boolean;
  /** Show this field only when the condition on the current form values holds. Hidden fields are not validated and are stored empty / 0. */
  showIf?: (f: Form) => boolean;
  /** Adds a "+ New…" entry to a select; called with the typed name so the caller can remember it. */
  creatable?: (name: string) => Promise<void>;
}
export interface Cols { title: string; sub?: string; amount?: number; badge?: string; progress?: number }
interface Props {
  title: string; table: Table<any, number>; fields: Field[]; cols: (r: any) => Cols; dateKey?: string; actions?: (r: any) => ReactNode; exportName?: string; onChange?: () => void;
  /** Replace the default table.add / table.update (e.g. to also build an EMI schedule). */
  onSave?: (out: any, editId: number | null) => Promise<void>;
  /** Replace the default delete (e.g. to cascade to payment rows). */
  onDelete?: (row: any) => Promise<void>;
  /** Extra validation on the parsed values; return an error message or null. */
  validate?: (out: any) => string | null;
  /** Extra controls rendered under the form fields (e.g. "Use calculated EMI"). */
  extra?: (form: Form, set: (k: string, v: string) => void) => ReactNode;
  autoOpen?: boolean; autoEdit?: number; rowFilter?: (r: any) => boolean; onOpen?: (r: any) => void; headerExtra?: ReactNode;
  categoryFilter?: { key: string; options: string[] }; empty?: string; confirmText?: string;
}

const toForm = (fields: Field[], row?: any): Form => Object.fromEntries(fields.map((f) => [f.key, row
  ? f.type === "money" ? (row[f.key] === "" || row[f.key] == null ? "" : (row[f.key] / 100).toFixed(2)) : String(row[f.key] ?? "")
  : f.def ?? (f.type === "date" ? new Date().toISOString().slice(0, 10) : f.type === "month" ? thisMonth() : f.type === "select" ? f.options![0] : "")]));

export function Crud({ title, table, fields, cols, dateKey, actions, exportName, onChange, onSave, onDelete, validate, extra, autoOpen, autoEdit, rowFilter, onOpen, headerExtra, categoryFilter, empty, confirmText }: Props) {
  const rows: any[] = useLiveQuery(() => table.toArray(), [table], []);
  const [month, setMonth] = useState(dateKey ? thisMonth() : "");
  const [q, setQ] = useState(""), [cat, setCat] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const shown = rows
    .filter((r) => !rowFilter || rowFilter(r))
    .filter((r) => !dateKey || !month || String(r[dateKey]).startsWith(month))
    .filter((r) => !categoryFilter || !cat || r[categoryFilter.key] === cat)
    .filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (dateKey ? String(b[dateKey]).localeCompare(String(a[dateKey])) : 0) || b.id - a.id);

  const open = (row?: any) => { setForm(toForm(fields, row)); setEditId(row?.id ?? null); setErr(""); };
  useEffect(() => { if (autoOpen) open(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoEdit != null && !form) { const r = rows.find((x) => x.id === autoEdit); if (r) open(r); } }, [autoEdit, rows.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    const out: any = {};
    for (const f of fields) {
      if (f.showIf && !f.showIf(form!)) { out[f.key] = f.type === "money" || f.type === "number" ? 0 : ""; continue; }
      const v = (form![f.key] ?? "").trim();
      if (!v && f.optional) { out[f.key] = ""; continue; }
      if (!v) return setErr(`${f.label} is required.`);
      if (f.type === "money") {
        const p = parseMoney(v);
        if (p === null || (p === 0 && !f.zero)) return setErr(`${f.label} must be a valid amount${f.zero ? "" : " above 0"}.`);
        out[f.key] = p;
      } else if (f.type === "number") {
        if (!Number.isFinite(Number(v)) || Number(v) < 0) return setErr(`${f.label} must be a number ≥ 0.`);
        out[f.key] = Number(v);
      } else out[f.key] = v;
    }
    const problem = validate?.(out);
    if (problem) return setErr(problem);
    try {
      if (onSave) await onSave(out, editId);
      else if (editId) await table.update(editId, out);
      else await table.add(out);
    } catch (e: any) { return setErr(`Could not save: ${e?.message ?? "unknown error"}`); }
    setForm(null); onChange?.();
  };
  const exportCsv = () => {
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const csv = [fields.map((f) => f.label).join(","), ...shown.map((r) => fields.map((f) => esc(f.type === "money" ? (r[f.key] === "" ? "" : (r[f.key] / 100).toFixed(2)) : r[f.key])).join(","))].join("\n");
    saveAndShare(`${exportName || title}-${month || "all"}.csv`, csv, "text/csv");
  };
  const choose = async (f: Field, v: string) => {
    if (v !== "__new") return set(f.key, v);
    const name = (prompt("Name of the new entry:") || "").trim();
    if (!name) return;
    await f.creatable!(name);
    set(f.key, name);
  };

  return (
    <>
      <Title right={<button className="btn" onClick={() => open()}>+ Add</button>}>{title}</Title>
      {headerExtra}
      <Glass className="filters">
        {dateKey && <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month filter" />}
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        {categoryFilter && <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category filter"><option value="">All categories</option>{categoryFilter.options.map((o) => <option key={o}>{o}</option>)}</select>}
        <button className="btn ghost" onClick={exportCsv}>CSV</button>
      </Glass>
      {form && (
        <Glass className="form">
          {fields.filter((f) => !f.showIf || f.showIf(form)).map((f) => (
            <label key={f.key}>{f.label}
              {f.type === "select"
                ? <select value={form[f.key]} onChange={(e) => choose(f, e.target.value)}>
                    {[...f.options!, ...(form[f.key] && !f.options!.includes(form[f.key]) ? [form[f.key]] : [])].map((o) => <option key={o} value={o}>{f.labels?.[o] ?? o}</option>)}
                    {f.creatable && <option value="__new">＋ New…</option>}
                  </select>
                : <input type={f.type === "money" || f.type === "number" ? "text" : f.type} inputMode={f.type === "money" || f.type === "number" ? "decimal" : undefined}
                    value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} />}
            </label>
          ))}
          {extra?.(form, set)}
          {err && <p className="err">{err}</p>}
          <div className="row"><button className="btn" onClick={save}>Save</button><button className="btn ghost" onClick={() => setForm(null)}>Cancel</button></div>
        </Glass>
      )}
      {shown.length === 0 && <Glass className="empty">{empty ?? "Nothing here yet. Tap “+ Add”."}</Glass>}
      {shown.map((r) => {
        const c = cols(r);
        return (
          <Glass key={r.id} className="item">
            <div className="line">
              <div><b>{c.title}</b>{c.badge && <Badge kind={c.badge.toLowerCase().split(" ")[0]}>{c.badge}</Badge>}<small>{c.sub}</small></div>
              {c.amount !== undefined && <strong className="amt">{fmt(c.amount)}</strong>}
            </div>
            {c.progress !== undefined && <Progress pct={c.progress} />}
            <div className="row">
              {onOpen && <button className="link" onClick={() => onOpen(r)}>Open</button>}
              {actions?.(r)}
              <button className="link" onClick={() => open(r)}>Edit</button>
              <button className="link danger" onClick={async () => { if (confirm(confirmText ?? "Delete this entry?")) { await (onDelete ? onDelete(r) : table.delete(r.id)); onChange?.(); } }}>Delete</button>
            </div>
          </Glass>
        );
      })}
    </>
  );
}
