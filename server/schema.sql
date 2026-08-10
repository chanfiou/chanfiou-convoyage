CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  client_token TEXT NOT NULL,
  status TEXT NOT NULL,
  origin TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS missions_updated_at ON missions (updated_at);
CREATE INDEX IF NOT EXISTS missions_status ON missions (status);

CREATE TABLE IF NOT EXISTS counters (
  period TEXT PRIMARY KEY,
  last_sequence INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS availability (
  day TEXT NOT NULL,
  reason TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (day, reference)
);

CREATE TABLE IF NOT EXISTS throttle (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client_push (
  endpoint TEXT NOT NULL,
  reference TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (endpoint, reference)
);

CREATE INDEX IF NOT EXISTS client_push_reference ON client_push (reference);
