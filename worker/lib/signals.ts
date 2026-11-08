// Giving cadence, lapse window and revenue at risk, computed from a donor's gifts. No AI here.

export interface Gift { date: string; amount: number; status: string; code: string; designation?: string | null }
export interface Signals {
  pattern: string; state: "ok" | "due" | "late" | "quiet"; expected: string | null; at_risk: number;
  lifetime: number; gift_count: number; first_gift: string | null; last_gift: string | null; last_amount: number | null;
  failed: number; years: number; loyalty: number; designation: string | null; reason: string;
}

const DAY = 864e5;
const t = (s: string) => Date.parse(s + "T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const fmtDate = (s: string) => { const d = new Date(s + "T00:00:00Z"); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const doy = (ms: number) => { const d = new Date(ms); return Math.round((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY); };

export function signals(gifts: Gift[], today: string, gmdDate: string): Signals {
  const T = t(today), Y = new Date(T).getUTCFullYear();
  const ok = gifts.filter((g) => g.status === "ok" && g.amount > 0).sort((a, b) => a.date.localeCompare(b.date));
  const lifetime = ok.reduce((s, g) => s + g.amount, 0);
  const last = ok.at(-1), first = ok[0];
  const failed = gifts.filter((g) => g.status === "declined" && (!last || g.date > last.date)).length;
  const yearSet = new Set(ok.map((g) => g.date.slice(0, 4)));
  const firstYear = first ? +first.date.slice(0, 4) : Y;
  const loyalty = ok.length ? Math.min(100, Math.round((100 * yearSet.size) / (Y - firstYear + 1))) : 0;
  const desigCounts = new Map<string, number>();
  for (const g of ok) if (g.code === "GMD" && g.designation) desigCounts.set(g.designation, (desigCounts.get(g.designation) ?? 0) + 1);
  const designation = [...desigCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const base = { lifetime, gift_count: ok.length, first_gift: first?.date ?? null, last_gift: last?.date ?? null, last_amount: last?.amount ?? null, failed, years: yearSet.size, loyalty, designation };
  if (!last) return { ...base, pattern: "No gifts", state: "quiet", expected: null, at_risk: 0, reason: failed ? `${failed} declined payments, no successful gift.` : "No gifts on record." };

  // Monthly: five or more gifts in the last ~13 months, about a month apart.
  const recent = ok.filter((g) => T - t(g.date) < 400 * DAY);
  const gaps = recent.slice(1).map((g, i) => (t(g.date) - t(recent[i].date)) / DAY);
  if (recent.length >= 5 && median(gaps) >= 25 && median(gaps) <= 35) {
    const amt = median(recent.map((g) => g.amount));
    const lastT = t(last.date), late = T - lastT > 40 * DAY || failed > 0;
    const runMonths = recent.length;
    const since = MON[new Date(lastT + 31 * DAY).getUTCMonth()];
    return {
      ...base, pattern: "Monthly", state: late ? "late" : "ok", expected: iso(lastT + 31 * DAY), at_risk: amt * 12,
      reason: failed ? `${money(amt)} a month for ${runMonths} months. Card declined ×${failed} since ${since}.`
        : late ? `${money(amt)} a month for ${runMonths} months. Nothing since ${fmtDate(last.date)}.`
        : `${money(amt)} a month, on schedule.`,
    };
  }

  // Annual: gifts that land in the same season year after year.
  const anchor = median(ok.map((g) => doy(t(g.date))));
  const seasonal = ok.filter((g) => Math.abs(doy(t(g.date)) - anchor) <= 40);
  const sYears = [...new Set(seasonal.map((g) => +g.date.slice(0, 4)))].sort();
  const consecutive = sYears.length >= 2 && sYears.at(-1)! - sYears.at(-2)! === 1;
  const isGmd = seasonal.filter((g) => g.code === "GMD" && g.date.slice(5, 7) === "11").length >= Math.ceil(seasonal.length / 2);
  if ((sYears.length >= 3 || consecutive) && sYears.at(-1)! >= Y - 2) {
    const expectedIn = (y: number) => (isGmd ? t(gmdDate) - (Y - y) * 365 * DAY : Date.UTC(y, 0, 1) + anchor * DAY);
    // Check last year's occurrence first (a skipped year is "late"), then this year's if it is close.
    const near = (occ: number) => ok.some((g) => Math.abs(t(g.date) - occ) <= 40 * DAY);
    const occs = [expectedIn(Y - 1), expectedIn(Y)].filter((o) => o <= T + 45 * DAY && o >= t(first!.date) + 300 * DAY);
    const missed = occs.find((o) => !near(o));
    const occ = missed ?? occs.at(-1) ?? expectedIn(Y);
    const hit = missed === undefined;
    const lastT = t(last.date);
    // One year of giving: gifts in the ~11 months before the last gift (so last year's same-season gift is not counted twice).
    const annual = ok.filter((g) => lastT - t(g.date) < 330 * DAY).reduce((s, g) => s + g.amount, 0);
    const month = new Date(occ).getUTCMonth();
    const pattern = isGmd ? "Every Give Miami Day" : `Every ${MONTH[month]}`;
    const yearsTxt = sYears.length > 2 ? `since ${sYears[0]}` : sYears.join(" and ");
    if (hit) return { ...base, pattern, state: "ok", expected: iso(occ + 365 * DAY), at_risk: 0, reason: `${pattern}, on schedule.` };
    const state = occ < T ? "late" : "due";
    return {
      ...base, pattern, state, expected: iso(occ), at_risk: annual,
      reason: state === "due"
        ? `${isGmd ? "Gave every Give Miami Day" : `Gave every ${MONTH[month]}`} ${yearsTxt}. Nothing yet this year.`
        : `${isGmd ? "Gave every Give Miami Day" : `Gave every ${MONTH[month]}`} ${yearsTxt}. None in ${MON[month]} ${new Date(occ).getUTCFullYear()}.`,
    };
  }
  const quiet = T - t(last.date) > 730 * DAY;
  return { ...base, pattern: ok.length > 1 ? "Occasional" : "One-time", state: quiet ? "quiet" : "ok", expected: null, at_risk: 0, reason: ok.length > 1 ? `${ok.length} gifts, no fixed rhythm.` : `One gift, ${fmtDate(last.date)}.` };
}

const FEMALE = new Set("rosa maria camila valentina sofia isabella daniela natalia elena paola lucia wideline fabiola nadege stephanie olivia grace hannah aaliyah brianna kimberly monique simone yolanda teresa lauren rebecca chloe ingrid renee bianca marguerite priya mei dana ana carmen".split(" "));
const MALE = new Set("luis andres diego mateo gabriel javier ricardo fernando hector raul jean-marc reginald patrick marcus ethan noah caleb jordan tyrone derek andre victor oscar ivan samuel adrian miguel pablo arturo esteban theodore kenji joshua josh jean joseph harold".split(" "));
export function avatarFor(name: string, id: number, org: boolean): string {
  if (org) return "";
  const first = name.replace(/^(dr|mr|mrs|ms)\.?\s+/i, "").split(/[\s.]+/)[0].toLowerCase();
  const n = (id * 37 + first.length * 11) % 90;
  if (FEMALE.has(first)) return `https://randomuser.me/api/portraits/women/${n}.jpg`;
  if (MALE.has(first)) return `https://randomuser.me/api/portraits/men/${n}.jpg`;
  return "";
}
