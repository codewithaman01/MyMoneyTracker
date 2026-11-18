import { useLiveQuery } from "dexie-react-hooks";
import { thisMonth } from "./lib/calc";
import { loadAll } from "./lib/db";
import { buildInsights } from "./lib/insights";
import { Badge, fmt, Glass, Title } from "./ui";

export default function Insights() {
  const d = useLiveQuery(loadAll, [], null);
  if (!d) return null;
  const list = buildInsights(d, thisMonth(), fmt);
  return (
    <>
      <Title>Insights</Title>
      <Glass className="muted">Computed on your phone from your records. Badges show whether a figure is <b>historical</b>, <b>current</b> or an <b>estimate</b>. For organisation and education, not financial advice.</Glass>
      {list.map((i) => (
        <Glass key={i.title} className="item">
          <div className="line"><b>{i.title}</b><Badge kind={i.kind}>{i.kind}</Badge></div>
          <div className="big">{i.value}</div><small>{i.why}</small>
        </Glass>
      ))}
    </>
  );
}
