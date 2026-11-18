import { useState } from "react";
import { Crud } from "./Crud";
import { parseMoney, todayIso } from "./lib/calc";
import { db, type FriendDebt } from "./lib/db";
import { prettyDate } from "./lib/dates";
import { useEngine } from "./lib/hooks";
import * as repo from "./lib/repo";
import { fmt, Glass } from "./ui";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Money I owe friends / family, and money they owe me, with part-payments and a due date that feeds the plan. */
export function FriendDebtsPage({ arg }: { arg?: any }) {
  const d = useEngine();
  const [tab, setTab] = useState<FriendDebt["direction"]>("I owe");
  if (!d) return null;
  const paid = (x: FriendDebt) => sum(d.friendPayments.filter((p) => p.debtId === x.id).map((p) => p.amount));
  const mine = d.friendDebts.filter((x) => x.direction === tab);
  const outstanding = sum(mine.map((x) => Math.max(0, x.amount - paid(x))));
  return (
    <Crud key={tab} title="Friend & personal debts" table={db.friendDebts} exportName="friend-debts" autoOpen={arg?.add}
      rowFilter={(r: FriendDebt) => r.direction === tab} onDelete={(r) => repo.deleteFriendDebt(r.id)} confirmText="Delete this debt? Its payments are deleted too."
      empty={tab === "I owe" ? "Nobody to pay back. 🎉" : "Nobody owes you anything right now."}
      headerExtra={<>
        <Glass className="seg-wrap"><div className="seg">{(["I owe", "Owed to me"] as const).map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "I owe" ? "Money I owe" : "Owed to me"}</button>)}</div></Glass>
        <Glass><div className="line strong"><span>Total outstanding</span><span>{fmt(outstanding)}</span></div></Glass></>}
      fields={[
        { key: "direction", label: "Type", type: "select", options: ["I owe", "Owed to me"], labels: { "I owe": "Money I owe", "Owed to me": "Money others owe me" }, def: tab },
        { key: "person", label: "Person", type: "text" }, { key: "amount", label: "Amount", type: "money" }, { key: "purpose", label: "Purpose", type: "text", optional: true },
        { key: "date", label: "Date", type: "date" }, { key: "dueDate", label: "Due / expected repayment date (optional)", type: "date", optional: true, def: "" }, { key: "note", label: "Notes", type: "text", optional: true }]}
      validate={(o) => (o.dueDate && o.dueDate < o.date ? "The due date cannot be before the date." : null)}
      actions={(x: FriendDebt) => {
        const rem = Math.max(0, x.amount - paid(x));
        return rem > 0 ? <button className="link" onClick={async () => {
          const a = parseMoney(prompt(`${x.direction === "I owe" ? "Payment" : "Amount received"} (remaining ${fmt(rem)}):`, (rem / 100).toFixed(2)) || "");
          if (!a) return;
          if (a > rem) return alert(`Amount is more than the remaining ${fmt(rem)}.`);
          await db.friendPayments.add({ debtId: x.id!, amount: a, date: todayIso(), note: "" });
        }}>{x.direction === "I owe" ? "Add payment" : "Add received"}</button> : null;
      }}
      cols={(x: FriendDebt) => { const p = paid(x), rem = Math.max(0, x.amount - p);
        return { title: x.person, amount: rem, badge: rem === 0 ? "Settled" : undefined, progress: x.amount > 0 ? (p / x.amount) * 100 : 0,
          sub: `${x.purpose ? x.purpose + " · " : ""}${prettyDate(x.date)}${x.dueDate ? ` · due ${prettyDate(x.dueDate)}` : ""} · ${fmt(x.amount)} total, ${fmt(p)} ${x.direction === "I owe" ? "paid" : "received"}` }; }} />
  );
}
