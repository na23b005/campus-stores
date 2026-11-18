CREATE TABLE IF NOT EXISTS people (
  roll TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin'))
);

-- New requests continue the paper numbering: RQ-218, RQ-219, ...
CREATE SEQUENCE IF NOT EXISTS request_num START 218;

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  club TEXT NOT NULL,
  event TEXT NOT NULL,
  owner_roll TEXT NOT NULL REFERENCES people(roll),
  due TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved'))
);

CREATE TABLE IF NOT EXISTS request_items (
  request_id TEXT NOT NULL REFERENCES requests(id),
  item_type TEXT NOT NULL,
  qty INTEGER NOT NULL,
  PRIMARY KEY (request_id, item_type)
);

-- The named people allowed to collect the kit for a request.
CREATE TABLE IF NOT EXISTS request_collectors (
  request_id TEXT NOT NULL REFERENCES requests(id),
  roll TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (request_id, roll)
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  model TEXT NOT NULL,
  bin TEXT NOT NULL,
  in_repair BOOLEAN NOT NULL DEFAULT FALSE
);

-- Loan numbers continue from the paper ledger, which ended at 401.
CREATE SEQUENCE IF NOT EXISTS loan_num START 402;

CREATE TABLE IF NOT EXISTS loans (
  num INTEGER PRIMARY KEY DEFAULT nextval('loan_num'),
  request_id TEXT NOT NULL REFERENCES requests(id),
  unit_id TEXT NOT NULL REFERENCES units(id),
  collector_roll TEXT NOT NULL,
  due TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  returned_at TIMESTAMPTZ,
  returned_by TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
