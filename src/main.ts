import "./style.css";
import type * as T from "../worker/api-types";

// ---------- helpers ----------
const $ = <E extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as E;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (n: number | null | undefined) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US"));
const cost = (n: number) => "$" + (n === 0 ? "0" : n < 0.001 ? n.toFixed(5) : n < 1 ? n.toFixed(4) : n.toFixed(2));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const date = (s: string | null | undefined) => { if (!s) return "—"; const [y, m, d] = s.slice(0, 10).split("-").map(Number); return `${MON[m - 1]} ${d}, ${y}`; };
const monYear = (s: string | null | undefined) => { if (!s) return "—"; const [y, m] = s.split("-").map(Number); return `${MON[m - 1]} ${y}`; };
const pct = (p: number | null | undefined) => (p == null ? "—" : Math.round(p * 100) + "%");
const two = (p: number | null | undefined) => (p == null ? "—" : p.toFixed(2));
const ago = (iso: string) => { const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };
const secs = (ms?: number) => (ms == null ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)}s`);
const first = (n: string) => n.replace(/^(dr|mr|mrs|ms)\.?\s+/i, "").replace(/^the\s+/i, "").split(/\s+/)[0];
const words = ["zero", "one", "two", "three", "four", "five", "six"];
const COLORS: Record<string, string> = { GMD: "#0E7C6B", TIX: "#D4473A", GALA: "#B4741A", CHK: "#3A57D0", CSV: "#55555D" };
const svgI = (d: string, extra = "") => `<svg class="i" viewBox="0 0 24 24" ${extra}>${d}</svg>`;
const CHECK = svgI('<path d="M5 12l5 5 9-10"/>', 'style="stroke-width:2.2"');

function initials(name: string) { const p = name.replace(/^(dr|the)\.?\s+/i, "").split(/[\s&]+/).filter(Boolean); return ((p[0]?.[0] ?? "") + (p.length > 1 ? p.at(-1)![0] : "")).toUpperCase(); }
function avatar(url: string, name: string, size = 24, badge?: number, red = false) {
  const img = url ? `<img class="av" style="width:${size}px;height:${size}px" src="${esc(url)}" alt="">` : `<span class="initials" style="width:${size}px;height:${size}px;font-size:${Math.max(9, size * 0.38)}px">${esc(initials(name))}</span>`;
  const b = badge && badge > 1 ? `<span class="b ${red ? "r" : ""}" ${size > 30 ? 'style="min-width:18px;height:18px;line-height:18px;font-size:10.5px"' : ""}>${badge}</span>` : "";
  return `<span class="avb">${img}${b}</span>`;
}
const srcBadge = (code: string) => `<span class="sb"><i style="background:${COLORS[code] ?? COLORS.CSV}"></i>${esc(code)}</span>`;
function ring(p: number | null, size: number, stroke: number, color: string, label?: string) {
  const r = (size - stroke) / 2 - 1, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, p ?? 0));
  return `<svg class="mring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(12,12,14,.08)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - v)).toFixed(1)}" stroke-linecap="round"/></svg>${label ?? ""}`;
}
const riskColor = (p: number | null) => ((p ?? 0) >= 0.6 ? "#D4473A" : (p ?? 0) >= 0.35 ? "#B4741A" : "#0E7C6B");
function gauge(p: number | null, size = 56) {
  return `<div class="gauge" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${ring(p, size, 5, (p ?? 0) >= 0.8 ? "#0E7C6B" : (p ?? 0) >= 0.5 ? "#B4741A" : "#D4473A").replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg><div class="v">${two(p)}</div></div>`;
}
function toast(msg: string) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout((toast as any).t); (toast as any).t = setTimeout(() => t.classList.remove("on"), 3200); }

async function api<R>(path: string, init?: RequestInit): Promise<R> {
  const res = await fetch("/api" + path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any).error ?? `HTTP ${res.status}`);
  return body as R;
}
const post = <R>(path: string, body?: unknown) => api<R>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

// ---------- state ----------
let S: T.StateResp | null = null;
let route: { v: string; id?: number } = { v: "today" };
let sig = "";
const running = () => !!S?.run && (S.run.status === "queued" || S.run.status === "running");

function parseRoute() { const [v, id] = (location.hash.slice(1) || "today").split("/"); route = { v: v || "today", id: id && /^\d+$/.test(id) ? +id : undefined }; }
window.addEventListener("hashchange", () => { parseRoute(); render(); });
document.querySelectorAll<HTMLElement>("#nav a[data-v]").forEach((a) => a.addEventListener("click", () => { location.hash = a.dataset.v === "calls" ? "today/calls" : a.dataset.v!; }));
$("#importBtn").addEventListener("click", () => openImport());
$("#searchBtn").addEventListener("click", () => { location.hash = "donors"; setTimeout(() => $<HTMLInputElement>("#q")?.focus(), 50); });
window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); $("#searchBtn").click(); } });

function chrome() {
  if (!S) return;
  const s = S.summary;
  $("#orgName").textContent = S.org;
  $("#nDonors").textContent = s.donors ? String(s.donors) : "";
  $("#nDup").textContent = s.needReview ? String(s.needReview) : ""; $("#nDup").style.display = s.needReview ? "" : "none";
  $("#nSrc").textContent = s.sources ? String(s.sources) : "";
  $("#nCalls").textContent = s.lapsing ? String(s.lapsing) : "";
  $("#qcount").textContent = S.decisions.questions.toLocaleString("en-US");
  const days = Math.round((Date.parse(S.gmdDate) - Date.parse(S.today)) / 864e5);
  $("#gmdDays").textContent = `${days} days`;
  $("#gmdRisk").textContent = s.atRisk ? `· ${money(s.atRisk)} at risk` : "";
  ($("#gmdBar") as HTMLElement).style.width = `${Math.max(4, Math.min(100, 100 - (days / 30) * 100))}%`;
  const navV = route.v === "donor" ? "calls" : route.v === "today" && route.id === undefined && location.hash.includes("calls") ? "calls" : route.v;
  document.querySelectorAll<HTMLElement>("#nav a[data-v]").forEach((a) => a.classList.toggle("on", a.dataset.v === navV || (navV === "today" && a.dataset.v === "today" && !location.hash.includes("calls"))));
}

const CRUMB: Record<string, string> = { story: "<b>The story</b>", today: "<b>Today</b>", donors: "<b>Donors</b>", duplicates: "Donors <span>/</span> <b>Duplicates</b>", imports: "<b>Imports</b>", settings: "<b>Settings</b>" };

async function render() {
  chrome();
  const v = $("#view");
  $("#crumb").innerHTML = CRUMB[route.v] ?? "<b>Today</b>";
  try {
    if (!S) { v.innerHTML = `<div class="card" style="padding:20px"><div class="skel" style="width:40%"></div></div>`; return; }
    if (route.v === "story") return await renderStory(v);
    if (route.v === "imports") return renderImports(v);
    if (!S.run) return renderEmpty(v);
    if (route.v === "duplicates") return await renderDuplicates(v);
    if (route.v === "donor" && route.id) return await renderDonor(v, route.id);
    if (route.v === "donors") return await renderDonors(v);
    if (route.v === "settings") return renderSettings(v);
    return await renderToday(v);
  } catch (e: any) {
    v.innerHTML = `<div class="card" style="padding:16px 18px"><span class="err">Something went wrong: ${esc(e.message)}</span> <button class="btn" style="margin-left:8px" onclick="location.reload()">Retry</button></div>`;
  }
}

async function refreshState() {
  try {
    S = await api<T.StateResp>("/state");
    const s = JSON.stringify([S.run?.status, S.run?.steps.map((x) => x.status), S.summary]);
    chrome();
    if (s !== sig) { const firstLoad = !sig; sig = s; if (firstLoad || route.v === "imports" || route.v === "today") render(); }
  } catch { /* keep last state */ }
  setTimeout(refreshState, running() ? 1200 : 5000);
}

// ---------- empty + import ----------
const SAMPLES = ["gmd-export.csv", "tickets.csv", "gala-auction.csv", "check-log.csv"];
function dropZone(id: string) {
  return `<div class="drop" id="${id}"><div><b>Drop CSV files here</b> or click to choose</div><div style="font-size:12px;margin-top:4px;color:var(--fg-3)">GiveMiamiDay.org exports, ticketing, gala auctions, typed-in checks. Any column layout.</div><div class="files"></div><input type="file" accept=".csv,text/csv" multiple hidden></div>`;
}
function wireDrop(root: HTMLElement, onFiles: (f: File[]) => void) {
  const d = root, input = d.querySelector("input") as HTMLInputElement;
  d.addEventListener("click", () => input.click());
  input.addEventListener("change", () => input.files && onFiles([...input.files]));
  d.addEventListener("dragover", (e) => { e.preventDefault(); d.classList.add("over"); });
  d.addEventListener("dragleave", () => d.classList.remove("over"));
  d.addEventListener("drop", (e) => { e.preventDefault(); d.classList.remove("over"); const f = [...(e.dataTransfer?.files ?? [])].filter((x) => /\.csv$/i.test(x.name)); if (f.length) onFiles(f); });
}
async function startImport(files: File[]) {
  const fd = new FormData(); files.forEach((f) => fd.append("files", f));
  closeModal();
  const r = await api<{ runId: number }>("/import", { method: "POST", body: fd });
  toast(`Import #${r.runId} started · ${files.length} files`);
  sig = ""; location.hash = "imports";
  S = await api<T.StateResp>("/state"); render();
}
async function sampleFiles() { return Promise.all(SAMPLES.map(async (n) => new File([await (await fetch(`/samples/${n}`)).blob()], n, { type: "text/csv" }))); }
function importBody(id: string) {
  return `${dropZone(id)}<div style="display:flex;gap:8px;justify-content:center"><button class="btn pri" data-sample>Use sample data · 4 files</button></div>`;
}
function bindImport(root: HTMLElement, id: string) {
  wireDrop($(`#${id}`, root), (f) => startImport(f).catch((e) => toast(e.message)));
  root.querySelector("[data-sample]")?.addEventListener("click", async (e) => { (e.currentTarget as HTMLButtonElement).disabled = true; startImport(await sampleFiles()).catch((x) => toast(x.message)); });
}
function renderEmpty(v: HTMLElement) {
  v.innerHTML = `<div class="card empty fade"><div class="logo" style="width:40px;height:40px;border-radius:11px;margin:0 auto 14px"></div><h2>Drop in your donor lists</h2><p>Tidewatch merges every duplicate into one person and tells you who's about to stop giving, before Give Miami Day.</p>${importBody("drop0")}</div>`;
  bindImport(v, "drop0");
}
function openImport() {
  const m = $("#modal");
  m.innerHTML = `<div class="mh"><div><h2>Import donor lists</h2><p>Each import starts a fresh workspace. Originals are kept in storage.</p></div><button class="btn ghost" style="margin-left:auto" data-close>Close</button></div>${importBody("drop1")}`;
  bindImport(m, "drop1"); m.querySelector("[data-close]")!.addEventListener("click", closeModal);
  $("#app").classList.add("blur"); $("#scrim").classList.add("on");
}
function closeModal() { $("#app").classList.remove("blur"); $("#scrim").classList.remove("on"); }
$("#scrim").addEventListener("click", (e) => { if (e.target === $("#scrim")) closeModal(); });

// ---------- today ----------
const PIPE_ARROW = `<div class="arr"><svg class="i" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div>`;
function pipeline() {
  const s = S!.summary, r = S!.run!;
  const dur = r.finished_at ? secs(Date.parse(r.finished_at) - Date.parse(r.started_at)) : "running";
  const node = (k: string, v: string, d: string, cls = "", last = false) => `<div class="pn ${cls}"><div class="k"><i></i>${k}</div><div class="v">${v}</div><div class="d">${d}</div>${last ? "" : PIPE_ARROW}</div>`;
  return `<div class="card fade"><div class="pipe">
    ${node("Sources", String(s.sources), S!.sources.map((x) => x.label.replace("GiveMiamiDay.org", "GMD").toLowerCase().replace("gmd", "GMD")).join(", "))}
    ${node("Rows imported", s.rows.toLocaleString("en-US"), `${monYear(s.firstGift)} to ${monYear(s.lastGift)}`)}
    ${node("Unique donors", s.donors.toLocaleString("en-US"), "after resolution", "acc")}
    ${node("Duplicates", String(s.duplicates), `${s.needReview ? `<a href="#duplicates" style="color:var(--risk)">${s.needReview} need review</a> · ` : ""}${s.exactMerged} auto`)}
    ${node("Lapsing", String(s.lapsing), "expected gift is late")}
    ${node("Revenue at risk", money(s.atRisk), "before Give Miami Day", "risk", true)}
  </div><div class="pipefoot"><div class="src">${S!.sources.map((x) => `<span class="sb"><i style="background:${COLORS[x.code]}"></i>${esc(x.filename)}</span>`).join("")}</div><span style="margin-left:auto">Workflow run <span class="mono">#${r.id}</span> · ${dur} · <a href="#imports" style="color:var(--fg-2);text-decoration:underline;text-decoration-color:var(--line-3)">View run</a></span></div></div>`;
}

let flowData: T.FlowResp | null = null;
function flowCard(f: T.FlowResp) {
  const g = f.groups, s = S!.summary;
  const kindCls = (k: string) => (k === "review" ? "c" : k === "auto" ? "t" : "p");
  const col1 = g.flatMap((gr, gi) => gr.records.map((r) => `<div class="fr" data-g="${gi}" data-c="1"><span class="sbg" style="background:${COLORS[r.code]}">${r.code}</span><b>${esc(r.name)}</b><span class="m">${money(r.amount)}</span></div>`)).join("");
  const col2 = g.map((gr, gi) => {
    const chip = gr.kind === "review" ? `<span class="chip risk">Review</span>` : gr.kind === "auto" ? `<span class="chip acc">Auto</span>` : `<span class="chip info">${two(gr.person.probability)}</span>`;
    const attrs = gr.candidateId ? `data-cand="${gr.candidateId}"` : gr.person.donorId ? `data-donor="${gr.person.donorId}"` : "";
    return `<div class="fr ${gr.kind === "review" ? "hot" : ""}" data-g="${gi}" data-c="2" ${attrs} tabindex="0">${avatar(gr.person.avatar, gr.person.name, 24, gr.person.count, gr.kind === "review")}<b>${esc(gr.person.name)}</b>${chip}</div>`;
  }).join("");
  const col3 = g.map((gr, gi) => gr.action ? `<div class="fr" data-g="${gi}" data-c="3" data-donor="${gr.action.donorId}" tabindex="0">${ring(gr.action.risk, 24, 3, riskColor(gr.action.risk))}<b>${esc(gr.action.label)}</b><span class="m">${money(gr.action.amount)}</span></div>` : `<div class="fr more" data-g="${gi}" data-c="3"></div>`).join("");
  return `<div class="card fade"><div class="ch"><h3>Resolution flow</h3><span class="s">How ${s.rows} rows became ${s.donors} people</span><div class="r lgd"><span><i style="border-color:var(--accent)"></i>Merged</span><span><i style="border-color:var(--risk)"></i>Needs you</span><span><i style="border-color:var(--info);border-top-style:dashed"></i>Pending</span></div></div>
    <div class="board" id="board" data-kinds="${g.map((x) => kindCls(x.kind)).join(",")}">
      <div class="col"><div class="colh">Came in <span class="mono">${s.rows}</span></div>${col1}</div>
      <div class="col"><div class="colh">One person <span class="mono">${s.donors}</span></div>${col2}<div class="fr more">+ ${Math.max(0, s.donors - g.length)} more people</div></div>
      <div class="col"><div class="colh">This week <span class="mono">${s.lapsing}</span></div>${col3}<div class="fr more">+ ${Math.max(0, s.lapsing - g.filter((x) => x.action).length)} more calls</div></div>
      <svg class="wires" id="wires"></svg></div></div>`;
}
function wire() {
  const board = $("#board"), svg = $("#wires") as unknown as SVGSVGElement; if (!board || !svg) return; svg.innerHTML = "";
  const b = board.getBoundingClientRect(); svg.setAttribute("viewBox", `0 0 ${b.width} ${b.height}`); svg.setAttribute("width", String(b.width)); svg.setAttribute("height", String(b.height));
  const kinds = (board.dataset.kinds ?? "").split(",");
  const pt = (el: Element, side: "l" | "r") => { const r = el.getBoundingClientRect(); return [side === "r" ? r.right - b.left : r.left - b.left, r.top - b.top + r.height / 2]; };
  const link = (a: Element, z: Element, k: string, n: number) => {
    const A = pt(a, "r"), Z = pt(z, "l"), mx = (A[0] + Z[0]) / 2;
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", `M${A[0]} ${A[1]} C ${mx} ${A[1]}, ${mx} ${Z[1]}, ${Z[0]} ${Z[1]}`); p.setAttribute("class", k); svg.appendChild(p);
    void n;
    for (const q of [A, Z]) { const c = document.createElementNS("http://www.w3.org/2000/svg", "circle"); c.setAttribute("cx", String(q[0])); c.setAttribute("cy", String(q[1])); c.setAttribute("r", "3"); c.setAttribute("class", k); svg.appendChild(c); }
  };
  let n = 0;
  kinds.forEach((k, gi) => {
    const person = board.querySelector(`[data-g="${gi}"][data-c="2"]`), act = board.querySelector(`[data-g="${gi}"][data-c="3"]:not(.more)`);
    board.querySelectorAll(`[data-g="${gi}"][data-c="1"]`).forEach((r) => person && link(r, person, k, n++));
    const risk = flowData?.groups[gi]?.action?.risk ?? 0;
    if (person && act) link(person, act, risk >= 0.5 ? "c" : "t", n++);
  });
}
window.addEventListener("resize", () => wire());

function feedItem(d: T.Decision, isNew: boolean) {
  const icon = d.qtype === "predicate" ? '<path d="M5 12l5 5 9-10"/>' : d.qtype === "score" ? '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>' : '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>';
  let cls = "", ans = esc(d.answer ?? "—");
  if (d.qtype === "predicate") { const p = d.probability ?? 0; ans = two(p); cls = d.kind === "draft_check" ? (p >= 0.5 ? "lo" : "hi") : p >= 0.8 ? "hi" : p <= 0.3 ? "lo" : ""; }
  if (d.qtype === "score") cls = /lapse/i.test(d.answer ?? "") ? "lo" : /schedule/i.test(d.answer ?? "") ? "hi" : "";
  if (d.qtype === "choice") ans = esc((d.answer ?? "").replace(/^./, (c) => c.toUpperCase()));
  return `<div class="fi ${isNew ? "new" : ""}" data-id="${d.id}"><div class="ic">${svgI(icon)}</div><div><div class="q">${esc(d.question)} · <b>${esc(d.subject)}</b></div><div class="m">${d.qtype} · ${d.latency_ms} ms · ${ago(d.created_at)}</div></div><span class="p ${cls}">${ans}</span></div>`;
}
let feedTimer = 0, lastFeedId = 0;
async function refreshFeed(initial = false) {
  const box = $("#feed"); if (!box) return;
  try {
    const r = await api<T.DecisionsResp>("/decisions?limit=24");
    const top = r.items[0]?.id ?? 0;
    if (initial || top !== lastFeedId) {
      box.innerHTML = r.items.map((d) => feedItem(d, !initial && d.id > lastFeedId)).join("");
      lastFeedId = top;
    } else box.querySelectorAll(".fi .m").forEach((m, i) => { const d = r.items[i]; if (d) m.textContent = `${d.qtype} · ${d.latency_ms} ms · ${ago(d.created_at)}`; });
    $("#fsQ") && ($("#fsQ").textContent = r.totals.questions.toLocaleString("en-US"));
    $("#fsL") && ($("#fsL").textContent = `${r.totals.avgLatency} ms`);
    $("#fsC") && ($("#fsC").textContent = cost(r.totals.cost));
  } catch { /* ignore */ }
  clearTimeout(feedTimer); if ($("#feed")) feedTimer = window.setTimeout(() => refreshFeed(), 3000);
}
function decisionsCard() {
  return `<div class="card fade" style="contain:size;overflow:hidden"><div class="ch"><h3>OpenAI Decisions</h3><span class="s">gpt-6-luna</span><div class="r"><span class="chip acc"><span class="dot" style="width:5px;height:5px"></span>Live</span></div></div>
    <div class="fsum"><div><div class="k">Questions</div><div class="v" id="fsQ">${S!.decisions.questions.toLocaleString("en-US")}</div></div><div><div class="k">Latency</div><div class="v" id="fsL">${S!.decisions.avgLatency} ms</div></div><div><div class="k">Cost</div><div class="v" id="fsC">${cost(S!.decisions.cost)}</div></div></div>
    <div class="feed" id="feed"></div></div>`;
}
function outreachChip(o: T.CallItem["outreach"]) { return o === "ready" ? `<span class="chip acc">Draft ready</span>` : o === "flagged" ? `<span class="chip warn">Check draft</span>` : o === "called" ? `<span class="chip">Called</span>` : `<span class="chip">No draft</span>`; }
function callsCard(c: T.CallsResp) {
  const rows = c.items.map((x, i) => `<tr class="fade" style="animation-delay:${0.1 + i * 0.025}s" data-donor="${x.donorId}"><td><div class="who">${avatar(x.avatar, x.name, 24, x.records)}<div><b>${esc(x.name)}</b><span>${esc(x.pattern)}${x.records > 1 ? ` · ${x.records} linked records` : ""}</span></div></div></td>
    <td><div class="cad">${x.cadence.map((k) => `<i class="${k === "off" ? "" : k}"></i>`).join("")}</div></td>
    <td style="white-space:normal;max-width:300px;color:var(--fg-2);font-size:12.5px">${esc(x.reason)}</td>
    <td><div class="rk">${ring(x.risk, 18, 2.5, riskColor(x.risk))}<span class="mono">${pct(x.risk)}</span></div></td>
    <td class="r-al mono" style="font-weight:500">${money(x.atRisk)}</td><td>${outreachChip(x.outreach)}</td></tr>`).join("");
  return `<div class="card fade" id="calls"><div class="ch"><h3>Call before Give Miami Day</h3><span class="s">${c.items.length} donors · ranked by revenue at risk · risk scored by OpenAI Decisions</span></div>
    <table><thead><tr><th>Donor</th><th>Last 12 months</th><th>Why now</th><th>Lapse risk</th><th class="r-al">At risk</th><th>Outreach</th></tr></thead><tbody>${rows || `<tr><td colspan="6" style="color:var(--fg-3)">Nobody is drifting. Every regular donor is on schedule.</td></tr>`}</tbody></table></div>`;
}
async function renderToday(v: HTMLElement) {
  if (running()) { v.innerHTML = `<div class="ph"><div><h1>Import running…</h1><p>Watching run #${S!.run!.id}.</p></div></div>`; location.hash = "imports"; return; }
  const [flow, calls] = await Promise.all([api<T.FlowResp>("/flow"), api<T.CallsResp>("/calls")]);
  flowData = flow;
  const h = new Date().getHours(), greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  v.innerHTML = `<div class="ph"><div><h1>${greet}, ${esc(S!.staff)}</h1><p>${date(S!.today)} · Last import ${S!.run!.finished_at ? ago(S!.run!.finished_at) : "running"}</p></div>
      <div class="r"><button class="btn" id="exportBtn">Export call list</button><button class="btn pri" id="startCalls">Start call session</button></div></div>
    ${pipeline()}
    <div class="g2 tall" style="margin-top:12px">${flowCard(flow)}${decisionsCard()}</div>
    <div style="margin-top:12px">${callsCard(calls)}</div>`;
  setTimeout(wire, 60); refreshFeed(true);
  v.querySelectorAll<HTMLElement>("[data-cand]").forEach((e) => e.addEventListener("click", () => openMerge(+e.dataset.cand!)));
  v.querySelectorAll<HTMLElement>("[data-donor]").forEach((e) => e.addEventListener("click", () => { location.hash = `donor/${e.dataset.donor}`; }));
  $("#startCalls").addEventListener("click", () => calls.items[0] && (location.hash = `donor/${calls.items[0].donorId}`));
  $("#exportBtn").addEventListener("click", () => {
    const csv = ["Name,Pattern,Why now,Lapse risk,At risk,Outreach", ...calls.items.map((x) => [x.name, x.pattern, x.reason, pct(x.risk), Math.round(x.atRisk), x.outreach].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "tidewatch-call-list.csv"; a.click();
  });
  if (location.hash.includes("calls")) setTimeout(() => $("#calls")?.scrollIntoView({ behavior: "smooth" }), 120);
}

// ---------- merge modal ----------
async function openMerge(id: number) {
  const m = $("#modal");
  m.innerHTML = `<div class="skel" style="width:60%;margin:8px 0 14px"></div><div class="skel"></div>`;
  $("#app").classList.add("blur"); $("#scrim").classList.add("on");
  const d = await api<T.CandDetail>(`/candidates/${id}`);
  const n = d.records.length;
  const sub = d.evidence.filter((e) => e.ok).map((e) => e.text.split(" · ")[0]).slice(0, 3).join(", ") || "Looks related";
  m.innerHTML = `<div class="mh">${avatar(d.avatar, d.name, 40, n, true)}<div><h2>${esc(d.name)}, ${words[n] ?? n} ways</h2><p>${esc(sub)}.</p></div>${gauge(d.probability)}</div>
    ${d.records.map((r) => `<div class="mrec"><span class="sbg" style="background:${COLORS[r.code]}">${r.code}</span><div><b>${esc(r.name)}</b><span class="d">${r.first ? (r.first === r.last ? date(r.first) : `${monYear(r.first)} – ${monYear(r.last)}`) : "—"} · ${money(r.total)}</span></div><div class="ct">${[r.email, r.phone].filter(Boolean).map(esc).join(" · ") || "no email or phone"}<br>${esc(r.street ?? "")}${r.zip ? " " + esc(r.zip) : ""}</div><span class="k">${keeps(d, r)}</span></div>`).join("")}
    <div class="mev">${d.evidence.map((e) => `<span class="chip ${e.ok ? "acc" : ""}">${esc(e.text)}</span>`).join("")}</div>
    <div class="mf"><span class="n">OpenAI Decisions · predicate · ${d.decision?.latency_ms ?? "—"} ms. Nothing is deleted; undo any time.</span><button class="btn" data-keep>Keep separate</button><button class="btn acc" data-merge>${CHECK}Merge ${n} records</button></div>`;
  m.querySelector("[data-keep]")!.addEventListener("click", () => decideCand(id, "keep"));
  m.querySelector("[data-merge]")!.addEventListener("click", () => decideCand(id, "merge"));
}
function keeps(d: T.CandDetail, r: T.CandRecord) {
  const k = [r.name === d.suggested.name && "name", r.email && r.email === d.suggested.email && "email", r.phone && r.phone === d.suggested.phone && "phone", r.street && r.street === d.suggested.street && "address"].filter(Boolean);
  return k.length ? `keeps ${k.join(", ")}` : `<span style="color:var(--fg-3)">gifts only</span>`;
}
async function decideCand(id: number, action: "merge" | "keep", picks?: Record<string, string | null>) {
  document.querySelectorAll<HTMLButtonElement>("[data-merge],[data-keep]").forEach((b) => (b.disabled = true));
  if (action === "merge") toast("Merging · re-scoring with OpenAI Decisions…");
  const r = await post<{ donorId?: number }>(`/candidates/${id}/${action}`, picks ?? {});
  closeModal();
  toast(action === "merge" ? "Merged. Donor re-scored and moved on the call list." : "Kept separate.");
  sig = ""; S = await api<T.StateResp>("/state"); chrome();
  if (route.v === "duplicates") { location.hash = "duplicates"; render(); } else render();
  void r;
}

// ---------- imports ----------
function renderImports(v: HTMLElement) {
  const r = S!.run;
  if (!r) { v.innerHTML = `<div class="ph"><div><h1>Imports</h1><p>No imports yet.</p></div></div><div class="card empty">${importBody("drop2")}</div>`; bindImport(v, "drop2"); return; }
  const dur = r.finished_at ? secs(Date.parse(r.finished_at) - Date.parse(r.started_at)) : "";
  const icon = (s: T.Step) => s.status === "done" ? `<span class="ck">${svgI('<path d="M5 12l5 5 9-10"/>')}</span>` : s.status === "running" ? `<span class="spin"></span>` : s.status === "error" ? `<span class="ck err">${svgI('<path d="M6 6l12 12M18 6L6 18"/>')}</span>` : `<span class="ck pend"></span>`;
  const done = r.steps.filter((s) => s.status === "done").length;
  v.innerHTML = `<div class="ph"><div><h1>Import run #${r.id}</h1><p>Durable pipeline on Cloudflare Workflows · started ${new Date(r.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${dur ? ` · finished in ${dur}` : ""}</p></div>
      <div class="r">${running() ? `<span class="chip info"><span class="spin" style="width:10px;height:10px;border-width:1.5px"></span>Running</span>` : r.status === "error" ? `<span class="chip risk">Failed</span>` : `<a class="btn" href="#today">Open Today</a>`}<button class="btn pri" id="newImport">New import</button></div></div>
    ${r.error ? `<div class="card" style="padding:10px 14px;margin-bottom:12px"><span class="err">${esc(r.error)}</span></div>` : ""}
    <div class="runs"><div class="card steps"><div class="ch"><h3>Steps</h3><span class="s">${done} of ${r.steps.length} complete · each step retries on its own</span></div>
      ${r.steps.map((s) => `<div class="st ${s.status}">${icon(s)}<div><b>${esc(s.label)}<span class="tech">${esc(s.tech)}</span></b><span>${esc(s.detail)}</span></div><span class="o">${esc(s.output ?? "")}</span><span class="t">${secs(s.ms)}</span></div>`).join("")}</div>
    <div><div class="card srcs"><div class="ch"><h3>Sources</h3></div>${S!.sources.map((s) => `<div class="s"><div class="lg" style="background:${COLORS[s.code]}">${s.code}</div><div><b>${esc(s.label)}</b><span>${esc(s.filename)} · ${Math.max(1, Math.round(s.bytes / 1024))} KB · ${s.records} records</span></div><span class="mono">${s.rows || "…"}</span></div>`).join("")}</div>
      <div class="card" style="margin-top:12px"><div class="ch"><h3>Run cost</h3><span class="s">OpenAI usage</span></div><div class="sect" style="border-top:0">
        <div class="lr">Decisions questions<span class="mono">${r.questions.toLocaleString("en-US")}</span></div>
        <div class="lr">Decisions input tokens<span class="mono">${r.decision_tokens.toLocaleString("en-US")}</span></div>
        <div class="lr">gpt-5.5 tokens in / out<span class="mono">${r.draft_in.toLocaleString("en-US")} / ${r.draft_out.toLocaleString("en-US")}</span></div>
        <div class="lr" style="border-top:1px solid var(--line);margin-top:4px;padding-top:9px;font-weight:500">Total<span class="mono" style="color:var(--fg)">${cost(r.cost)}</span></div></div></div></div></div>`;
  $("#newImport").addEventListener("click", () => openImport());
}

// ---------- duplicates ----------
let dupTab: "pending" | "merged" | "kept" = "pending";
let picks: Record<string, string | null> = {};
async function renderDuplicates(v: HTMLElement) {
  const list = await api<T.CandsResp>(`/candidates?status=${dupTab}`);
  const sel = route.id ?? list.items[0]?.id;
  const detail = sel ? await api<T.CandDetail>(`/candidates/${sel}`) : null;
  if (detail) picks = { ...detail.suggested };
  const prCls = (p: number | null) => ((p ?? 0) >= 0.9 ? "hi" : (p ?? 0) >= 0.6 ? "md" : "lo");
  v.innerHTML = `<div class="ph"><div><h1>Duplicates</h1><p>Tidewatch merges on its own only when an email or phone matches exactly. Every other match is judged by OpenAI Decisions and approved by you. Nothing is deleted.</p></div></div>
    <div style="margin-bottom:12px"><div class="seg">${(["pending", "merged", "kept"] as const).map((t) => `<a data-tab="${t}" class="${t === dupTab ? "on" : ""}">${t === "pending" ? "Needs review" : t === "merged" ? "Merged" : "Kept separate"} <span class="mono">${list.counts[t]}</span></a>`).join("")}</div></div>
    <div class="dup"><div class="card ql"><div class="ch"><h3>Queue</h3><span class="s">sorted by confidence</span></div>
      ${list.items.map((x) => `<div class="it ${x.id === sel ? "on" : ""}" data-id="${x.id}">${avatar(x.avatar, x.name, 24, x.records.length, (x.probability ?? 0) < 0.6)}<div><b>${esc(x.name)}</b><div class="src">${x.records.map((r) => srcBadge(r.code)).join("")}</div></div><span class="pr ${prCls(x.probability)}">${two(x.probability)}</span></div>`).join("") || `<div style="padding:14px;color:var(--fg-3)">Nothing here.</div>`}</div>
      <div id="dupDetail">${detail ? dupDetail(detail) : ""}</div></div>`;
  v.querySelectorAll<HTMLElement>("[data-tab]").forEach((a) => a.addEventListener("click", () => { dupTab = a.dataset.tab as any; location.hash = "duplicates"; render(); }));
  v.querySelectorAll<HTMLElement>(".ql .it").forEach((a) => a.addEventListener("click", () => { location.hash = `duplicates/${a.dataset.id}`; }));
  if (detail) bindDupDetail(v, detail);
}
function colorJson(o: unknown) {
  return esc(JSON.stringify(o, null, 2)).replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="k">$1</span>$2').replace(/:\s(&quot;.*?&quot;)/g, ': <span class="s">$1</span>').replace(/:\s(-?\d+\.?\d*)/g, ': <span class="n">$1</span>');
}
function dupDetail(d: T.CandDetail) {
  const recs = d.records;
  const cell = (r: T.CandRecord, k: "name" | "email" | "phone" | "street") => { const val = r[k]; if (!val) return `<td class="dim">—</td>`; const on = picks[k] === val; return `<td class="click ${on ? "pick" : ""}" data-k="${k}" data-val="${esc(val)}"><span class="radio"></span>${esc(val)}</td>`; };
  const rowOf = (label: string, k: "name" | "email" | "phone" | "street") => `<tr><td>${label}</td>${recs.map((r) => cell(r, k)).join("")}<td class="res" data-res="${k}">${esc(picks[k] ?? "—")}</td></tr>`;
  const total = recs.reduce((a, r) => a + r.total, 0), gifts = recs.reduce((a, r) => a + r.gifts, 0);
  const firsts = recs.map((r) => r.first).filter(Boolean).sort(), lasts = recs.map((r) => r.last).filter(Boolean).sort();
  const actions = d.status === "pending" ? `<button class="btn" data-keep>Keep separate</button><button class="btn acc" data-merge>${CHECK}Merge ${recs.length} records</button>` : `<span class="chip ${d.status === "merged" ? "acc" : ""}">${d.status === "merged" ? "Merged" : "Kept separate"} · ${esc(d.decidedBy ?? "")}</span>`;
  return `<div class="card"><div class="ch" style="padding:14px">${avatar(d.avatar, d.name, 28, recs.length)}<div><h3 style="font-size:14px">${esc(d.name)}</h3><span class="s">${recs.length} records · ${[...new Set(recs.map((r) => r.source))].join(", ")}</span></div><div class="r">${actions}</div></div>
    <table class="cmp"><thead><tr><th></th>${recs.map((r) => `<th>${srcBadge(r.code)} &nbsp;${esc(r.source)}</th>`).join("")}<th>Merged record</th></tr></thead><tbody>
      ${rowOf("Name", "name")}${rowOf("Email", "email")}${rowOf("Phone", "phone")}${rowOf("Address", "street")}
      <tr><td>Gifts</td>${recs.map((r) => `<td class="mono" style="font-size:12px">${r.gifts} · ${money(r.total)}</td>`).join("")}<td class="res mono" style="font-size:12px">${gifts} · ${money(total)}</td></tr>
      <tr><td>Date range</td>${recs.map((r) => `<td class="mono" style="font-size:12px">${r.first ? `${monYear(r.first)} – ${monYear(r.last)}` : "—"}</td>`).join("")}<td class="res mono" style="font-size:12px">${firsts[0] ? `${monYear(firsts[0]!)} – ${monYear(lasts.at(-1)!)}` : "—"}</td></tr>
    </tbody></table></div>
    <div class="g2" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-top:12px">
      <div class="card"><div class="ch"><h3>Why we think so</h3></div><div class="score">${gauge(d.probability)}<div><div style="font-weight:500">${(d.probability ?? 0) >= 0.9 ? "Very likely the same donor" : (d.probability ?? 0) >= 0.6 ? "Probably the same donor" : "Probably different people"}</div><div style="color:var(--fg-3);font-size:12px;margin-top:2px">OpenAI Decisions read both groups side by side. The signals below are computed, not guessed.</div></div></div>
        <div class="ev">${d.evidence.map((e) => `<div><span class="${e.ok ? "ok" : "no"}">${e.ok ? "✓" : "✕"}</span>${esc(e.text)}</div>`).join("")}</div></div>
      <div class="card"><div class="ch"><h3>Request</h3><span class="s mono">POST /v1/decisions</span><div class="r"><span class="chip">${d.decision?.latency_ms ?? "—"} ms</span><span class="chip mono">${d.decision ? cost(d.decision.cost) : "—"}</span></div></div>
<pre class="code">${colorJson(d.request)}
<span style="color:var(--fg-3)">→</span> { <span class="k">"probability"</span>: <span class="n">${two(d.probability)}</span> }</pre></div></div>`;
}
function bindDupDetail(v: HTMLElement, d: T.CandDetail) {
  v.querySelectorAll<HTMLElement>("td.click").forEach((td) => td.addEventListener("click", () => {
    const k = td.dataset.k!; picks[k] = td.dataset.val!;
    v.querySelectorAll<HTMLElement>(`td.click[data-k="${k}"]`).forEach((x) => x.classList.toggle("pick", x === td));
    const res = v.querySelector<HTMLElement>(`[data-res="${k}"]`); if (res) res.textContent = picks[k];
  }));
  v.querySelector("[data-keep]")?.addEventListener("click", () => decideCand(d.id, "keep"));
  v.querySelector("[data-merge]")?.addEventListener("click", () => decideCand(d.id, "merge", picks));
}

// ---------- donor ----------
async function renderDonor(v: HTMLElement, id: number) {
  const d = await api<T.DonorDetail>(`/donors/${id}`);
  const o = d.donor;
  $("#crumb").innerHTML = `<a href="#today/calls" style="color:inherit">Call list</a> <span>/</span> <b>${esc(o.name)}</b>`;
  const lapsing = o.state === "due" || o.state === "late";
  const missMonth = lapsing && o.expected ? monYear(o.expected) : null;
  const heat = `<div class="heat"><div></div>${"JFMAMJJASOND".split("").map((m) => `<div class="m">${m}</div>`).join("")}${d.heat.years.map((y) => `<div class="y">${y}</div>${d.heat.cells[y].map((c) => `<i class="${c === "l0" ? "" : c}"></i>`).join("")}`).join("")}</div>`;
  const gifts = (o2: T.Outreach | null) => {
    const f = (o2?.facts as any)?.gifts as any[] | undefined; if (!f?.length) return "";
    const by = new Map<string, number>(); f.forEach((g) => by.set(g.source, (by.get(g.source) ?? 0) + 1));
    return [...by].map(([s, n]) => `<span class="chip">${esc(s)} · ${n} gift${n > 1 ? "s" : ""}</span>`).join("") + (o.designation ? `<span class="chip">Designation: ${esc(o.designation)}</span>` : "");
  };
  const out = d.outreach;
  const chk = out?.check_p ?? null;
  v.innerHTML = `<div class="ph"><div style="display:flex;align-items:center;gap:14px">${avatar(o.avatar, o.name, 56, o.records, false)}<div><h1>${esc(o.name)}</h1><p style="display:flex;gap:6px;align-items:center;margin-top:4px;flex-wrap:wrap"><span class="chip">${esc(o.pattern)}</span>${lapsing ? `<span class="chip risk">${o.state === "due" ? "Due" : "Lapsing"}${o.risk != null ? ` · ${pct(o.risk)}` : ""}</span>` : `<span class="chip acc">On schedule</span>`}${o.records > 1 ? `<span class="chip">${o.records} linked records</span>` : ""}${o.channel ? `<span class="chip info">Best by ${esc(o.channel)}</span>` : ""}${o.zip ? `<span style="color:var(--fg-3)">· ${esc(o.zip)}</span>` : ""}</p></div></div>
      <div class="r"><button class="btn" id="logBtn">Log activity</button><button class="btn pri" id="callBtn">${svgI('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>')}Call ${esc(first(o.name))}</button></div></div>
    <div class="dn"><div class="card">
      <div class="rings">
        <div><div class="ring">${ring(o.risk, 64, 5, riskColor(o.risk))}<div class="v">${two(o.risk)}</div></div><div class="rl">Lapse risk</div></div>
        <div><div class="ring">${ring(o.loyalty / 100, 64, 5, "#3A57D0")}<div class="v">${o.loyalty}</div></div><div class="rl">Loyalty</div></div>
        <div><div class="ring">${ring(o.rank ? 1 - (o.rank - 1) / Math.max(1, S!.summary.donors) : 0, 64, 5, "#0E7C6B")}<div class="v">${o.rank ?? "—"}${o.rank ? ord(o.rank) : ""}</div></div><div class="rl">of ${S!.summary.donors}</div></div>
      </div>
      <div class="prof"><dl class="kv"><dt>Email</dt><dd>${esc(o.email ?? "—")}${o.altEmails.length ? `<div style="color:var(--fg-3);font-size:11.5px">+${o.altEmails.length} alternate</div>` : ""}</dd><dt>Phone</dt><dd class="mono" style="font-size:12.5px">${esc(o.phone ?? "—")}</dd><dt>Address</dt><dd>${esc(o.street ?? "—")}${o.zip ? `<br>Miami, FL ${esc(o.zip)}` : ""}</dd><dt>Owner</dt><dd>${esc(S!.staff)}</dd><dt>Gives to</dt><dd>${esc(o.designation ?? "—")}</dd></dl></div>
      <div class="sect"><h4>Lifetime</h4><div class="lr">Total given<span class="mono" style="color:var(--fg)">${money(o.lifetime)}</span></div><div class="lr">Gifts<span class="mono">${o.giftCount}</span></div><div class="lr">Average gift<span class="mono">${money(o.giftCount ? o.lifetime / o.giftCount : 0)}</span></div><div class="lr">Years giving<span class="mono">${o.years}</span></div></div>
      <div class="sect"><h4>Linked records</h4>${d.records.map((r) => `<div class="lr">${srcBadge(r.code)}${esc(r.name)}<span class="mono">${r.gifts} gift${r.gifts === 1 ? "" : "s"}</span></div>`).join("")}</div>
    </div><div>
      <div class="card"><div class="ch"><h3>Giving pattern</h3><span class="s">${esc(o.reason)}</span><div class="r">${missMonth ? `<span class="chip risk">${missMonth} ${o.state === "due" ? "expected" : "not received"}</span>` : ""}</div></div>${heat}</div>
      <div class="dgrid">
        <div class="card"><div class="ch"><h3>Suggested outreach</h3><span class="s">${out ? `drafted ${ago(out.created_at)}` : "no draft yet"}</span><div class="r"><span class="chip">${esc(out?.model ?? "gpt-5.5")}</span></div></div>
          <div class="note" id="note">${out ? out.draft.split(/\n\s*\n/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("") : `<p style="color:var(--fg-3)">No note yet. Generate one from ${esc(first(o.name))}'s record.</p>`}</div>
          <div class="facts">${gifts(out)}</div>
          ${out ? `<div class="check">${svgI('<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>', `style="color:${(chk ?? 0) < 0.3 ? "var(--accent)" : "var(--warn)"}"`)}OpenAI Decisions check: claims not in the record<span class="mono" style="margin-left:auto;color:${(chk ?? 0) < 0.3 ? "var(--accent-2)" : "var(--warn)"}">${two(chk)}</span></div>` : ""}
          <div class="na"><button class="btn" id="regen">${out ? "Regenerate" : "Write note"}</button><button class="btn" id="copy" ${out ? "" : "disabled"}>Copy</button><button class="btn acc" id="called" style="margin-left:auto" ${o.calledAt ? "disabled" : ""}>${o.calledAt ? "Called " + ago(o.calledAt) : "Mark called"}</button></div></div>
        <div class="card tl"><div class="ch"><h3>Timeline</h3><span class="s">${d.gifts.length} entries · ${d.records.length} source${d.records.length > 1 ? "s" : ""}</span></div>
          ${d.gifts.slice(0, 14).map((g) => `<div class="t"><span class="d">${date(g.date)}</span><span class="b" style="background:${COLORS[g.code]}"></span><span>${esc(g.source)}${g.designation ? ` · ${esc(g.designation)}` : ""}${g.status === "declined" ? ` <span class="chip risk" style="height:18px">Declined</span>` : ""}</span><span class="mono">${money(g.amount)}</span></div>`).join("")}</div>
      </div></div></div>`;
  $("#callBtn").addEventListener("click", () => { if (o.phone) location.href = `tel:${o.phone.replace(/\D/g, "")}`; else toast("No phone on file. Use the note by email."); });
  $("#logBtn").addEventListener("click", () => toast("Activity log is coming next."));
  $("#copy").addEventListener("click", () => { navigator.clipboard.writeText(out?.draft ?? ""); toast("Note copied"); });
  $("#called").addEventListener("click", async () => { await post(`/donors/${id}/called`); toast(`Marked ${first(o.name)} as called`); render(); });
  $("#regen").addEventListener("click", async (e) => {
    const b = e.currentTarget as HTMLButtonElement; b.disabled = true; b.innerHTML = `<span class="spin" style="width:12px;height:12px;border-width:1.5px"></span>Writing with gpt-5.5…`;
    try { await post(`/donors/${id}/draft`); toast("New note drafted and fact-checked"); } catch (x: any) { toast(x.message); }
    render();
  });
}
const ord = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");

// ---------- donors ----------
let q = "";
async function renderDonors(v: HTMLElement) {
  const r = await api<T.DonorsResp>(`/donors?q=${encodeURIComponent(q)}`);
  const rows = r.items.map((d) => `<tr data-donor="${d.id}"><td><div class="who">${avatar(d.avatar, d.name, 24, d.records)}<div><b>${esc(d.name)}</b><span>${esc(d.pattern)}</span></div></div></td><td>${d.sources.map(srcBadge).join(" ")}</td><td>${d.state === "due" || d.state === "late" ? `<span class="chip risk">${d.state === "due" ? "Due" : "Lapsing"}</span>` : `<span class="chip">${d.state === "quiet" ? "Quiet" : "Current"}</span>`}</td><td class="mono" style="font-size:12px;color:var(--fg-2)">${date(d.lastGift)}</td><td><div class="rk">${ring(d.risk, 18, 2.5, riskColor(d.risk))}<span class="mono">${pct(d.risk)}</span></div></td><td class="r-al mono" style="font-weight:500">${money(d.lifetime)}</td></tr>`).join("");
  v.innerHTML = `<div class="ph"><div><h1>Donors</h1><p>${S!.summary.donors} people from ${S!.summary.records} records across ${S!.summary.sources} lists. Searching also matches every alternate spelling.</p></div></div>
    <div class="searchrow"><input id="q" placeholder="Search by any name or email, even an old spelling" value="${esc(q)}"></div>
    <div class="card"><table><thead><tr><th>Donor</th><th>Sources</th><th>Status</th><th>Last gift</th><th>Lapse risk</th><th class="r-al">Lifetime</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const input = $<HTMLInputElement>("#q", v); let t = 0;
  input.addEventListener("input", () => { clearTimeout(t); t = window.setTimeout(() => { q = input.value; renderDonors(v).then(() => { const i = $<HTMLInputElement>("#q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 220); });
  v.querySelectorAll<HTMLElement>("[data-donor]").forEach((e) => e.addEventListener("click", () => { location.hash = `donor/${e.dataset.donor}`; }));
}

// ---------- settings ----------
function renderSettings(v: HTMLElement) {
  v.innerHTML = `<div class="ph"><div><h1>Settings</h1><p>Workspace for ${esc(S!.org)}.</p></div></div>
    <div class="card" style="max-width:560px"><div class="ch"><h3>Demo data</h3></div><div style="padding:14px 16px;display:flex;align-items:center;gap:12px"><div style="flex:1;color:var(--fg-2)">Wipe every donor, merge, note and Decisions log entry, and start from an empty workspace.</div><button class="btn" id="reset" style="color:var(--risk)">Reset demo data</button></div></div>`;
  $("#reset").addEventListener("click", async () => { if (!confirm("Erase all imported data and start over?")) return; await post("/reset"); sig = ""; location.hash = "today"; location.reload(); });
}

// ---------- story (for the big screen) ----------
async function renderStory(v: HTMLElement) {
  const s = S!.summary, has = !!S!.run && s.donors > 0;
  const days = Math.round((Date.parse(S!.gmdDate) - Date.parse(S!.today)) / 864e5);
  // Rosa's real record when the sample data is loaded; the story still reads without it.
  let rosa: T.DonorRow | undefined, prob = 0.98, note = "";
  if (has) {
    try {
      rosa = (await api<T.DonorsResp>("/donors?q=Rosa")).items.find((d) => /delgado/i.test(d.name));
      const c = (await api<T.CandsResp>("/candidates?status=pending")).items.find((x) => /delgado/i.test(x.name)); if (c?.probability) prob = c.probability;
      if (rosa) { const d = await api<T.DonorDetail>(`/donors/${rosa.id}`); note = d.outreach?.draft ?? ""; }
    } catch { /* fall back to the written story */ }
  }
  const sentences = (note.replace(/^Hi [^,\n]+,\s*/, "").split(/\n\s*\n/)[0] ?? "").split(/(?<=[.?])\s+/).slice(0, 1).join(" ");
  const excerpt = sentences || "Give Miami Day is next Thursday, and you've been with our mentoring kids every year since 2021.";
  const rosaAv = avatar(rosa?.avatar ?? "", "Rosa Delgado", 56, 3, false);
  const dot = (y: string, k: "on" | "off" | "miss") => `<div class="sy"><i class="${k}"></i><span>${y}</span></div>`;
  const arrow = `<div class="st-arr">${svgI('<path d="M9 6l6 6-6 6"/>')}</div>`;
  const dur = S!.run?.finished_at ? Math.round((Date.parse(S!.run.finished_at) - Date.parse(S!.run.started_at)) / 1000) : 20;
  v.innerHTML = `<div class="story">
    <div class="st-hero fade">
      <div class="st-kicker"><span class="chip">A story from Tidepath Family Alliance</span><span>Fictional people, real problem</span></div>
      <h1>Rosa has given every Give Miami Day since 2021.<br><em>This year, nobody would have noticed if she stopped.</em></h1>
      <p>Denise raises the money for a small Miami nonprofit that helps kids and families. Her donors live in four separate lists. Give Miami Day is in <b>${days} days</b>.</p>
    </div>
    <div class="st-row">
      <div class="card st-ch fade" style="animation-delay:.15s">
        <div class="st-n">1</div><h3>Rosa is on three lists, spelled three ways</h3>
        <div class="st-viz st-recs">
          <div class="fr"><span class="sbg" style="background:${COLORS.GMD}">GMD</span><b>Rosa M. Delgado</b><span class="m">$250</span></div>
          <div class="fr"><span class="sbg" style="background:${COLORS.GALA}">GALA</span><b>Rosa Delgado</b><span class="m">$150</span></div>
          <div class="fr"><span class="sbg" style="background:${COLORS.CHK}">CHK</span><b>R. Delgado</b><span class="m">$500</span></div>
        </div>
        <p>Online gifts, gala bids and hand-typed checks never meet. Rosa got three year-end letters, and her giving looks like three small donors.</p>
      </div>${arrow}
      <div class="card st-ch fade" style="animation-delay:.35s">
        <div class="st-n">2</div><h3>Tidewatch sees one person</h3>
        <div class="st-viz st-one">${rosaAv}<div><b>Rosa M. Delgado</b><span>3 records · 7 gifts · $1,950</span></div>${gauge(prob, 44)}</div>
        <div class="st-chips"><span class="chip acc">Same street, written two ways</span><span class="chip acc">Same email</span><span class="chip acc">Same ZIP</span></div>
        <p>It reads every list and asks OpenAI Decisions whether these records are the same donor. Denise approves with one click. Nothing is deleted.</p>
      </div>${arrow}
      <div class="card st-ch fade" style="animation-delay:.55s">
        <div class="st-n">3</div><h3>It notices the silence</h3>
        <div class="st-viz st-years">${dot("2021", "on")}${dot("2022", "off")}${dot("2023", "on")}${dot("2024", "on")}${dot("2025", "on")}${dot("2026", "miss")}</div>
        <div class="st-risk"><span class="mono">$900</span> a year at risk · Give Miami Day, Nov 19</div>
        <p>Rosa gives every November. Nothing has arrived this year. Tidewatch spots the gap before it becomes a lost donor.</p>
      </div>${arrow}
      <div class="card st-ch fade" style="animation-delay:.75s">
        <div class="st-n">4</div><h3>Denise makes the call</h3>
        <div class="st-viz st-note"><div class="st-sheet">“Hi Rosa, ${esc(excerpt)}”</div>
          <div class="st-check">${svgI('<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>')}Written from her record. Fact-checked.</div></div>
        <p>The note uses only Rosa's real history, and OpenAI Decisions checks it never invents a fact. One call keeps her giving.</p>
      </div>
    </div>
    <div class="card st-band fade" style="animation-delay:.95s">
      ${has ? `<div class="st-lab">Across Tidepath's whole list, in ${dur} seconds</div>
      <div class="st-stats">
        <div><b class="num">${s.rows}</b><span>rows from ${s.sources} lists</span></div><i>→</i>
        <div><b class="num">${s.donors}</b><span>real people</span></div><i>→</i>
        <div><b class="num">${s.needReview}</b><span>duplicates for Denise to approve</span></div><i>→</i>
        <div><b class="num">${s.lapsing}</b><span>regular donors gone quiet</span></div><i>→</i>
        <div class="hot"><b class="num">${money(s.atRisk)}</b><span>to save before Give Miami Day</span></div>
      </div>
      <div class="st-go"><a class="btn" href="#imports">Watch it run</a><a class="btn pri" href="#today">See today's call list</a></div>`
      : `<div class="st-lab">See it on real lists</div><div class="st-go" style="margin-top:0">${importBody("dropS")}</div>`}
    </div>
  </div>`;
  if (!has) bindImport(v, "dropS");
}

// ---------- boot ----------
parseRoute();
render();
refreshState();
