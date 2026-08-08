import { SQLiteDatabase } from 'expo-sqlite';
import { Trade } from './schema';
import { TradeWithInstrument } from '../stats/computeStats';

// ============================================================
// Database initialization — called by SQLiteProvider onInit.
// ============================================================
export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS accounts (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT    NOT NULL DEFAULT 'Main',
      currency         TEXT    NOT NULL DEFAULT 'USD',
      starting_balance REAL    NOT NULL DEFAULT 0,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS instruments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol          TEXT NOT NULL,
      name            TEXT,
      asset_class     TEXT NOT NULL CHECK (asset_class IN ('stock','forex','futures','crypto','option','other')),
      quote_currency  TEXT NOT NULL DEFAULT 'USD',
      price_mode      TEXT NOT NULL CHECK (price_mode IN ('standard','cents')) DEFAULT 'standard',
      contract_size   REAL NOT NULL DEFAULT 1,
      tick_size       REAL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (symbol, asset_class)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS strategies (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      archived_at TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS strategy_rules (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id INTEGER NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
      rule_text   TEXT    NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS emotions (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE,
      color TEXT
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS tags (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE,
      color TEXT
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS trades (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id     INTEGER NOT NULL REFERENCES accounts(id),
      instrument_id  INTEGER NOT NULL REFERENCES instruments(id),
      strategy_id    INTEGER REFERENCES strategies(id),
      emotion_id     INTEGER REFERENCES emotions(id),
      direction      TEXT NOT NULL CHECK (direction IN ('long','short')),
      status         TEXT NOT NULL CHECK (status IN ('open','closed')) DEFAULT 'open',
      entry_price    REAL NOT NULL,
      exit_price     REAL,
      size           REAL NOT NULL,
      stop_loss      REAL,
      take_profit    REAL,
      entry_at       TEXT NOT NULL,
      exit_at        TEXT,
      fees           REAL NOT NULL DEFAULT 0,
      followed_rules INTEGER CHECK (followed_rules IN (0,1)),
      notes          TEXT,
      reflection     TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_trades_entry_at   ON trades(entry_at);`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_trades_instrument  ON trades(instrument_id);`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_trades_strategy    ON trades(strategy_id);`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_trades_status      ON trades(status);`);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS trade_rule_checks (
      trade_id         INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
      strategy_rule_id INTEGER NOT NULL REFERENCES strategy_rules(id),
      checked          INTEGER NOT NULL CHECK (checked IN (0,1)),
      PRIMARY KEY (trade_id, strategy_rule_id)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS trade_tags (
      trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
      tag_id   INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
      PRIMARY KEY (trade_id, tag_id)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS trade_screenshots (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id   INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
      file_path  TEXT    NOT NULL,
      caption    TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS goals (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id     INTEGER NOT NULL REFERENCES accounts(id),
      kind           TEXT    NOT NULL CHECK (kind   IN ('profit_goal','loss_limit')),
      period         TEXT    NOT NULL CHECK (period IN ('daily','weekly','monthly')),
      amount         REAL    NOT NULL,
      effective_from TEXT    NOT NULL DEFAULT (date('now')),
      effective_to   TEXT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS reviews (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id   INTEGER NOT NULL REFERENCES accounts(id),
      period       TEXT    NOT NULL CHECK (period IN ('weekly','monthly')),
      period_start TEXT    NOT NULL,
      reflection   TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE (account_id, period, period_start)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed a default account if none exists
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM accounts LIMIT 1');
  if (!existing) {
    await db.runAsync(
      `INSERT INTO accounts (name, currency, starting_balance) VALUES (?, ?, ?)`,
      ['Main', 'USD', 0]
    );
  }
}

// ============================================================
// Trade CRUD
// ============================================================

export async function getRecentTrades(db: SQLiteDatabase): Promise<Trade[]> {
  return db.getAllAsync<Trade>(
    `SELECT * FROM trades ORDER BY entry_at DESC LIMIT 20`
  );
}

export async function getTradeById(
  db: SQLiteDatabase,
  id: number
): Promise<TradeWithInstrument | null> {
  return db.getFirstAsync<TradeWithInstrument>(`
    SELECT t.*,
           i.symbol,
           i.name   AS instrument_name,
           i.price_mode,
           i.contract_size
    FROM   trades t
    JOIN   instruments i ON i.id = t.instrument_id
    WHERE  t.id = ?
  `, [id]);
}

export async function insertTrade(
  db: SQLiteDatabase,
  trade: Omit<Trade, 'id' | 'created_at' | 'updated_at'>
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO trades
      (account_id, instrument_id, strategy_id, emotion_id,
       direction, status, entry_price, exit_price, size,
       stop_loss, take_profit, entry_at, exit_at,
       fees, followed_rules, notes, reflection)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      trade.account_id,
      trade.instrument_id,
      trade.strategy_id ?? null,
      trade.emotion_id ?? null,
      trade.direction,
      trade.status,
      trade.entry_price,
      trade.exit_price ?? null,
      trade.size,
      trade.stop_loss ?? null,
      trade.take_profit ?? null,
      trade.entry_at,
      trade.exit_at ?? null,
      trade.fees,
      trade.followed_rules ?? null,
      trade.notes ?? null,
      trade.reflection ?? null,
    ]
  );
  return result.lastInsertRowId;
}

export async function updateTrade(
  db: SQLiteDatabase,
  id: number,
  fields: Partial<Omit<Trade, 'id' | 'created_at'>>
): Promise<void> {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (keys.length === 0) return;
  const setClauses = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k] ?? null);
  await db.runAsync(
    `UPDATE trades SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`,
    [...values, id]
  );
}

export async function deleteTrade(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM trades WHERE id = ?', [id]);
}

// ============================================================
// Instrument helpers
// ============================================================

/**
 * Look up an instrument by symbol (case-insensitive) with asset_class='stock'.
 * Creates one if it doesn't exist. Returns the instrument id.
 */
export async function getOrCreateInstrument(
  db: SQLiteDatabase,
  rawSymbol: string
): Promise<number> {
  const symbol = rawSymbol.toUpperCase().trim();

  const existing = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM instruments WHERE symbol = ? AND asset_class = 'stock' LIMIT 1`,
    [symbol]
  );
  if (existing) return existing.id;

  const result = await db.runAsync(
    `INSERT INTO instruments (symbol, asset_class, price_mode, contract_size)
     VALUES (?, 'stock', 'standard', 1)`,
    [symbol]
  );
  return result.lastInsertRowId;
}
