// OpenAI Decisions (judgments) and Responses (drafting), with every call logged.

export const DECISIONS_MODEL = "gpt-6-luna";
export const DRAFT_MODEL = "gpt-5.5";
const DECISION_IN = 0.10 / 1e6;               // $ per input token, output is free
const DRAFT_IN = 5 / 1e6, DRAFT_OUT = 30 / 1e6; // gpt-5.5 list price

export type Question =
  | { type: "predicate"; name: string; instructions: string }
  | { type: "choice"; name: string; instructions: string; choices: { value: string; description: string }[] }
  | { type: "score"; name: string; instructions: string; levels: { label: string; description: string }[] };

export interface Answer {
  type: string; name: string;
  probability?: number;
  choice?: string; score?: number; confidence?: number;
  probabilities?: { value: string | number; label?: string; probability: number }[];
}

export interface Meta { kind: string; subject: string; ref_id?: number; label?: string }

const now = () => new Date().toISOString();

/** Ask up to 400 typed questions about one JSON state. Logs every question to D1. */
export async function decide(env: Env, runId: number | null, context: string, questions: Question[], meta: Meta[]): Promise<Answer[]> {
  const out: Answer[] = [];
  for (let i = 0; i < questions.length; i += 400) {
    const qs = questions.slice(i, i + 400), ms = meta.slice(i, i + 400);
    const t0 = Date.now();
    const res = await fetch("https://api.openai.com/v1/decisions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: DECISIONS_MODEL, input: context, questions: qs }),
    });
    const body: any = await res.json();
    if (!res.ok) throw new Error(`Decisions ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    const latency = Date.now() - t0;
    const tokens: number = body.usage?.input_tokens ?? 0;
    const per = Math.max(1, qs.length);
    const answers: Answer[] = body.answers ?? [];
    const byName = new Map(answers.map((a) => [a.name, a]));
    const stmts = qs.map((q, k) => {
      const a = byName.get(q.name);
      const ans = !a ? "refusal" : a.type === "predicate" ? (a.probability ?? 0).toFixed(2) : a.type === "choice" ? a.choice ?? "" : (a.probabilities?.reduce((m, p) => (p.probability > m.probability ? p : m))?.label ?? "");
      const p = !a ? null : a.type === "predicate" ? a.probability ?? null : a.type === "score" ? scoreToRisk(a, (q as any).levels?.length ?? 4) : a.confidence ?? null;
      return env.DB.prepare(
        "INSERT INTO decisions (run_id, kind, qtype, question, subject, ref_id, answer, probability, latency_ms, tokens, cost, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(runId, ms[k].kind, q.type, (ms[k].label ?? q.instructions).replace(/\s+/g, " ").trim().slice(0, 240), ms[k].subject, ms[k].ref_id ?? null, ans, p, latency, Math.round(tokens / per), (tokens * DECISION_IN) / per, now());
    });
    for (let s = 0; s < stmts.length; s += 50) await env.DB.batch(stmts.slice(s, s + 50));
    if (runId) await env.DB.prepare("UPDATE runs SET questions = questions + ?, decision_tokens = decision_tokens + ?, cost = cost + ? WHERE id = ?").bind(qs.length, tokens, tokens * DECISION_IN, runId).run();
    out.push(...qs.map((q) => byName.get(q.name) ?? { type: "refusal", name: q.name }));
  }
  return out;
}

/** Expected level, scaled 0..1. */
export function scoreToRisk(a: Answer, levels: number) {
  if (typeof a.score === "number") return Math.max(0, Math.min(1, a.score / (levels - 1)));
  const ps = a.probabilities ?? [];
  return ps.reduce((s, p) => s + Number(p.value) * p.probability, 0) / (levels - 1);
}

export async function draft(env: Env, runId: number | null, instructions: string, input: string) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: DRAFT_MODEL, instructions, input, reasoning: { effort: "low" }, max_output_tokens: 1200 }),
  });
  const body: any = await res.json();
  if (!res.ok) throw new Error(`Responses ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  const text = (body.output ?? []).filter((o: any) => o.type === "message").flatMap((o: any) => o.content ?? []).map((c: any) => c.text ?? "").join("").trim();
  const tin = body.usage?.input_tokens ?? 0, tout = body.usage?.output_tokens ?? 0;
  if (runId) await env.DB.prepare("UPDATE runs SET draft_in = draft_in + ?, draft_out = draft_out + ?, cost = cost + ? WHERE id = ?").bind(tin, tout, tin * DRAFT_IN + tout * DRAFT_OUT, runId).run();
  return { text, tin, tout };
}
