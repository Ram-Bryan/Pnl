import { SQLiteDatabase } from 'expo-sqlite';
import {
  Trade,
  Account,
  AssetClass,
  PriceMode,
  TradeStyle,
  TradeDirection,
  TradeStatus,
  TradeFill,
  Emotion,
  Tag,
  Strategy,
  StrategyRule,
  Instrument,
} from './schema';
import { TradeWithInstrument } from '../stats/computeStats';

export type TradeDraft = {
  account_id: number;
  instrument_id: number;
  strategy_id: number | null;
  emotion_id: number | null;
  direction: TradeDirection;
  status: TradeStatus;
  entry_price: number;
  exit_price: number | null;
  size: number;
  stop_loss: number | null;
  take_profit: number | null;
  entry_at: string;
  exit_at: string | null;
  fees: number;
  followed_rules: 0 | 1 | null;
  notes: string | null;
  reflection: string | null;
  trade_style: TradeStyle | null;
  entry_condition: string | null;
  exit_condition: string | null;
};

export type RuleCheck = { ruleId: number; rule_text: string; checked: 0 | 1 };

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
      price_mode       TEXT    NOT NULL CHECK (price_mode IN ('standard','cents')) DEFAULT 'standard',
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
      trade_style    TEXT CHECK (trade_style IN ('intraday','positional','swing','investment')),
      entry_condition TEXT,
      exit_condition  TEXT,
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
    CREATE TABLE IF NOT EXISTS trade_fills (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id    INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
      side        TEXT    NOT NULL CHECK (side IN ('entry','exit')),
      price       REAL    NOT NULL,
      quantity    REAL    NOT NULL,
      note        TEXT,
      occurred_at TEXT    NOT NULL DEFAULT (datetime('now')),
      sort_order  INTEGER NOT NULL DEFAULT 0
    );
  `);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_trade_fills_trade ON trade_fills(trade_id);`);

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

  // --- account price_mode (additive; migrates the legacy settings.accountType) ---
  const accountsCols = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM pragma_table_info('accounts')`
  );
  const hasAccountPriceMode = accountsCols.some((c) => c.name === 'price_mode');

  if (!hasAccountPriceMode) {
    await db.execAsync(`
      ALTER TABLE accounts ADD COLUMN price_mode TEXT NOT NULL
        CHECK (price_mode IN ('standard','cents')) DEFAULT 'standard';
    `);
    const legacy = await getSetting(db, 'accountType');
    if (legacy === 'standard' || legacy === 'cents') {
      await db.runAsync(
        `UPDATE accounts SET price_mode = ? WHERE id = (SELECT id FROM accounts ORDER BY id LIMIT 1)`,
        [legacy]
      );
    }
    await db.runAsync(`DELETE FROM settings WHERE key = 'accountType'`);
  }

  // --- v2 upgrade (additive; no-op on fresh installs) ---
  const tradesCols = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM pragma_table_info('trades')`
  );
  const hasTradeStyle = tradesCols.some((c) => c.name === 'trade_style');

  if (!hasTradeStyle) {
    await db.execAsync(`ALTER TABLE trades ADD COLUMN trade_style TEXT CHECK (trade_style IN ('intraday','positional','swing','investment'));`);
    await db.execAsync(`ALTER TABLE trades ADD COLUMN entry_condition TEXT;`);
    await db.execAsync(`ALTER TABLE trades ADD COLUMN exit_condition TEXT;`);
  }

  const instrSql = await db.getFirstAsync<{ sql: string }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'instruments'`
  );
  const isNewInstruments = instrSql ? instrSql.sql.includes('equity') : false;

  if (!isNewInstruments) {
    // foreign_keys OFF: DROP TABLE instruments would fail on an existing DB with trades; ids are preserved, so FKs re-resolve after the rename.
    await db.execAsync(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE instruments_v2 (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol         TEXT NOT NULL,
        name           TEXT,
        asset_class    TEXT NOT NULL CHECK (asset_class IN ('equity','fno','crypto','forex','gold','currency')),
        quote_currency TEXT NOT NULL DEFAULT 'USD',
        price_mode     TEXT NOT NULL CHECK (price_mode IN ('standard','cents')) DEFAULT 'standard',
        contract_size  REAL NOT NULL DEFAULT 1,
        tick_size      REAL,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (symbol, asset_class)
      );
      INSERT INTO instruments_v2 (id, symbol, name, asset_class, quote_currency, price_mode, contract_size, tick_size, created_at)
        SELECT id, symbol, name,
               CASE asset_class
                 WHEN 'stock' THEN 'equity'
                 WHEN 'futures' THEN 'fno'
                 WHEN 'option' THEN 'fno'
                 ELSE 'equity'
               END,
               quote_currency, price_mode, contract_size, tick_size, created_at
        FROM instruments;
      DROP TABLE instruments;
      ALTER TABLE instruments_v2 RENAME TO instruments;
      PRAGMA foreign_keys = ON;
    `);
  }

  // --- seed reference data (idempotent) ---
  await db.execAsync(`
    INSERT OR IGNORE INTO emotions (name, color) VALUES
      ('Calm', '#059669'), ('Confident', '#059669'), ('Focused', '#0284c7'),
      ('Anxious', '#f59e0b'), ('Fear', '#f59e0b'), ('Greed', '#ef4444'),
      ('FOMO', '#ef4444'), ('Revenge', '#dc2626'), ('Impatient', '#f59e0b'),
      ('Frustrated', '#f59e0b');

    INSERT OR IGNORE INTO tags (name, color) VALUES
      ('Rushed entry', '#ef4444'), ('Chased price', '#ef4444'),
      ('Moved stop', '#f59e0b'), ('Oversized', '#ef4444'),
      ('No plan', '#f59e0b'), ('Entered too early', '#f59e0b'),
      ('Exited too early', '#f59e0b'), ('Held too long', '#f59e0b'),
      ('Skipped the setup', '#94a3b8'), ('Followed rules', '#059669');

    INSERT OR IGNORE INTO strategies (name, description) VALUES
      ('Breakout', 'Enter on a confirmed breakout of a level.'),
      ('Trend Following', 'Trade in the direction of the dominant trend.'),
      ('Mean Reversion', 'Fade extended moves back toward the mean.'),
      ('Scalping', 'Very short holding times, small targets.'),
      ('News Trade', 'Trade the reaction to scheduled news.'),
      ('Swing', 'Multi-day swing setups.');
  `);
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
           i.quote_currency,
           i.price_mode,
           i.contract_size,
           i.asset_class,
           s.name   AS strategy_name,
           e.name   AS emotion_name
    FROM   trades t
    JOIN   instruments i ON i.id = t.instrument_id
    LEFT JOIN strategies s ON s.id = t.strategy_id
    LEFT JOIN emotions e  ON e.id = t.emotion_id
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
       trade_style, entry_condition, exit_condition,
       direction, status, entry_price, exit_price, size,
       stop_loss, take_profit, entry_at, exit_at,
       fees, followed_rules, notes, reflection)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      trade.account_id,
      trade.instrument_id,
      trade.strategy_id ?? null,
      trade.emotion_id ?? null,
      trade.trade_style ?? null,
      trade.entry_condition ?? null,
      trade.exit_condition ?? null,
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

type FillRow = { side: 'entry' | 'exit'; price: number; quantity: number; note: string | null; occurred_at: string };

export async function getTradeWithFills(
  db: SQLiteDatabase,
  id: number
): Promise<{ trade: TradeWithInstrument; fills: TradeFill[] } | null> {
  const trade = await getTradeById(db, id);
  if (!trade) return null;
  const fills = await db.getAllAsync<TradeFill>(
    `SELECT * FROM trade_fills WHERE trade_id = ? ORDER BY side, sort_order`, [id]
  );
  return { trade, fills };
}

export async function insertTradeWithFills(
  db: SQLiteDatabase,
  trade: TradeDraft,
  fills: FillRow[]
): Promise<number> {
  const id = await insertTrade(db, trade);
  await replaceFills(db, id, fills);
  return id;
}

async function replaceFills(db: SQLiteDatabase, tradeId: number, fills: FillRow[]): Promise<void> {
  await db.runAsync('DELETE FROM trade_fills WHERE trade_id = ?', [tradeId]);
  for (let i = 0; i < fills.length; i++) {
    const f = fills[i];
    await db.runAsync(
      `INSERT INTO trade_fills (trade_id, side, price, quantity, note, occurred_at, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tradeId, f.side, f.price, f.quantity, f.note, f.occurred_at, i]
    );
  }
}

export async function updateTradeWithFills(
  db: SQLiteDatabase,
  id: number,
  trade: TradeDraft,
  fills: FillRow[]
): Promise<void> {
  await updateTrade(db, id, trade);
  await replaceFills(db, id, fills);
}

export async function getEmotions(db: SQLiteDatabase): Promise<Emotion[]> {
  return db.getAllAsync<Emotion>('SELECT * FROM emotions ORDER BY id');
}

export async function getTags(db: SQLiteDatabase): Promise<Tag[]> {
  return db.getAllAsync<Tag>('SELECT * FROM tags ORDER BY id');
}

export async function getStrategies(db: SQLiteDatabase): Promise<Strategy[]> {
  return db.getAllAsync<Strategy>(
    `SELECT * FROM strategies WHERE archived_at IS NULL ORDER BY id`
  );
}

export async function getStrategyRules(db: SQLiteDatabase, strategyId: number): Promise<StrategyRule[]> {
  return db.getAllAsync<StrategyRule>(
    `SELECT * FROM strategy_rules WHERE strategy_id = ? AND archived_at IS NULL ORDER BY sort_order`,
    [strategyId]
  );
}

export async function getTradeTags(db: SQLiteDatabase, tradeId: number): Promise<Tag[]> {
  return db.getAllAsync<Tag>(
    `SELECT t.* FROM tags t JOIN trade_tags tt ON tt.tag_id = t.id WHERE tt.trade_id = ? ORDER BY t.id`,
    [tradeId]
  );
}

export async function getTradeRuleChecks(db: SQLiteDatabase, tradeId: number): Promise<RuleCheck[]> {
  return db.getAllAsync<RuleCheck>(
    `SELECT c.strategy_rule_id AS ruleId, r.rule_text, c.checked
     FROM trade_rule_checks c
     JOIN strategy_rules r ON r.id = c.strategy_rule_id
     WHERE c.trade_id = ? ORDER BY r.sort_order`,
    [tradeId]
  );
}

export async function getTradeScreenshots(db: SQLiteDatabase, tradeId: number): Promise<string[]> {
  const rows = await db.getAllAsync<{ file_path: string }>(
    `SELECT file_path FROM trade_screenshots WHERE trade_id = ? ORDER BY sort_order`,
    [tradeId]
  );
  return rows.map((row) => row.file_path);
}

export async function saveTradeAssociations(
  db: SQLiteDatabase,
  tradeId: number,
  associations: {
    strategyId: number | null;
    emotionId: number | null;
    tagIds: number[];
    ruleChecks: { ruleId: number; checked: 0 | 1 }[];
  }
): Promise<void> {
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    await db.runAsync('DELETE FROM trade_tags WHERE trade_id = ?', [tradeId]);
    await db.runAsync('DELETE FROM trade_rule_checks WHERE trade_id = ?', [tradeId]);
    for (const tagId of associations.tagIds) {
      await db.runAsync(
        `INSERT OR IGNORE INTO trade_tags (trade_id, tag_id) VALUES (?, ?)`,
        [tradeId, tagId]
      );
    }
    for (const rc of associations.ruleChecks) {
      await db.runAsync(
        `INSERT OR REPLACE INTO trade_rule_checks (trade_id, strategy_rule_id, checked) VALUES (?, ?, ?)`,
        [tradeId, rc.ruleId, rc.checked]
      );
    }
    await db.execAsync('COMMIT;');
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  }
}

export async function saveTradeScreenshots(
  db: SQLiteDatabase,
  tradeId: number,
  filePaths: string[]
): Promise<void> {
  for (let i = 0; i < filePaths.length; i++) {
    await db.runAsync(
      `INSERT INTO trade_screenshots (trade_id, file_path, sort_order) VALUES (?, ?, ?)`,
      [tradeId, filePaths[i], i]
    );
  }
}

// ============================================================
// Instrument helpers
// ============================================================

export async function getInstruments(db: SQLiteDatabase): Promise<Instrument[]> {
  return db.getAllAsync<Instrument>('SELECT * FROM instruments ORDER BY symbol');
}

export async function insertInstrument(
  db: SQLiteDatabase,
  inst: Omit<Instrument, 'id' | 'created_at'>
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO instruments (symbol, name, asset_class, quote_currency, price_mode, contract_size, tick_size)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      inst.symbol.toUpperCase().trim(),
      inst.name ?? null,
      inst.asset_class,
      inst.quote_currency || 'USD',
      inst.price_mode,
      inst.contract_size || 1,
      inst.tick_size ?? null,
    ]
  );
  return result.lastInsertRowId;
}

export async function updateInstrument(
  db: SQLiteDatabase,
  id: number,
  inst: Partial<Omit<Instrument, 'id' | 'created_at'>>
): Promise<void> {
  const keys = Object.keys(inst) as (keyof typeof inst)[];
  if (keys.length === 0) return;
  const setClauses = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => inst[k] ?? null);
  await db.runAsync(`UPDATE instruments SET ${setClauses} WHERE id = ?`, [...values, id]);
}

export async function deleteInstrument(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM instruments WHERE id = ?', [id]);
}

// ─── Account helpers ─────────────────────────────────────────────────────────

export async function getFirstAccount(db: SQLiteDatabase): Promise<Account | null> {
  return db.getFirstAsync<Account>('SELECT * FROM accounts ORDER BY id LIMIT 1');
}

export async function updateAccountPriceMode(
  db: SQLiteDatabase,
  id: number,
  priceMode: PriceMode
): Promise<void> {
  await db.runAsync('UPDATE accounts SET price_mode = ? WHERE id = ?', [priceMode, id]);
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

export async function getAllSettings(db: SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  return result;
}

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}
