-- Append-only ledger of notes and activity per donor. Rows are never updated or deleted by the app.
CREATE TABLE donor_notes (
  id INTEGER PRIMARY KEY,
  donor_id INTEGER NOT NULL,
  author TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',   -- note | call | merge
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX donor_notes_donor ON donor_notes(donor_id, id DESC);
