import { Hono } from "hono";
import type * as T from "./api-types";
import { STEPS, rebuildDonor, rerank, scoreDonors, draftFor, checkDrafts } from "./lib/pipeline";
import { sourceMeta, parseCsv, jaroWinkler, normStreet } from "./lib/normalize";
import { DECISIONS_MODEL } from "./lib/openai";
import { runPipeline } from "./workflow";

export { ImportWorkflow } from "./workflow";

const app = new Hono<{ Bindings: Env }>().basePath("/api");
const now = () => new Date().toISOString();

app.onError((err, c) => { console.error(err); return c.json({ error: String(err?.message ?? err) }, 500); });

// ---------- state ----------
async function totals(env: Env): Promise<T.Totals> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS q, COALESCE(AVG(latency_ms),0) AS l, COALESCE(SUM(cost),0) AS c FROM decisions").first<any>();
  return { questions: r.q, avgLatency: Math.round(r.l), cost: r.c };
}

app.get("/state", async (c) => {
  const env = c.env;
  const runRow = await env.DB.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 1").first<any>();
  const run: T.Run | null = runRow ? { ...runRow, steps: JSON.parse(runRow.steps) } : null;
  const { results: sources } = runRow ? await env.DB.prepare("SELECT id, filename, label, code, bytes, rows, records FROM sources WHERE run_id = ? ORDER BY id").bind(runRow.id).all<T.Source>() : { results: [] as T.Source[] };
  const s = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM records) AS records,
      (SELECT COUNT(DISTINCT cluster_id) FROM records WHERE cluster_id IS NOT NULL) AS clusters,
      (SELECT COUNT(*) FROM donors) AS donors,
      (SELECT COUNT(*) FROM candidates WHERE status = 'merged') AS merged,
      (SELECT COUNT(*) FROM candidates WHERE status = 'pending') AS pending,
      (SELECT COUNT(*) FROM donors WHERE state IN ('due','late')) AS lapsing,
      (SELECT COALESCE(SUM(at_risk),0) FROM donors WHERE state IN ('due','late')) AS at_risk,
      (SELECT MIN(date) FROM gifts WHERE status = 'ok') AS first_gift,
      (SELECT MAX(date) FROM gifts WHERE status = 'ok') AS last_gift`).first<any>();
  const summary: T.Summary = {
    sources: sources.length, rows: sources.reduce((a, x) => a + x.rows, 0), records: s.records, donors: s.donors,
    duplicates: s.donors ? s.records - s.donors : 0, exactMerged: s.clusters ? s.records - s.clusters : 0,
    autoMerged: s.merged, needReview: s.pending, lapsing: s.lapsing, atRisk: s.at_risk, firstGift: s.first_gift, lastGift: s.last_gift,
  };
  return c.json<T.StateResp>({ run, summary, sources, decisions: await totals(env), today: env.TODAY, gmdDate: env.GMD_DATE, org: env.ORG_NAME, staff: env.STAFF_NAME });
});

app.get("/decisions", async (c) => {
  const limit = Math.min(100, +(c.req.query("limit") ?? 20));
  const { results } = await c.env.DB.prepare("SELECT id, kind, qtype, question, subject, ref_id, answer, probability, latency_ms, cost, created_at FROM decisions ORDER BY id DESC LIMIT ?").bind(limit).all<T.Decision>();
  return c.json<T.DecisionsResp>({ items: results, totals: await totals(c.env) });
});

// ---------- helpers ----------
const firstName = (n: string) => n.replace(/^(dr|mr|mrs|ms)\.?\s+/i, "").replace(/^the\s+/i, "").split(/\s+/)[0].replace(/\.$/, "");

async function clusterRecords(env: Env, clusterIds: number[]) {
  const out: (T.CandRecord & { cluster: number; donor_id: number | null })[] = [];
  for (const [i, cid] of clusterIds.entries()) {
    const { results } = await env.DB.prepare(`SELECT r.id, r.cluster_id, r.donor_id, s.code, s.label AS source, r.name, r.email, r.phone, r.street, r.zip,
        (SELECT COUNT(*) FROM gifts g WHERE g.record_id = r.id AND g.status = 'ok') AS gifts,
        (SELECT COALESCE(SUM(amount),0) FROM gifts g WHERE g.record_id = r.id AND g.status = 'ok') AS total,
        (SELECT MIN(date) FROM gifts g WHERE g.record_id = r.id AND g.status = 'ok') AS first,
        (SELECT MAX(date) FROM gifts g WHERE g.record_id = r.id AND g.status = 'ok') AS last
      FROM records r JOIN sources s ON s.id = r.source_id WHERE r.cluster_id = ? ORDER BY s.id`).bind(cid).all<any>();
    for (const r of results) out.push({ ...r, side: i === 0 ? "a" : "b", cluster: cid });
  }
  return out;
}

async function addNote(env: Env, donorId: number, kind: T.Note["kind"], body: string): Promise<T.Note> {
  const createdAt = now();
  const r = await env.DB.prepare("INSERT INTO donor_notes (donor_id, author, kind, body, created_at) VALUES (?,?,?,?,?) RETURNING id").bind(donorId, env.STAFF_NAME, kind, body, createdAt).first<{ id: number }>();
  return { id: r!.id, donorId, author: env.STAFF_NAME, kind, body, createdAt };
}

async function donorById(env: Env, id: number) { return env.DB.prepare("SELECT * FROM donors WHERE id = ?").bind(id).first<any>(); }

async function candidate(env: Env, row: any): Promise<T.Cand> {
  const recs = await clusterRecords(env, [row.a_cluster, row.b_cluster]);
  const donor = recs[0]?.donor_id ? await donorById(env, recs[0].donor_id) : null;
  const name = donor?.name ?? recs.map((r) => r.name).sort((a, b) => b.length - a.length)[0] ?? "Unknown";
  return {
    id: row.id, probability: row.probability, status: row.status, decidedBy: row.decided_by, name, avatar: donor?.avatar ?? "",
    codes: [...new Set(recs.map((r) => r.code))] as T.Code[], records: recs.map(({ cluster, donor_id, ...r }) => r),
  };
}

function cadence(gifts: { date: string; status: string }[], state: string, expected: string | null, today: string): T.Cell[] {
  const t = new Date(today + "T00:00:00Z"); const cells: T.Cell[] = [];
  const okMonths = new Set(gifts.filter((g) => g.status === "ok").map((g) => g.date.slice(0, 7)));
  const badMonths = new Set(gifts.filter((g) => g.status === "declined").map((g) => g.date.slice(0, 7)));
  const lastOk = [...okMonths].sort().at(-1) ?? "";
  const lapsing = state === "due" || state === "late";
  const monthly = lapsing && expected && lastOk && (Date.parse(expected) - Date.parse(lastOk + "-01")) < 45 * 864e5;
  for (let k = 11; k >= 0; k--) {
    const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - k, 1)); const ym = d.toISOString().slice(0, 7);
    if (okMonths.has(ym)) cells.push("on");
    else if (badMonths.has(ym)) cells.push("miss");
    else if (lapsing && expected && expected.slice(0, 7) === ym) cells.push("miss");
    else if (monthly && ym > lastOk) cells.push("miss");
    else if (k === 0) cells.push("fut");
    else cells.push("off");
  }
  return cells;
}

async function outreachStatus(env: Env, donorId: number): Promise<T.CallItem["outreach"]> {
  const o = await env.DB.prepare("SELECT status, check_p FROM outreach WHERE donor_id = ? ORDER BY id DESC LIMIT 1").bind(donorId).first<any>();
  if (!o) return "none"; if (o.status === "called") return "called"; return (o.check_p ?? 0) >= 0.5 ? "flagged" : "ready";
}

async function donorGifts(env: Env, donorId: number) {
  const { results } = await env.DB.prepare("SELECT g.date, g.amount, g.status, g.designation, g.ref, s.code, s.label AS source FROM gifts g JOIN records r ON r.id = g.record_id JOIN sources s ON s.id = g.source_id WHERE r.donor_id = ? ORDER BY g.date DESC").bind(donorId).all<any>();
  return results;
}

function rowOf(d: any): T.DonorRow {
  return { id: d.id, name: d.name, avatar: d.avatar ?? "", isOrg: !!d.is_org, records: d.records, sources: JSON.parse(d.sources ?? "[]"), pattern: d.pattern, state: d.state, lifetime: d.lifetime, lastGift: d.last_gift, risk: d.risk, rank: d.rank };
}

// ---------- flow ----------
app.get("/flow", async (c) => {
  const env = c.env; const groups: T.FlowGroup[] = [];
  const lastAmt = async (recordId: number) => (await env.DB.prepare("SELECT amount FROM gifts WHERE record_id = ? AND status = 'ok' ORDER BY date DESC LIMIT 1").bind(recordId).first<any>())?.amount ?? 0;
  const action = async (donorId: number | null): Promise<T.FlowGroup["action"]> => {
    if (!donorId) return null; const d = await donorById(env, donorId); if (!d) return null;
    const lapsing = d.state === "due" || d.state === "late";
    return { donorId, label: lapsing ? (d.failed ? `Fix ${firstName(d.name)}'s card` : `Call ${firstName(d.name)}`) : `Thank ${firstName(d.name)} once`, amount: lapsing ? d.at_risk : d.lifetime, risk: d.risk };
  };
  const { results: pend } = await env.DB.prepare("SELECT * FROM candidates WHERE status = 'pending' ORDER BY probability DESC").all<any>();
  const cands = await Promise.all(pend.map((p) => candidate(env, p)));
  cands.sort((a, b) => b.records.length - a.records.length || (b.probability ?? 0) - (a.probability ?? 0));
  const fromCand = async (cand: T.Cand, kind: T.FlowGroup["kind"]): Promise<T.FlowGroup> => {
    const recs = cand.records.slice(0, 3);
    const donor = await env.DB.prepare("SELECT donor_id FROM records WHERE id = ?").bind(cand.records[0].id).first<any>();
    return {
      kind, candidateId: cand.id,
      records: await Promise.all(recs.map(async (r) => ({ code: r.code, name: r.name, amount: await lastAmt(r.id) }))),
      person: { donorId: donor?.donor_id ?? null, name: cand.name, avatar: cand.avatar, count: cand.records.length, probability: cand.probability },
      action: await action(donor?.donor_id ?? null),
    };
  };
  if (cands[0]) groups.push(await fromCand(cands[0], "review"));
  // auto: a donor assembled from several sources with no review pending
  const auto = await env.DB.prepare(`SELECT d.id FROM donors d WHERE d.records >= 2 AND json_array_length(d.sources) >= 2
      AND d.id NOT IN (SELECT r.donor_id FROM records r JOIN candidates c ON (c.a_cluster = r.cluster_id OR c.b_cluster = r.cluster_id) WHERE c.status = 'pending' AND r.donor_id IS NOT NULL)
      ORDER BY (d.state IN ('due','late')) DESC, d.at_risk DESC, d.lifetime DESC LIMIT 1`).first<any>();
  if (auto) {
    const d = await donorById(env, auto.id);
    const { results: recs } = await env.DB.prepare("SELECT r.id, r.name, s.code FROM records r JOIN sources s ON s.id = r.source_id WHERE r.donor_id = ? ORDER BY s.id LIMIT 3").bind(auto.id).all<any>();
    const cand = await env.DB.prepare("SELECT probability FROM candidates WHERE status = 'merged' AND (a_cluster IN (SELECT cluster_id FROM records WHERE donor_id = ?1) OR b_cluster IN (SELECT cluster_id FROM records WHERE donor_id = ?1)) ORDER BY probability DESC LIMIT 1").bind(auto.id).first<any>();
    groups.push({ kind: "auto", candidateId: null, records: await Promise.all(recs.map(async (r: any) => ({ code: r.code, name: r.name, amount: await lastAmt(r.id) }))),
      person: { donorId: d.id, name: d.name, avatar: d.avatar ?? "", count: d.records, probability: cand?.probability ?? 1 }, action: await action(d.id) });
  }
  if (cands[1]) groups.push(await fromCand(cands[1], "pending"));
  return c.json<T.FlowResp>({ groups });
});

// ---------- calls ----------
app.get("/calls", async (c) => {
  const env = c.env;
  const { results } = await env.DB.prepare("SELECT * FROM donors WHERE state IN ('due','late') ORDER BY at_risk DESC").all<any>();
  const items: T.CallItem[] = [];
  for (const d of results) {
    const gifts = await donorGifts(env, d.id);
    items.push({ donorId: d.id, name: d.name, avatar: d.avatar ?? "", isOrg: !!d.is_org, records: d.records, pattern: d.pattern, reason: d.reason, state: d.state,
      cadence: cadence(gifts, d.state, d.expected, env.TODAY), lastGift: d.last_gift, risk: d.risk, riskLabel: d.risk_label, atRisk: d.at_risk, outreach: await outreachStatus(env, d.id) });
  }
  return c.json<T.CallsResp>({ items });
});

// ---------- candidates ----------
app.get("/candidates", async (c) => {
  const status = c.req.query("status") ?? "pending";
  const { results } = await c.env.DB.prepare("SELECT * FROM candidates WHERE status = ? ORDER BY probability DESC").bind(status).all<any>();
  const counts = await c.env.DB.prepare("SELECT SUM(status='pending') AS pending, SUM(status='merged') AS merged, SUM(status='kept') AS kept, SUM(status='dismissed') AS dismissed FROM candidates").first<any>();
  const items = await Promise.all(results.map((r) => candidate(c.env, r)));
  return c.json<T.CandsResp>({ items, counts: { pending: counts.pending ?? 0, merged: counts.merged ?? 0, kept: counts.kept ?? 0, dismissed: counts.dismissed ?? 0 } });
});

app.get("/candidates/:id", async (c) => {
  const env = c.env;
  const row = await env.DB.prepare("SELECT * FROM candidates WHERE id = ?").bind(+c.req.param("id")).first<any>();
  if (!row) return c.json({ error: "not found" }, 404);
  const cand = await candidate(env, row);
  const A = cand.records.filter((r) => r.side === "a"), B = cand.records.filter((r) => r.side === "b");
  const ev: { ok: boolean; text: string }[] = [];
  const streetA = A.find((r) => r.street), streetB = B.find((r) => r.street && streetA && normStreet(r.street!) === normStreet(streetA.street!));
  if (streetA && streetB) ev.push({ ok: true, text: streetA.street === streetB.street ? `Same street address · ${streetA.street}` : `Street matches · ${streetA.street} = ${streetB.street}` });
  const emailsA = new Set(A.map((r) => r.email?.toLowerCase()).filter(Boolean)), emailsB = B.map((r) => r.email?.toLowerCase()).filter(Boolean);
  if (emailsB.some((e) => emailsA.has(e))) ev.push({ ok: true, text: "Same email" });
  else if (emailsA.size && emailsB.length) ev.push({ ok: false, text: "Different emails" });
  const phonesA = new Set(A.map((r) => r.phone?.replace(/\D/g, "")).filter(Boolean));
  if (B.some((r) => r.phone && phonesA.has(r.phone.replace(/\D/g, "")))) ev.push({ ok: true, text: "Same phone" });
  const zipA = new Set(A.map((r) => r.zip).filter(Boolean)); const zipHit = B.find((r) => r.zip && zipA.has(r.zip));
  if (zipHit) ev.push({ ok: true, text: `Same ZIP · ${zipHit.zip}` });
  const jw = Math.max(...A.flatMap((a) => B.map((b) => jaroWinkler(a.name.toLowerCase(), b.name.toLowerCase()))));
  ev.push({ ok: jw >= 0.85, text: jw >= 0.85 ? `Names close · ${jw.toFixed(2)}` : `Names differ · ${jw.toFixed(2)}` });
  const daysA = new Set<string>(), overlap: string[] = [];
  for (const r of A) for (const g of (await env.DB.prepare("SELECT date FROM gifts WHERE record_id = ?").bind(r.id).all<any>()).results) daysA.add(g.date);
  for (const r of B) for (const g of (await env.DB.prepare("SELECT date FROM gifts WHERE record_id = ?").bind(r.id).all<any>()).results) if (daysA.has(g.date)) overlap.push(g.date);
  ev.push(overlap.length ? { ok: false, text: "Gifts on the same day" } : { ok: true, text: "Gifts never on the same day" });
  const decision = await env.DB.prepare("SELECT id, kind, qtype, question, subject, ref_id, answer, probability, latency_ms, cost, created_at FROM decisions WHERE kind = 'merge' AND ref_id = ? ORDER BY id DESC LIMIT 1").bind(row.id).first<T.Decision>();
  const all = cand.records;
  const longest = (k: "name" | "street") => k === "street" ? ([...all].filter((r) => r.street).sort((a, b) => b.gifts - a.gifts)[0]?.street ?? null) : (all.map((r) => r[k]).filter(Boolean).sort((a, b) => b!.length - a!.length)[0] ?? null);
  const common = (k: "email" | "phone") => { const m = new Map<string, number>(); all.forEach((r) => r[k] && m.set(r[k]!, (m.get(r[k]!) ?? 0) + 1)); return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };
  const detail: T.CandDetail = {
    ...cand, evidence: ev, decision,
    request: { model: DECISIONS_MODEL, input: "You are deduplicating donor records for a Miami nonprofit…", questions: [{ type: "predicate", name: `pair_${row.id}`, instructions: `Are these two groups of records the same donor? Group A: [${A.length} record${A.length > 1 ? "s" : ""}] Group B: [${B.length} record${B.length > 1 ? "s" : ""}]` }, `…${Math.max(0, (await env.DB.prepare("SELECT COUNT(*) AS n FROM candidates").first<any>()).n - 1)} more pairs in the same request`] },
    suggested: { name: longest("name") ?? cand.name, email: common("email"), phone: common("phone"), street: longest("street") },
  };
  return c.json(detail);
});

app.post("/candidates/:id/merge", async (c) => {
  const env = c.env; const id = +c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as Partial<{ name: string; email: string; phone: string; street: string }>;
  const row = await env.DB.prepare("SELECT * FROM candidates WHERE id = ?").bind(id).first<any>();
  if (!row) return c.json({ error: "not found" }, 404);
  const a = await env.DB.prepare("SELECT donor_id FROM records WHERE cluster_id = ? LIMIT 1").bind(row.a_cluster).first<any>();
  const b = await env.DB.prepare("SELECT donor_id FROM records WHERE cluster_id = ? LIMIT 1").bind(row.b_cluster).first<any>();
  const keep = a.donor_id, drop = b.donor_id;
  const names = [...new Set((await env.DB.prepare("SELECT name FROM records WHERE cluster_id IN (?, ?)").bind(row.a_cluster, row.b_cluster).all<{ name: string }>()).results.map((r) => r.name))];
  if (keep !== drop) {
    await env.DB.batch([
      env.DB.prepare("UPDATE donor_notes SET donor_id = ? WHERE donor_id = ?").bind(keep, drop),
      env.DB.prepare("UPDATE records SET donor_id = ? WHERE donor_id = ?").bind(keep, drop),
      env.DB.prepare("DELETE FROM outreach WHERE donor_id = ?").bind(drop),
      env.DB.prepare("DELETE FROM donors WHERE id = ?").bind(drop),
    ]);
  }
  await env.DB.prepare("UPDATE candidates SET status = 'merged', decided_by = ?, decided_at = ? WHERE id = ?").bind(env.STAFF_NAME, now(), id).run();
  await addNote(env, keep, "merge", `Merged ${names.length} records: ${names.join(", ")}. OpenAI Decisions said ${(row.probability ?? 0).toFixed(2)} same donor.`);
  await rebuildDonor(env, keep);
  const sets: string[] = [], vals: unknown[] = [];
  for (const k of ["name", "email", "phone", "street"] as const) if (body[k]) { sets.push(`${k} = ?`); vals.push(body[k]); }
  if (sets.length) await env.DB.prepare(`UPDATE donors SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, keep).run();
  await rerank(env);
  // Re-judge the merged donor live, then redraft in the background if they need a call.
  await scoreDonors(env, null, [keep]);
  const d = await donorById(env, keep);
  if (d.state === "due" || d.state === "late") c.executionCtx.waitUntil(redraft(env, keep).catch((e) => console.error("redraft", e)));
  return c.json({ donorId: keep });
});

app.post("/candidates/:id/keep", async (c) => {
  await c.env.DB.prepare("UPDATE candidates SET status = 'kept', decided_by = ?, decided_at = ? WHERE id = ?").bind(c.env.STAFF_NAME, now(), +c.req.param("id")).run();
  return c.json({ ok: true });
});

// ---------- donors ----------
app.get("/donors", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const { results } = q
    ? await c.env.DB.prepare("SELECT d.* FROM donors d WHERE d.name LIKE ?1 OR d.email LIKE ?1 OR d.id IN (SELECT donor_id FROM records WHERE name LIKE ?1 OR email LIKE ?1) ORDER BY d.lifetime DESC LIMIT 300").bind(`%${q}%`).all<any>()
    : await c.env.DB.prepare("SELECT * FROM donors ORDER BY lifetime DESC LIMIT 300").all<any>();
  return c.json<T.DonorsResp>({ items: results.map(rowOf) });
});

function heat(gifts: any[], state: string, expected: string | null, today: string) {
  const ok = gifts.filter((g) => g.status === "ok");
  const firstYear = Math.max(2021, Math.min(...ok.map((g) => +g.date.slice(0, 4)), +today.slice(0, 4)));
  const ty = +today.slice(0, 4), tm = +today.slice(5, 7);
  const sum = new Map<string, number>(); for (const g of ok) sum.set(g.date.slice(0, 7), (sum.get(g.date.slice(0, 7)) ?? 0) + g.amount);
  const max = Math.max(1, ...sum.values());
  const bad = new Set(gifts.filter((g) => g.status === "declined").map((g) => g.date.slice(0, 7)));
  const years: number[] = []; const cells: Record<string, T.Heat[]> = {};
  for (let y = ty; y >= firstYear; y--) {
    years.push(y);
    cells[y] = Array.from({ length: 12 }, (_, m) => {
      const ym = `${y}-${String(m + 1).padStart(2, "0")}`; const v = sum.get(ym) ?? 0;
      if (v) return v >= 0.75 * max ? "l3" : v >= 0.4 * max ? "l2" : "l1";
      if (bad.has(ym)) return "miss";
      if ((state === "due" || state === "late") && expected?.slice(0, 7) === ym) return "miss";
      if (y === ty && m + 1 > tm) return "fut";
      return "l0";
    });
  }
  return { years, cells };
}

app.get("/donors/:id", async (c) => {
  const env = c.env; const id = +c.req.param("id");
  const d = await donorById(env, id); if (!d) return c.json({ error: "not found" }, 404);
  const gifts = await donorGifts(env, id);
  const { results: recs } = await env.DB.prepare("SELECT s.code, s.label AS source, r.name, (SELECT COUNT(*) FROM gifts g WHERE g.record_id = r.id AND g.status = 'ok') AS gifts FROM records r JOIN sources s ON s.id = r.source_id WHERE r.donor_id = ? ORDER BY s.id").bind(id).all<any>();
  const o = await env.DB.prepare("SELECT * FROM outreach WHERE donor_id = ? ORDER BY id DESC LIMIT 1").bind(id).first<any>();
  const { results: dec } = await env.DB.prepare("SELECT id, kind, qtype, question, subject, ref_id, answer, probability, latency_ms, cost, created_at FROM decisions WHERE ref_id = ? AND kind IN ('lapse','channel','draft_check') ORDER BY id DESC LIMIT 10").bind(id).all<T.Decision>();
  const { results: notes } = await env.DB.prepare("SELECT id, donor_id AS donorId, author, kind, body, created_at AS createdAt FROM donor_notes WHERE donor_id = ? ORDER BY id DESC LIMIT 200").bind(id).all<T.Note>();
  const detail: T.DonorDetail = {
    donor: { ...rowOf(d), email: d.email, altEmails: JSON.parse(d.alt_emails ?? "[]"), phone: d.phone, street: d.street, zip: d.zip, reason: d.reason, expected: d.expected, atRisk: d.at_risk,
      giftCount: d.gift_count, firstGift: d.first_gift, years: d.years, loyalty: d.loyalty, designation: d.designation, riskLabel: d.risk_label, channel: d.channel, calledAt: d.called_at },
    records: recs, gifts: gifts.map((g: any) => ({ date: g.date, amount: g.amount, status: g.status, code: g.code, source: g.source, designation: g.designation, ref: g.ref })),
    heat: heat(gifts, d.state, d.expected, env.TODAY),
    outreach: o ? { id: o.id, draft: o.draft, facts: JSON.parse(o.facts ?? "null"), check_p: o.check_p, status: o.status, model: o.model, created_at: o.created_at } : null,
    decisions: dec,
    notes,
  };
  return c.json(detail);
});

async function redraft(env: Env, donorId: number): Promise<T.Outreach> {
  const d = await donorById(env, donorId);
  const x = await draftFor(env, null, donorId);
  const [p] = await checkDrafts(env, null, [{ donorId, name: d.name, facts: x.facts, text: x.text }]);
  const created = now();
  const r = await env.DB.prepare("INSERT INTO outreach (donor_id, draft, facts, check_p, model, tokens_in, tokens_out, created_at) VALUES (?,?,?,?,?,?,?,?) RETURNING id")
    .bind(donorId, x.text, JSON.stringify(x.facts), p, "gpt-5.5", x.tin, x.tout, created).first<any>();
  return { id: r.id, draft: x.text, facts: x.facts, check_p: p, status: "draft", model: "gpt-5.5", created_at: created };
}

app.post("/donors/:id/draft", async (c) => c.json(await redraft(c.env, +c.req.param("id"))));

app.post("/donors/:id/called", async (c) => {
  const id = +c.req.param("id"); const at = now();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE donors SET called_at = ? WHERE id = ?").bind(at, id),
    c.env.DB.prepare("UPDATE outreach SET status = 'called' WHERE id = (SELECT id FROM outreach WHERE donor_id = ? ORDER BY id DESC LIMIT 1)").bind(id),
  ]);
  await addNote(c.env, id, "call", "Marked as called.");
  return c.json({ ok: true });
});

app.post("/donors/:id/notes", async (c) => {
  const id = +c.req.param("id");
  const { body } = (await c.req.json().catch(() => ({}))) as { body?: string };
  const text = String(body ?? "").trim();
  if (!text) return c.json({ error: "Write something first." }, 400);
  if (text.length > 4000) return c.json({ error: "Keep notes under 4,000 characters." }, 400);
  if (!(await donorById(c.env, id))) return c.json({ error: "not found" }, 404);
  return c.json(await addNote(c.env, id, "note", text));
});

// ---------- import / reset ----------
const WIPE = ["DELETE FROM donor_notes", "DELETE FROM gifts", "DELETE FROM records", "DELETE FROM donors", "DELETE FROM candidates", "DELETE FROM outreach", "DELETE FROM sources"];

app.post("/import", async (c) => {
  const env = c.env;
  const form = await c.req.formData();
  const files = form.getAll("files").filter((f): f is File => typeof f !== "string");
  if (!files.length) return c.json({ error: "no files" }, 400);
  await env.DB.batch(WIPE.map((s) => env.DB.prepare(s)));
  const steps = STEPS.map((s) => ({ ...s, status: "pending" }));
  const run = await env.DB.prepare("INSERT INTO runs (status, started_at, steps) VALUES ('queued', ?, ?) RETURNING id").bind(now(), JSON.stringify(steps)).first<{ id: number }>();
  const runId = run!.id; const t0 = Date.now(); let bytes = 0;
  for (const f of files) {
    const text = await f.text(); bytes += f.size;
    const key = `runs/${runId}/${f.name}`;
    await env.FILES.put(key, text, { httpMetadata: { contentType: "text/csv" } });
    const header = parseCsv(text.split(/\r?\n/, 1)[0] + "\n")[0] ?? [];
    const meta = sourceMeta(f.name, header);
    await env.DB.prepare("INSERT INTO sources (run_id, filename, label, code, r2_key, bytes) VALUES (?,?,?,?,?,?)").bind(runId, f.name, meta.label, meta.code, key, f.size).run();
  }
  steps[0] = { ...steps[0], status: "done", output: `${files.length} files · ${Math.round(bytes / 1024)} KB`, ms: Date.now() - t0 } as any;
  await env.DB.prepare("UPDATE runs SET steps = ?, status = 'running' WHERE id = ?").bind(JSON.stringify(steps), runId).run();
  try {
    await env.IMPORT.create({ id: `run-${runId}-${Date.now()}`, params: { runId } });
  } catch (e) {
    console.warn("Workflow unavailable, running inline:", e);
    c.executionCtx.waitUntil(runPipeline(env, runId).catch((err) => console.error(err)));
  }
  return c.json({ runId });
});

app.post("/reset", async (c) => {
  await c.env.DB.batch([...WIPE, "DELETE FROM decisions", "DELETE FROM runs"].map((s) => c.env.DB.prepare(s)));
  return c.json({ ok: true });
});

export default app;
