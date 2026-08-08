PRAGMA foreign_keys = ON;

-- ============================================================
-- REFERENCE / CONFIG TABLES
-- ============================================================

CREATE TABLE accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL DEFAULT 'Main',
  currency        TEXT NOT NULL DEFAULT 'USD',      -- ISO 4217
  starting_balance REAL NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per tradable symbol. Pulls cents/lot config OUT of every trade row.
CREATE TABLE instruments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol          TEXT NOT NULL,
  name            TEXT,
  asset_class     TEXT NOT NULL CHECK (asset_class IN ('stock','forex','futures','crypto','option','other')),
  quote_currency  TEXT NOT NULL DEFAULT 'USD',
  price_mode      TEXT NOT NULL CHECK (price_mode IN ('standard','cents')) DEFAULT 'standard',
  contract_size   REAL NOT NULL DEFAULT 1,          -- lot size / multiplier (e.g. 100000 forex lot, 50 for ES)
  tick_size       REAL,                             -- optional, for R/R rounding
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (symbol, asset_class)
);

CREATE TABLE strategies (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,
  description  TEXT,
  archived_at  TEXT,                                -- soft delete, keeps historical trades intact
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Checklist items belonging to a strategy (versioned by row, not overwritten)
CREATE TABLE strategy_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id  INTEGER NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  rule_text    TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  archived_at  TEXT
);

CREATE TABLE emotions (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL UNIQUE,          -- 'confident','FOMO','revenge trade'...
  color  TEXT                           -- hex, for UI chips
);

-- Free-form tags, distinct from strategy ('breakout','earnings play','mistake')
CREATE TABLE tags (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL UNIQUE,
  color  TEXT
);

-- ============================================================
-- CORE: TRADES
-- ============================================================
-- No pnl / pnl_pct / r_multiple / holding_time columns.
-- Those are always derived — see "computed layer" below.

CREATE TABLE trades (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id      INTEGER NOT NULL REFERENCES accounts(id),
  instrument_id   INTEGER NOT NULL REFERENCES instruments(id),
  strategy_id     INTEGER REFERENCES strategies(id),
  emotion_id      INTEGER REFERENCES emotions(id),

  direction       TEXT NOT NULL CHECK (direction IN ('long','short')),
  status          TEXT NOT NULL CHECK (status IN ('open','closed')) DEFAULT 'open',

  entry_price     REAL NOT NULL,
  exit_price      REAL,                             -- NULL while open
  size            REAL NOT NULL,                     -- units/contracts/lots

  stop_loss       REAL,
  take_profit     REAL,

  entry_at        TEXT NOT NULL,                     -- ISO 8601 datetime
  exit_at         TEXT,

  fees            REAL NOT NULL DEFAULT 0,

  followed_rules  INTEGER CHECK (followed_rules IN (0,1)),  -- nullable tri-state
  notes           TEXT,
  reflection      TEXT,                              -- "what went right/wrong"

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_trades_entry_at    ON trades(entry_at);
CREATE INDEX idx_trades_instrument  ON trades(instrument_id);
CREATE INDEX idx_trades_strategy    ON trades(strategy_id);
CREATE INDEX idx_trades_status      ON trades(status);

-- Per-trade rule checklist state (snapshot at entry time — rules can change later,
-- this preserves what was actually ticked for THIS trade)
CREATE TABLE trade_rule_checks (
  trade_id          INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  strategy_rule_id  INTEGER NOT NULL REFERENCES strategy_rules(id),
  checked           INTEGER NOT NULL CHECK (checked IN (0,1)),
  PRIMARY KEY (trade_id, strategy_rule_id)
);

CREATE TABLE trade_tags (
  trade_id  INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (trade_id, tag_id)
);

CREATE TABLE trade_screenshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id    INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,          -- local file URI, not the blob itself
  caption     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- GOALS / RISK LIMITS
-- ============================================================
-- One table, typed by 'kind' rather than four separate tables —
-- weekly/monthly goal and daily/weekly loss limit all share the same shape.

CREATE TABLE goals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL REFERENCES accounts(id),
  kind          TEXT NOT NULL CHECK (kind IN ('profit_goal','loss_limit')),
  period        TEXT NOT NULL CHECK (period IN ('daily','weekly','monthly')),
  amount        REAL NOT NULL,        -- always positive; sign implied by kind
  effective_from TEXT NOT NULL DEFAULT (date('now')),
  effective_to   TEXT,                -- NULL = still active; new row supersedes old on change
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- REVIEWS (journaling only — stats are computed, never stored here)
-- ============================================================

CREATE TABLE reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL REFERENCES accounts(id),
  period        TEXT NOT NULL CHECK (period IN ('weekly','monthly')),
  period_start  TEXT NOT NULL,        -- Monday for weekly, 1st for monthly
  reflection    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, period, period_start)
);

-- ============================================================
-- APP-LEVEL SETTINGS (key/value, single row per key)
-- ============================================================

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);