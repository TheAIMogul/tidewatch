-- Tidewatch schema. Source records and gifts are never deleted; donors are derived from them.

CREATE TABLE runs (
  id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',      -- queued | running | done | error
  started_at TEXT NOT NULL,
  finished_at TEXT,
  steps TEXT NOT NULL DEFAULT '[]',           -- [{key,label,tech,status,detail,output,ms}]
  questions INTEGER NOT NULL DEFAULT 0,
  decision_tokens INTEGER NOT NULL DEFAULT 0,
  draft_in INTEGER NOT NULL DEFAULT 0,
  draft_out INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE sources (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  label TEXT NOT NULL,
  code TEXT NOT NULL,                         -- GMD | TIX | GALA | CHK | CSV
  r2_key TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  rows INTEGER NOT NULL DEFAULT 0,
  records INTEGER NOT NULL DEFAULT 0
);

-- One row per distinct identity as it appears in one source file.
CREATE TABLE records (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT, phone TEXT, street TEXT, zip TEXT,
  nname TEXT, nemail TEXT, nphone TEXT, nstreet TEXT,
  cluster_id INTEGER,
  donor_id INTEGER
);
CREATE INDEX records_cluster ON records(cluster_id);
CREATE INDEX records_donor ON records(donor_id);

CREATE TABLE gifts (
  id INTEGER PRIMARY KEY,
  record_id INTEGER NOT NULL,
  source_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',          -- ok | declined
  designation TEXT,
  ref TEXT,
  row_index INTEGER
);
CREATE INDEX gifts_record ON gifts(record_id);

CREATE TABLE donors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT, alt_emails TEXT, phone TEXT, street TEXT, zip TEXT,
  avatar INTEGER, is_org INTEGER NOT NULL DEFAULT 0,
  records INTEGER NOT NULL DEFAULT 1,
  sources TEXT,
  pattern TEXT, state TEXT, expected TEXT, at_risk REAL NOT NULL DEFAULT 0,
  lifetime REAL NOT NULL DEFAULT 0, gift_count INTEGER NOT NULL DEFAULT 0,
  first_gift TEXT, last_gift TEXT, last_amount REAL, failed INTEGER NOT NULL DEFAULT 0,
  years INTEGER NOT NULL DEFAULT 0, loyalty INTEGER NOT NULL DEFAULT 0, rank INTEGER,
  designation TEXT, reason TEXT,
  risk REAL, risk_label TEXT, channel TEXT,
  called_at TEXT
);

CREATE TABLE candidates (
  id INTEGER PRIMARY KEY,
  a_cluster INTEGER NOT NULL,
  b_cluster INTEGER NOT NULL,
  similarity REAL,
  signals TEXT,
  probability REAL,
  status TEXT NOT NULL DEFAULT 'new',         -- new | merged | pending | kept | dismissed
  decided_by TEXT,
  decided_at TEXT
);

CREATE TABLE decisions (
  id INTEGER PRIMARY KEY,
  run_id INTEGER,
  kind TEXT NOT NULL,                          -- merge | lapse | channel | draft_check
  qtype TEXT NOT NULL,                         -- predicate | score | choice
  question TEXT NOT NULL,
  subject TEXT,
  ref_id INTEGER,
  answer TEXT,
  probability REAL,
  latency_ms INTEGER,
  tokens INTEGER,
  cost REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX decisions_ref ON decisions(kind, ref_id);

CREATE TABLE outreach (
  id INTEGER PRIMARY KEY,
  donor_id INTEGER NOT NULL,
  draft TEXT NOT NULL,
  facts TEXT,
  check_p REAL,
  model TEXT,
  tokens_in INTEGER, tokens_out INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',        -- draft | called
  created_at TEXT NOT NULL
);
CREATE INDEX outreach_donor ON outreach(donor_id);
