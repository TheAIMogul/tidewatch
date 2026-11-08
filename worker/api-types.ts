// The API contract between the Worker (worker/index.ts) and the app (src/main.ts).
// All routes are under /api. All money is US dollars as plain numbers. Dates are "YYYY-MM-DD".

export type Code = "GMD" | "TIX" | "GALA" | "CHK" | "CSV";
export type StepStatus = "pending" | "running" | "done" | "error";
export interface Step { key: string; label: string; tech: string; detail: string; status: StepStatus; output?: string; ms?: number }
export interface Run {
  id: number; status: "queued" | "running" | "done" | "error"; started_at: string; finished_at: string | null;
  steps: Step[]; questions: number; decision_tokens: number; draft_in: number; draft_out: number; cost: number; error: string | null;
}
export interface Source { id: number; filename: string; label: string; code: Code; bytes: number; rows: number; records: number }
export interface Summary {
  sources: number; rows: number; records: number; donors: number;
  duplicates: number;       // records - donors
  exactMerged: number;      // records joined on same email or phone
  autoMerged: number;       // candidate pairs merged automatically (probability >= 0.95)
  needReview: number;       // candidate pairs waiting for a person
  lapsing: number;          // donors whose expected gift is due or late
  atRisk: number;           // sum of their annual value
  firstGift: string | null; lastGift: string | null;
}
export interface Totals { questions: number; avgLatency: number; cost: number }

/** GET /api/state */
export interface StateResp {
  run: Run | null; summary: Summary; sources: Source[]; decisions: Totals;
  today: string; gmdDate: string; org: string; staff: string;
}

/** GET /api/decisions?limit=20 — newest first */
export interface Decision {
  id: number; kind: "merge" | "lapse" | "channel" | "draft_check"; qtype: "predicate" | "score" | "choice";
  question: string; subject: string | null; ref_id: number | null; answer: string | null; probability: number | null;
  latency_ms: number; cost: number; created_at: string;
}
export interface DecisionsResp { items: Decision[]; totals: Totals }

/** GET /api/flow — up to 3 groups for the resolution flow board on Today */
export interface FlowGroup {
  kind: "review" | "auto" | "pending";
  candidateId: number | null;
  records: { code: Code; name: string; amount: number }[];          // each source record, newest gift amount
  person: { donorId: number | null; name: string; avatar: string; count: number; probability: number | null };
  action: { donorId: number; label: string; amount: number; risk: number | null } | null;
}
export interface FlowResp { groups: FlowGroup[] }

/** GET /api/calls — donors whose expected gift is due or late, highest revenue at risk first */
export type Cell = "on" | "miss" | "off" | "fut";
export interface CallItem {
  donorId: number; name: string; avatar: string; isOrg: boolean; records: number;
  pattern: string; reason: string; state: "due" | "late";
  cadence: Cell[];             // 12 months ending this month, oldest first
  lastGift: string | null; risk: number | null; riskLabel: string | null; atRisk: number;
  outreach: "ready" | "flagged" | "called" | "none";
}
export interface CallsResp { items: CallItem[] }

/** GET /api/candidates?status=pending|merged|kept */
export interface CandRecord {
  id: number; side: "a" | "b"; code: Code; source: string; name: string;
  email: string | null; phone: string | null; street: string | null; zip: string | null;
  gifts: number; total: number; first: string | null; last: string | null;
}
export interface Cand {
  id: number; probability: number | null; status: "pending" | "merged" | "kept" | "dismissed"; decidedBy: string | null;
  name: string; avatar: string; codes: Code[]; records: CandRecord[];
}
export interface CandsResp { items: Cand[]; counts: { pending: number; merged: number; kept: number; dismissed: number } }

/** GET /api/candidates/:id */
export interface CandDetail extends Cand {
  evidence: { ok: boolean; text: string }[];          // computed signals, not AI
  decision: Decision | null;                          // the Decisions call that judged this pair
  request: unknown;                                   // the exact question object sent
  suggested: { name: string; email: string | null; phone: string | null; street: string | null };
}
/** POST /api/candidates/:id/merge  body: Partial<{ name, email, phone, street }>  -> { donorId } */
/** POST /api/candidates/:id/keep -> { ok: true } */

/** GET /api/donors?q= */
export interface DonorRow {
  id: number; name: string; avatar: string; isOrg: boolean; records: number; sources: Code[];
  pattern: string; state: string; lifetime: number; lastGift: string | null; risk: number | null; rank: number | null;
}
export interface DonorsResp { items: DonorRow[] }

export type Heat = "l0" | "l1" | "l2" | "l3" | "miss" | "fut";
export interface Outreach { id: number; draft: string; facts: unknown; check_p: number | null; status: "draft" | "called"; model: string; created_at: string }
/** GET /api/donors/:id */
export interface DonorDetail {
  donor: DonorRow & {
    email: string | null; altEmails: string[]; phone: string | null; street: string | null; zip: string | null;
    reason: string; expected: string | null; atRisk: number; giftCount: number; firstGift: string | null;
    years: number; loyalty: number; designation: string | null; riskLabel: string | null; channel: string | null; calledAt: string | null;
  };
  records: { code: Code; source: string; name: string; gifts: number }[];
  gifts: { date: string; amount: number; status: "ok" | "declined"; code: Code; source: string; designation: string | null; ref: string | null }[];
  heat: { years: number[]; cells: Record<string, Heat[]> };   // cells[year] has 12 entries, Jan..Dec
  outreach: Outreach | null;
  decisions: Decision[];
}
/** POST /api/donors/:id/draft -> Outreach      (new gpt-5.5 draft, checked by Decisions) */
/** POST /api/donors/:id/called -> { ok: true } */

/** POST /api/import  multipart/form-data, field "files" (one or more CSV files) -> { runId } */
/** POST /api/reset -> { ok: true }   wipes all data for a fresh demo */
