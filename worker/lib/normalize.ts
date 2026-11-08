// Parsing and normalization for donor exports in whatever format they arrive.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some((c) => c.trim() !== "")) rows.push(row); }
  return rows;
}

export interface Parsed {
  name: string; email: string; phone: string; street: string; zip: string;
  date: string; amount: number; status: "ok" | "declined"; designation: string; ref: string;
}

const find = (h: string[], ...res: RegExp[]) => { for (const re of res) { const i = h.findIndex((x) => re.test(x)); if (i >= 0) return i; } return -1; };

/** Map any donor export's columns onto one shape. */
export function mapRows(rows: string[][]): Parsed[] {
  const [header, ...body] = rows;
  const h = header.map((x) => x.trim().toLowerCase());
  const iFirst = find(h, /first/), iLast = find(h, /last/);
  const iName = find(h, /^(name|payer|buyer name|donor name|donor|full name)$/, /name/);
  const iEmail = find(h, /e-?mail/), iPhone = find(h, /phone|mobile/);
  const iAddr = find(h, /address|street/), iZip = find(h, /zip|postal/);
  const iAmt = find(h, /^amount$/, /winning bid|total|amount|gift/);
  const iDate = find(h, /date/, /received/), iYear = find(h, /year/);
  const iStatus = find(h, /status/), iDesig = find(h, /designation|fund|event|item|memo/), iRef = find(h, /id|#|order|check/);
  const out: Parsed[] = [];
  for (const r of body) {
    const g = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    let name = iFirst >= 0 && iLast >= 0 ? `${g(iFirst)} ${g(iLast)}`.trim() : g(iName);
    if (!name) continue;
    let street = g(iAddr), zip = g(iZip);
    const zm = street.match(/(\d{5})(?:-\d{4})?\s*$/);
    if (!zip && zm) zip = zm[1];
    street = street.replace(/,?\s*(miami|hialeah|miami beach|north miami)?\s*,?\s*fl\b.*$/i, "").replace(/,\s*$/, "").trim();
    let date = g(iDate);
    if (!date && iYear >= 0) date = `${g(iYear)}-03-14`;
    const mdy = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) date = `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
    const amount = parseFloat(g(iAmt).replace(/[$,\s]/g, "")) || 0;
    const declined = /declin|fail/i.test(g(iStatus));
    out.push({ name, email: g(iEmail), phone: g(iPhone), street, zip, date: date.slice(0, 10), amount, status: declined ? "declined" : "ok", designation: g(iDesig), ref: g(iRef) });
  }
  return out;
}

export function sourceMeta(filename: string, header: string[]): { label: string; code: string } {
  const f = filename.toLowerCase(), h = header.join(" ").toLowerCase();
  if (/gmd|givemiami|donation/.test(f) || /donation id/.test(h)) return { label: "GiveMiamiDay.org", code: "GMD" };
  if (/ticket/.test(f) || /order/.test(h)) return { label: "Event tickets", code: "TIX" };
  if (/gala|auction/.test(f) || /bidder/.test(h)) return { label: "Gala auction", code: "GALA" };
  if (/check/.test(f) || /check #/.test(h)) return { label: "Paper checks", code: "CHK" };
  return { label: filename.replace(/\.[^.]+$/, ""), code: "CSV" };
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const normName = (s: string) =>
  strip(s).toLowerCase().replace(/\b(dr|mr|mrs|ms|the)\.?\s+/g, "").replace(/[^a-z\s&-]/g, " ").replace(/\s+/g, " ").trim();
export const normEmail = (s: string) => s.trim().toLowerCase();
export const normPhone = (s: string) => { const d = s.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? d : ""; };
export function normStreet(s: string) {
  return strip(s).toLowerCase()
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\bstreet\b/g, "st").replace(/\bavenue\b/g, "ave").replace(/\bboulevard\b/g, "blvd").replace(/\bdrive\b/g, "dr")
    .replace(/\b(ste|suite|apt|unit)\b.*$/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const m = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false), bm = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) for (let j = Math.max(0, i - m); j < Math.min(b.length, i + m + 1); j++) {
    if (!bm[j] && a[i] === b[j]) { am[i] = bm[j] = true; matches++; break; }
  }
  if (!matches) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) if (am[i]) { while (!bm[k]) k++; if (a[i] !== b[k]) t++; k++; }
  const j = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let p = 0; while (p < 4 && a[p] === b[p]) p++;
  return j + p * 0.1 * (1 - j);
}

export const isOrg = (name: string) => /\b(fund|foundation|llc|inc|corp|consulting|group|church|company|fam\.?)\b/i.test(name);
