import { TOOL_DECLS } from "./tools";

export interface Msg { role: "user" | "model"; text: string }
const SYSTEM = `You are a personal-finance assistant inside a budgeting app, for organisation and education only (not regulated financial advice).
Rules: get every number by calling the provided tools; never calculate, guess or invent figures. Say whether a figure is historical, current or an estimate, and state the assumptions the tool returns. Expected (unconfirmed) income is never received income. Never promise returns or outcomes. If data is missing, say so. Keep answers short.`;

export async function askGemini(apiKey: string, model: string, history: Msg[], text: string, run: (n: string, a: any) => Promise<any>): Promise<string> {
  const contents: any[] = [...history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })), { role: "user", parts: [{ text }] }];
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, tools: [{ functionDeclarations: TOOL_DECLS }], contents }),
    });
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const content = (await res.json()).candidates?.[0]?.content;
    if (!content) throw new Error("Gemini returned no content.");
    const calls = (content.parts || []).filter((p: any) => p.functionCall);
    if (!calls.length) return (content.parts || []).map((p: any) => p.text || "").join("").trim() || "(no answer)";
    contents.push(content);
    const parts = [];
    for (const c of calls) {
      let result: any;
      try { result = await run(c.functionCall.name, c.functionCall.args || {}); } catch (e: any) { result = { error: String(e.message || e) }; }
      parts.push({ functionResponse: { name: c.functionCall.name, response: { result } } });
    }
    contents.push({ role: "user", parts });
  }
  return "I couldn't finish that. Please rephrase the question.";
}
