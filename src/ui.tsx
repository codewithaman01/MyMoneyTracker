import type { ReactNode } from "react";

let CUR = "INR";
export const setCurrency = (c: string) => { CUR = c; };
export const fmt = (p: number) =>
  new Intl.NumberFormat(CUR === "INR" ? "en-IN" : undefined, { style: "currency", currency: CUR, maximumFractionDigits: 2 }).format(p / 100);

export const Glass = ({ children, className = "" }: { children: ReactNode; className?: string }) => <section className={`glass ${className}`}>{children}</section>;
export const Kpi = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <Glass className={`kpi ${tone || ""}`}><span>{label}</span><strong>{value}</strong></Glass>
);
export const Badge = ({ kind, children }: { kind: string; children: ReactNode }) => <span className={`badge b-${kind}`}>{children}</span>;
export const Progress = ({ pct, level = "ok" }: { pct: number; level?: string }) => (
  <div className="bar"><i className={`l-${level}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>
);
export const Title = ({ children, right }: { children: ReactNode; right?: ReactNode }) => <div className="title"><h2>{children}</h2>{right}</div>;
export const Assume = ({ items }: { items: string[] }) => (
  <details className="assume"><summary>Assumptions</summary><ul>{items.map((a) => <li key={a}>{a}</li>)}</ul></details>
);
