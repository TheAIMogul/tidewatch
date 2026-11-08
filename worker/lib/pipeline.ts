// The import pipeline. Each function is one durable Workflow step; state lives in D1 between steps.
import { mapRows, parseCsv, normEmail, normName, normPhone, normStreet, jaroWinkler, isOrg } from "./normalize";
import { decide, draft, scoreToRisk, type Question, type Meta } from "./openai";
import { signals, avatarFor, fmtDate, type Gift } from "./signals";

export const STEPS = [
  { key: "store", label: "Upload to storage", tech: "R2", detail: "Original files kept as uploaded" },
  { key: "parse", label: "Parse and normalize", tech: "Workers", detail: "Any column layout · names, emails, phones, street suffixes, dates" },
  { key: "exact", label: "Exact matches", tech: "D1", detail: "Same email or phone" },
  { key: "embed", label: "Embed names and addresses", tech: "Workers AI", detail: "bge-base-en-v1.5 · one vector per group" },
  { key: "pairs", label: "Find candidate pairs", tech: "Workers", detail: "Cosine similarity plus name and address rules" },
  { key: "judge", label: "Judge every pair", tech: "OpenAI Decisions", detail: "One predicate per pair · people approve every merge" },
  { key: "people", label: "Build donor records", tech: "D1", detail: "Cadence, lapse window, revenue at risk" },
  { key: "score", label: "Score lapse risk and channel", tech: "OpenAI Decisions", detail: "Score and choice per donor" },
  { key: "draft", label: "Draft outreach and verify", tech: "OpenAI", detail: "Draft with gpt-5.5, check every claim with Decisions" },
] as const;

type Step = { key: string; label: string; tech: string; detail: string; status: string; output?: string; ms?: number };

export async function setStep(env: Env, runId: number, key: string, patch: Partial<Step>) {
  const row = await env.DB.prepare("SELECT steps FROM runs WHERE id = ?").bind(runId).first<{ steps: string }>();
  const steps: Step[] = JSON.parse(row?.steps ?? "[]");
  const s = steps.find((x) => x.key === key);
  if (s) Object.assign(s, patch);
  await env.DB.prepare("UPDATE runs SET steps = ?, status = CASE WHEN status = 'queued' THEN 'running' ELSE status END WHERE id = ?").bind(JSON.stringify(steps), runId).run();
}

async function timed(env: Env, runId: number, key: string, fn: () => Promise<string>) {
  await setStep(env, runId, key, { status: "running" });
  const t0 = Date.now();
  try {
    const output = await fn();
    await setStep(env, runId, key, { status: "done", output, ms: Date.now() - t0 });
    return output;
  } catch (e: any) {
    await setStep(env, runId, key, { status: "error", output: String(e?.message ?? e).slice(0, 160), ms: Date.now() - t0 });
    throw e;
  }
}

async function batch(env: Env, stmts: D1PreparedStatement[], size = 80) {
  const out: D1Result[] = [];
  for (let i = 0; i < stmts.length; i += size) out.push(...(await env.DB.batch(stmts.slice(i, i + size))));
  return out;
}

// ---------- parse ----------
export const parse = (env: Env, runId: number) => timed(env, runId, "parse", async () => {
  const { results: sources } = await env.DB.prepare("SELECT id, r2_key, filename FROM sources WHERE run_id = ?").bind(runId).all<{ id: number; r2_key: string; filename: string }>();
  await env.DB.batch([env.DB.prepare("DELETE FROM gifts WHERE source_id IN (SELECT id FROM sources WHERE run_id = ?)").bind(runId), env.DB.prepare("DELETE FROM records WHERE source_id IN (SELECT id FROM sources WHERE run_id = ?)").bind(runId)]);
  let rows = 0, records = 0;
  for (const src of sources) {
    const obj = await env.FILES.get(src.r2_key);
    if (!obj) throw new Error(`missing ${src.filename}`);
    const parsed = mapRows(parseCsv(await obj.text()));
    const keyOf = (p: (typeof parsed)[number]) => `${normName(p.name)}|${normEmail(p.email)}|${normPhone(p.phone)}`;
    const uniq = new Map<string, (typeof parsed)[number]>();
    for (const p of parsed) if (!uniq.has(keyOf(p))) uniq.set(keyOf(p), p);
    const res = await batch(env, [...uniq.values()].map((p) =>
      env.DB.prepare("INSERT INTO records (source_id, name, email, phone, street, zip, nname, nemail, nphone, nstreet) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id")
        .bind(src.id, p.name, p.email || null, p.phone || null, p.street || null, p.zip || null, normName(p.name), normEmail(p.email) || null, normPhone(p.phone) || null, normStreet(p.street) || null)));
    const ids = new Map<string, number>();
    [...uniq.keys()].forEach((k, i) => ids.set(k, (res[i].results[0] as any).id));
    await batch(env, parsed.map((p, i) =>
      env.DB.prepare("INSERT INTO gifts (record_id, source_id, date, amount, status, designation, ref, row_index) VALUES (?,?,?,?,?,?,?,?)")
        .bind(ids.get(keyOf(p)), src.id, p.date, p.amount, p.status, p.designation || null, p.ref || null, i + 2)));
    await env.DB.prepare("UPDATE sources SET rows = ?, records = ? WHERE id = ?").bind(parsed.length, uniq.size, src.id).run();
    rows += parsed.length; records += uniq.size;
  }
  return `${rows} rows · ${records} records`;
});

// ---------- exact ----------
type Rec = { id: number; source_id: number; name: string; email: string | null; phone: string | null; street: string | null; zip: string | null; nname: string; nemail: string | null; nphone: string | null; nstreet: string | null; cluster_id: number | null; code?: string };

async function allRecords(env: Env, runId: number) {
  const { results } = await env.DB.prepare("SELECT r.*, s.code FROM records r JOIN sources s ON s.id = r.source_id WHERE s.run_id = ?").bind(runId).all<Rec>();
  return results;
}

export const exact = (env: Env, runId: number) => timed(env, runId, "exact", async () => {
  const recs = await allRecords(env, runId);
  const parent = new Map<number, number>(recs.map((r) => [r.id, r.id]));
  const root = (x: number): number => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  const join = (a: number, b: number) => { const ra = root(a), rb = root(b); if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb)); };
  for (const key of ["nemail", "nphone"] as const) {
    const seen = new Map<string, number>();
    for (const r of recs) { const v = r[key]; if (!v) continue; if (seen.has(v)) join(seen.get(v)!, r.id); else seen.set(v, r.id); }
  }
  await batch(env, recs.map((r) => env.DB.prepare("UPDATE records SET cluster_id = ? WHERE id = ?").bind(root(r.id), r.id)));
  const clusters = new Set(recs.map((r) => root(r.id))).size;
  return `${recs.length - clusters} merged · ${clusters} groups`;
});

// ---------- embed + pairs ----------
const STOP = new Set(["family", "fund", "the", "miami", "and", "llc", "inc", "consulting", "foundation", "group", "fam", "dr", "jr", "sr"]);
/** The family name, or for an organization the distinctive word in its name. */
const surname = (n: string) => { const t = n.split(/\s+/).filter((x) => x.length >= 2 && !STOP.has(x)); return isOrg(n) ? t[0] ?? "" : t.at(-1) ?? ""; };
const cos = (a: number[], b: number[]) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y); };

export const embedAndPair = async (env: Env, runId: number) => {
  const recs = await allRecords(env, runId);
  const groups = new Map<number, Rec[]>();
  for (const r of recs) { const g = groups.get(r.cluster_id!) ?? []; g.push(r); groups.set(r.cluster_id!, g); }
  const ids = [...groups.keys()];
  const text = ids.map((id) => { const g = groups.get(id)!; const r = g.find((x) => x.street) ?? g[0]; return `${r.name}; ${r.street ?? ""}; ${r.zip ?? ""}`; });
  const vecs: number[][] = [];
  await timed(env, runId, "embed", async () => {
    for (let i = 0; i < text.length; i += 100) {
      const res: any = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: text.slice(i, i + 100) });
      vecs.push(...res.data);
    }
    return `${vecs.length} vectors · ${vecs[0]?.length ?? 0} dims`;
  });
  return timed(env, runId, "pairs", async () => {
    await env.DB.prepare("DELETE FROM candidates").run();
    const pairs: D1PreparedStatement[] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const A = groups.get(ids[i])!, B = groups.get(ids[j])!;
      const sa = new Set(A.map((r) => surname(r.nname)).filter((x) => x.length >= 3));
      const shared = [...new Set(B.map((r) => surname(r.nname)))].filter((x) => sa.has(x));
      const sim = cos(vecs[i], vecs[j]);
      const sameStreet = A.some((a) => a.nstreet && B.some((b) => b.nstreet === a.nstreet));
      const sameZip = A.some((a) => a.zip && B.some((b) => b.zip === a.zip));
      const firstA = new Set(A.map((r) => r.nname[0])), initial = B.some((r) => firstA.has(r.nname[0]));
      const jw = Math.max(...A.flatMap((a) => B.map((b) => jaroWinkler(a.nname, b.nname))));
      const org = A.some((r) => isOrg(r.name)) || B.some((r) => isOrg(r.name));
      const hit = (shared.length && (initial || sameStreet || org)) || sim >= 0.95;
      if (!hit) continue;
      pairs.push(env.DB.prepare("INSERT INTO candidates (a_cluster, b_cluster, similarity, signals, status) VALUES (?,?,?,?, 'new')")
        .bind(ids[i], ids[j], sim, JSON.stringify({ shared, sameStreet, sameZip, initial, jw: +jw.toFixed(3), cosine: +sim.toFixed(3) })));
    }
    await batch(env, pairs);
    return `${pairs.length} pairs from ${ids.length} groups`;
  });
};

// ---------- judge ----------
async function recordSummaries(env: Env, clusterIds: number[]) {
  const out = new Map<number, any[]>();
  for (const cid of clusterIds) {
    const { results } = await env.DB.prepare(
      "SELECT r.id, s.label AS source, r.name, r.email, r.phone, r.street, r.zip, (SELECT json_group_array(json_object('date', g.date, 'amount', g.amount)) FROM gifts g WHERE g.record_id = r.id) AS gifts FROM records r JOIN sources s ON s.id = r.source_id WHERE r.cluster_id = ?"
    ).bind(cid).all<any>();
    out.set(cid, results.map((r) => ({ ...r, gifts: JSON.parse(r.gifts) })));
  }
  return out;
}

export const judge = (env: Env, runId: number) => timed(env, runId, "judge", async () => {
  const { results: cands } = await env.DB.prepare("SELECT * FROM candidates WHERE status = 'new'").all<any>();
  if (!cands.length) return "0 pairs";
  const sums = await recordSummaries(env, [...new Set(cands.flatMap((c) => [c.a_cluster, c.b_cluster]))]);
  const slim = (rs: any[] | undefined) => (rs ?? []).map((r) => ({ source: r.source, name: r.name, email: r.email, phone: r.phone, street: r.street, zip: r.zip, gifts: r.gifts.map((g: any) => `${g.date} $${g.amount}`) }));
  const context = "You are deduplicating donor records for a Miami nonprofit. The records come from different exports (online giving, event tickets, a gala auction, typed-in paper checks), so the same donor often appears with a nickname, an initial, a different email, or a street written another way. Different people often share a common surname or a first name. Judge each pair on its own evidence.";
  const qs: Question[] = cands.map((c: any, i: number) => ({ type: "predicate", name: `pair_${i}`,
    instructions: `Are these two groups of records the same donor (the same person, household, or organization)?\nGroup A: ${JSON.stringify(slim(sums.get(c.a_cluster)))}\nGroup B: ${JSON.stringify(slim(sums.get(c.b_cluster)))}` }));
  const meta: Meta[] = cands.map((c: any) => ({ kind: "merge", label: "Same donor?", subject: [...new Set([...(sums.get(c.a_cluster) ?? []), ...(sums.get(c.b_cluster) ?? [])].map((r: any) => r.name))].join(" × "), ref_id: c.id }));
  const ans = await decide(env, runId, context, qs, meta);
  let pending = 0, dismissed = 0;
  await batch(env, cands.map((c, i) => {
    const p = ans[i].probability ?? 0;
    // Machines merge only on a shared email or phone (the exact step). Every AI suggestion goes to a person.
    const status = p >= 0.3 ? "pending" : "dismissed";
    if (status === "pending") pending++; else dismissed++;
    return env.DB.prepare("UPDATE candidates SET probability = ?, status = ? WHERE id = ?").bind(p, status, c.id);
  }));
  return `${pending} to review · ${dismissed} ruled out`;
});

// ---------- people ----------
export async function rebuildDonor(env: Env, donorId: number) {
  const { results: recs } = await env.DB.prepare("SELECT r.*, s.code, s.label, (SELECT COUNT(*) FROM gifts g WHERE g.record_id = r.id) AS n FROM records r JOIN sources s ON s.id = r.source_id WHERE r.donor_id = ?").bind(donorId).all<any>();
  const { results: gifts } = await env.DB.prepare("SELECT g.date, g.amount, g.status, g.designation, s.code FROM gifts g JOIN records r ON r.id = g.record_id JOIN sources s ON s.id = g.source_id WHERE r.donor_id = ?").bind(donorId).all<Gift>();
  const s = signals(gifts, env.TODAY, env.GMD_DATE);
  const name = recs.map((r) => r.name).sort((a: string, b: string) => b.length - a.length || a.localeCompare(b))[0] ?? "Unknown";
  // Prefer the value from the records with the most gifts behind them.
  const pick = (k: string) => { const c = new Map<string, number>(); for (const r of recs) if (r[k]) c.set(r[k], (c.get(r[k]) ?? 0) + 1 + r.n); return [...c].sort((a, b) => b[1] - a[1]).map((x) => x[0]); };
  const emails = pick("email"), streets = pick("street");
  const org = isOrg(name);
  await env.DB.prepare(`UPDATE donors SET name=?, email=?, alt_emails=?, phone=?, street=?, zip=?, avatar=?, is_org=?, records=?, sources=?, pattern=?, state=?, expected=?, at_risk=?, lifetime=?, gift_count=?, first_gift=?, last_gift=?, last_amount=?, failed=?, years=?, loyalty=?, designation=?, reason=? WHERE id=?`)
    .bind(name, emails[0] ?? null, JSON.stringify(emails.slice(1)), pick("phone")[0] ?? null, streets[0] ?? null, pick("zip")[0] ?? null, avatarFor(name, donorId, org), org ? 1 : 0, recs.length,
      JSON.stringify([...new Set(recs.map((r: any) => r.code))]), s.pattern, s.state, s.expected, s.at_risk, s.lifetime, s.gift_count, s.first_gift, s.last_gift, s.last_amount, s.failed, s.years, s.loyalty, s.designation, s.reason, donorId).run();
  return s;
}

export async function rerank(env: Env) {
  await env.DB.prepare("UPDATE donors SET rank = (SELECT COUNT(*) + 1 FROM donors d2 WHERE d2.lifetime > donors.lifetime)").run();
}

export const people = (env: Env, runId: number) => timed(env, runId, "people", async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM donors"), env.DB.prepare("UPDATE records SET donor_id = NULL")]);
  const recs = await allRecords(env, runId);
  const { results: merged } = await env.DB.prepare("SELECT a_cluster, b_cluster FROM candidates WHERE status = 'merged'").all<any>();
  const parent = new Map<number, number>(); const root = (x: number): number => { const p = parent.get(x) ?? x; if (p === x) return x; const r = root(p); parent.set(x, r); return r; };
  for (const m of merged) { const a = root(m.a_cluster), b = root(m.b_cluster); if (a !== b) parent.set(Math.max(a, b), Math.min(a, b)); }
  const groups = new Map<number, number[]>();
  for (const r of recs) { const g = root(r.cluster_id!); groups.set(g, [...(groups.get(g) ?? []), r.id]); }
  const ins = await batch(env, [...groups.keys()].map(() => env.DB.prepare("INSERT INTO donors (name) VALUES ('') RETURNING id")));
  const donorIds = ins.map((r) => (r.results[0] as any).id as number);
  const upd: D1PreparedStatement[] = [];
  [...groups.values()].forEach((ids, i) => ids.forEach((rid) => upd.push(env.DB.prepare("UPDATE records SET donor_id = ? WHERE id = ?").bind(donorIds[i], rid))));
  await batch(env, upd);
  let lapsing = 0, atRisk = 0;
  for (const id of donorIds) { const s = await rebuildDonor(env, id); if (s.state === "due" || s.state === "late") { lapsing++; atRisk += s.at_risk; } }
  await rerank(env);
  return `${donorIds.length} donors · ${lapsing} lapsing · $${Math.round(atRisk).toLocaleString("en-US")} at risk`;
});

// ---------- score ----------
export const LAPSE_LEVELS = [
  { label: "On schedule", description: "Giving is current, or the next expected gift is not due yet and nothing suggests a problem." },
  { label: "Some risk", description: "The pattern is thin or a little irregular, but nothing has clearly been missed." },
  { label: "Likely to lapse", description: "An expected gift is due soon with no sign of it, or the pattern is weakening." },
  { label: "Lapsed", description: "An expected gift has already been missed, or recurring payments are failing." },
];
const CHANNELS = [
  { value: "phone", description: "A personal phone call. Best for loyal or larger donors with a phone number on file." },
  { value: "email", description: "A short personal email. Best when there is an email and no phone, or for smaller online givers." },
  { value: "letter", description: "A handwritten letter. Best for check givers with only a mailing address." },
];

export async function donorFacts(env: Env, donorIds: number[]) {
  const out: any[] = [];
  for (const id of donorIds) {
    const d = await env.DB.prepare("SELECT * FROM donors WHERE id = ?").bind(id).first<any>();
    const { results: gifts } = await env.DB.prepare("SELECT g.date, g.amount, g.status, g.designation, s.label AS source FROM gifts g JOIN records r ON r.id = g.record_id JOIN sources s ON s.id = g.source_id WHERE r.donor_id = ? ORDER BY g.date DESC LIMIT 14").bind(id).all<any>();
    const ok = gifts.filter((g: any) => g.status === "ok").map((g: any) => Date.parse(g.date)).sort((a: number, b: number) => a - b);
    const gaps = ok.slice(1).map((t: number, i: number) => Math.round((t - ok[i]) / 864e5)).sort((a: number, b: number) => a - b);
    const today = Date.parse(env.TODAY);
    out.push({ id, name: d.name, pattern: d.pattern, status_from_rules: d.state, expected_gift_date: d.expected,
      expected_gift_passed: d.expected ? Date.parse(d.expected) < today : null,
      days_since_last_gift: ok.length ? Math.round((today - ok.at(-1)!) / 864e5) : null, usual_days_between_gifts: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
      failed_payments_since_last_gift: d.failed, has_email: !!d.email, has_phone: !!d.phone, has_mailing_address: !!d.street, lifetime: d.lifetime, gifts });
  }
  return out;
}

export async function scoreDonors(env: Env, runId: number | null, donorIds: number[]) {
  const facts = await donorFacts(env, donorIds);
  const context = `You help a Miami nonprofit keep its regular donors. Today is ${env.TODAY}. Give Miami Day, the city's biggest giving day, is ${env.GMD_DATE}. Each question includes one donor's giving history and facts computed from it.`;
  const qs: Question[] = []; const meta: Meta[] = [];
  facts.forEach((f, i) => {
    const { id: _id, ...donor } = f;
    qs.push({ type: "score", name: `lapse_${i}`, instructions: `How likely is this donor to miss their next expected gift unless someone reaches out personally?\nDonor: ${JSON.stringify(donor)}`, levels: LAPSE_LEVELS });
    meta.push({ kind: "lapse", label: "Lapse risk", subject: f.name, ref_id: f.id });
    qs.push({ type: "choice", name: `channel_${i}`, instructions: `What is the best way for staff to reach this donor this week?\nDonor: ${JSON.stringify(donor)}`, choices: CHANNELS });
    meta.push({ kind: "channel", label: "Best channel", subject: f.name, ref_id: f.id });
  });
  const ans = await decide(env, runId, context, qs, meta);
  await batch(env, facts.map((f, i) => {
    const lapse = ans[i * 2], ch = ans[i * 2 + 1];
    const risk = lapse.type === "score" ? scoreToRisk(lapse, LAPSE_LEVELS.length) : null;
    const label = lapse.probabilities?.reduce((m, p) => (p.probability > m.probability ? p : m))?.label ?? null;
    return env.DB.prepare("UPDATE donors SET risk = ?, risk_label = ?, channel = ? WHERE id = ?").bind(risk, label, ch.choice ?? null, f.id);
  }));
  return facts.length;
}

export const score = (env: Env, runId: number) => timed(env, runId, "score", async () => {
  const { results } = await env.DB.prepare("SELECT id FROM donors WHERE gift_count > 0 ORDER BY lifetime DESC").all<{ id: number }>();
  const n = await scoreDonors(env, runId, results.map((r) => r.id));
  return `${n} donors · ${n * 2} questions`;
});

// ---------- draft ----------
const DRAFT_RULES = (env: Env) => `You write short, warm notes from ${env.STAFF_NAME} at ${env.ORG_NAME}, a Miami nonprofit that helps kids and families through mentoring, family counseling and school workshops. The note is a script for a phone call that can also be sent as an email.
Use only the facts in the record. Never invent amounts, dates, programs, outcomes or history. If a fact is not in the record, leave it out.
Under 85 words. Plain, human words. No exclamation marks, no emojis, no subject line, no placeholders.
Start with "Hi <first name>," (for an organization, or when the record has only an initial, use the name exactly as written). End with a line "${env.STAFF_NAME} · ${env.ORG_NAME}".`;

export async function draftFor(env: Env, runId: number | null, donorId: number) {
  const [f] = await donorFacts(env, [donorId]);
  const facts = {
    organization: { name: env.ORG_NAME, mission: "Helps Miami-Dade kids and their families through mentoring, family counseling, and safety and mental health workshops in schools.", staff: env.STAFF_NAME },
    name: f.name, pattern: f.pattern, situation: f.status_from_rules === "due" ? "expected gift is coming up and has not arrived" : "expected gift was missed or payments are failing",
    expected_gift: f.expected_gift_date, failed_payments: f.failed_payments_since_last_gift, today: env.TODAY, give_miami_day: env.GMD_DATE,
    gifts: f.gifts.filter((g: any) => g.status === "ok").map((g: any) => ({ date: g.date, amount: g.amount, source: g.source, designation: g.designation })),
  };
  const out = await draft(env, runId, DRAFT_RULES(env), JSON.stringify(facts));
  return { facts, ...out };
}

export async function checkDrafts(env: Env, runId: number | null, items: { donorId: number; name: string; facts: any; text: string }[]) {
  const context = "You check outreach notes written by an AI for a nonprofit before staff use them. A note may only state facts found in the donor's record. Greetings, thanks, and invitations to give are fine.";
  const qs: Question[] = items.map((x, i) => ({ type: "predicate", name: `check_${i}`, instructions: `Does this note state any fact (an amount, date, program, outcome, or piece of history) that is not supported by the record?\nRecord: ${JSON.stringify(x.facts)}\nNote: ${JSON.stringify(x.text)}` }));
  const ans = await decide(env, runId, context, qs, items.map((x) => ({ kind: "draft_check", label: "Claims not in record?", subject: x.name, ref_id: x.donorId })));
  return ans.map((a) => a.probability ?? null);
}

export const drafts = (env: Env, runId: number) => timed(env, runId, "draft", async () => {
  await env.DB.prepare("DELETE FROM outreach").run();
  const { results } = await env.DB.prepare("SELECT id, name FROM donors WHERE state IN ('due','late') ORDER BY at_risk DESC LIMIT 12").all<{ id: number; name: string }>();
  const items: { donorId: number; name: string; facts: any; text: string; tin: number; tout: number }[] = [];
  for (let i = 0; i < results.length; i += 4) {
    const chunk = await Promise.all(results.slice(i, i + 4).map(async (d) => ({ donorId: d.id, name: d.name, ...(await draftFor(env, runId, d.id)) })));
    items.push(...chunk);
  }
  const checks = items.length ? await checkDrafts(env, runId, items) : [];
  await batch(env, items.map((x, i) => env.DB.prepare("INSERT INTO outreach (donor_id, draft, facts, check_p, model, tokens_in, tokens_out, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(x.donorId, x.text, JSON.stringify(x.facts), checks[i], "gpt-5.5", x.tin, x.tout, new Date().toISOString())));
  const flagged = checks.filter((p) => (p ?? 0) >= 0.5).length;
  return `${items.length} notes · ${flagged} flagged`;
});

export async function finish(env: Env, runId: number) {
  await env.DB.prepare("UPDATE runs SET status = 'done', finished_at = ? WHERE id = ?").bind(new Date().toISOString(), runId).run();
}

export function fmt(d: string | null) { return d ? fmtDate(d) : ""; }
