import { useRef, useState } from "react";
import { askGemini, type Msg } from "./lib/gemini";
import { useSettings } from "./lib/db";
import { runTool } from "./lib/tools";
import { Glass, Title } from "./ui";

const IDEAS = ["How much did I spend this month?", "Which category costs me most?", "How much can I save this month?", "When can I become debt-free?", "Can I afford a ₹20,000 purchase?"];

export default function Assistant({ go }: { go: (p: string) => void }) {
  const { apiKey, model } = useSettings();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);

  const send = async (t: string) => {
    if (!t.trim() || busy) return;
    setErr(""); setBusy(true); setText("");
    const history = msgs;
    setMsgs([...history, { role: "user", text: t }]);
    try {
      const a = await askGemini(apiKey, model, history, t, runTool);
      setMsgs((m) => [...m, { role: "model", text: a }]);
    } catch (e: any) { setErr(e.message || "Request failed. Check your internet connection and API key."); }
    setBusy(false);
    setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  if (!apiKey) return (
    <><Title>AI Assistant</Title>
      <Glass className="empty">Add your Google Gemini API key in <a onClick={() => go("settings")}>Settings</a> to chat. Your figures are calculated on this phone; only small tool results are sent to Google to phrase the answer.</Glass></>
  );
  return (
    <>
      <Title right={msgs.length ? <button className="link" onClick={() => setMsgs([])}>Clear</button> : undefined}>AI Assistant</Title>
      {!msgs.length && <Glass><small className="muted">Try:</small><div className="chips">{IDEAS.map((i) => <button key={i} className="chip" onClick={() => send(i)}>{i}</button>)}</div></Glass>}
      {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}
      {busy && <div className="msg model">Thinking…</div>}
      {err && <Glass className="alert">{err}</Glass>}
      <div ref={end} />
      <Glass className="composer">
        <input value={text} placeholder="Ask about your money…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(text)} />
        <button className="btn" disabled={busy} onClick={() => send(text)}>Send</button>
      </Glass>
      <small className="muted">Estimates are labelled. Not regulated financial advice.</small>
    </>
  );
}
