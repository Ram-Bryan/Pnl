# Display-Unit-Only Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every P&L value sized by the trade's own account type (`accounts.price_mode`), and make the Settings toggle convert the display unit only — `-0.10 USC ↔ -$0.001`, never recomputing sizing.

**Architecture:** The account's `price_mode` ('standard' | 'cents') moves from instruments to the `accounts` table via an idempotent migration that copies the legacy `settings.accountType` value. Pure functions change to derive sizing from `trade.price_mode` (`computeTradePnl(trade)`, `computeStats(trades)` — no account-type argument). A new `DisplayUnit` type ('usd' | 'usc') drives `formatPnl(value, displayUnit)` and sub-cent USD precision (2/3/4 dp). `SettingsContext` gains `displayUnit` + `setDisplayUnit`; `setAccountType` now persists to `accounts.price_mode` and never touches the display unit.

**Tech Stack:** Expo SDK 57 / React Native 0.86, expo-sqlite, TypeScript strict, NativeWind, Vitest, pnpm.

## Global Constraints

- Per-trade P&L: every trade is sized by its own `price_mode` (from `accounts`), never by the global toggle.
- `price_mode` lives on the `accounts` table; trades resolve it via `JOIN accounts a ON a.id = t.account_id`.
- Instrument `price_mode` is unused; do NOT touch `app/(tabs)/symbols.tsx` (it hardcodes `'standard'` today).
- Display unit is a view preference only (`usd | usc`); it never recomputes P&L, only formats.
- `computeTradePnl(trade)` / `computeStats(trades)` take NO account-type argument.
- `formatPnl(value, displayUnit)`: USC = value × 100, 2 dp; USD = 2 dp (`|v| ≥ 0.01`), 3 dp (`0.001 ≤ |v| < 0.01`), 4 dp (`|v| < 0.001`); `k`-abbreviation at ≥ 1000 unchanged.
- Migration is idempotent: `ALTER TABLE accounts ADD COLUMN price_mode ... DEFAULT 'standard'`; copy legacy `settings.accountType` into the seeded account's `price_mode`; delete the legacy key. Existing `instruments_v2` migration in `src/db/database.ts:240-275` is the pattern.
- `setAccountType` persists to `accounts.price_mode`; `setDisplayUnit` persists to settings key `displayUnit`. Changing account type NEVER rewrites display unit; display defaults to account type only at load.
- `shadow-*` classes stay static literals (never toggled at runtime); numeric displays keep `fontVariant: ['tabular-nums']`.
- Tests: update `src/lib/format.test.ts` and `src/stats/computeStats.test.ts`; `src/stats/tradeMath.test.ts` stays untouched (4 MT5 cases must keep passing).
- No comments unless they explain *why*.

---

### Task 1: `formatPnl(value, displayUnit)` with sub-cent precision

**Files:**
- Modify: `src/lib/format.ts` (whole file, lines 1-33)
- Test: `src/lib/format.test.ts` (whole file, lines 1-44)

**Interfaces:**
- Consumes: nothing new.
- Produces: `export type DisplayUnit = 'usd' | 'usc'` and `export function formatPnl(value: number, displayUnit?: DisplayUnit): string`. `formatMoney`, `formatPrice`, `capitalize` unchanged.

- [ ] **Step 1: Rewrite the failing test file**

Replace the whole content of `src/lib/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatPnl, formatMoney, formatPrice, capitalize } from './format';

describe('formatPnl', () => {
  it('formats standard values as real USD', () => {
    expect(formatPnl(1.4)).toBe('$1.40');
    expect(formatPnl(-1.4)).toBe('$1.40');
  });
  it('abbreviates large standard values with k', () => {
    expect(formatPnl(1350)).toBe('$1.4k');
  });
  it('shows sub-cent USD with 3 decimals', () => {
    expect(formatPnl(0.001)).toBe('$0.001');
    expect(formatPnl(-0.0010155)).toBe('$0.001');
  });
  it('shows sub-milli USD with 4 decimals', () => {
    expect(formatPnl(0.0005)).toBe('$0.0005');
  });
  it('displays USC as value times 100', () => {
    expect(formatPnl(-0.0010155, 'usc')).toBe('0.10 USC');
  });
  it('abbreviates large USC values with k', () => {
    expect(formatPnl(14.5, 'usc')).toBe('1.4k USC');
  });
  it('shows 2 decimals below 1000 USC', () => {
    expect(formatPnl(1.8, 'usc')).toBe('180.00 USC');
  });
});

describe('formatMoney', () => {
  it('formats without sign', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
  });
});

describe('formatPrice', () => {
  it('trims trailing zeros to at most 4 decimals', () => {
    expect(formatPrice(1234.5)).toBe('1234.5');
    expect(formatPrice(1.23456)).toBe('1.2346');
    expect(formatPrice(100)).toBe('100');
  });
});

describe('capitalize', () => {
  it('capitalizes first letter only', () => {
    expect(capitalize('intraday')).toBe('Intraday');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/format.test.ts`
Expected: FAIL — the `'cents'` string literal no longer matches `DisplayUnit`, and the sub-cent case expects `$0.00` vs new `$0.001`.

- [ ] **Step 3: Implement `formatPnl`**

Replace the whole content of `src/lib/format.ts`:

```ts
export type DisplayUnit = 'usd' | 'usc';

const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPnl(value: number, displayUnit: DisplayUnit = 'usd'): string {
  const isUsc = displayUnit === 'usc';
  // value is always real USD. USC display scales up 100x.
  const displayValue = isUsc ? value * 100 : value;
  const v = Math.abs(displayValue);
  if (isUsc) {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k USC`;
    return `${v.toFixed(2)} USC`;
  }
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  const digits = v >= 0.01 ? 2 : v >= 0.001 ? 3 : 4;
  return `$${v.toFixed(digits)}`;
}

export function formatMoney(value: number): string {
  return `$${moneyFormatter.format(value)}`;
}

export function formatPrice(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 2 : 4;
  return Number(value.toFixed(digits)).toString();
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/format.test.ts`
Expected: PASS (8 assertions in `formatPnl`, others unchanged).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean. Note `PnlText.tsx` still passes `'standard' | 'cents'` literals as the second arg — those match `DisplayUnit` structurally, so no error yet. Later tasks fix the naming.

- [ ] **Step 6: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: formatPnl takes DisplayUnit with sub-cent precision"
```

---

### Task 2: Per-trade `price_mode` in `computeTradePnl` / `computeStats`

**Files:**
- Modify: `src/stats/computeStats.ts` (lines 60-73, 87-131)
- Test: `src/stats/computeStats.test.ts` (whole file, lines 1-97)

**Interfaces:**
- Consumes: `trade.price_mode` (`'standard' | 'cents'` on `TradeWithInstrument` — already exists); `AccountType` from `src/stats/tradeMath`.
- Produces: `computeTradePnl(trade: TradeWithInstrument): number` and `computeStats(trades: TradeWithInstrument[]): StatsResult` — the `accountType` parameter is removed from both. No other module may pass an account-type argument to these.

- [ ] **Step 1: Rewrite the failing test file**

Replace the whole content of `src/stats/computeStats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeStats, computeTradePnl } from './computeStats';
import type { TradeWithInstrument } from './computeStats';
import { formatPnl } from '../lib/format';

function makeTrade(overrides: Partial<TradeWithInstrument>): TradeWithInstrument {
  return {
    id: 1, account_id: 1, instrument_id: 1, strategy_id: null, emotion_id: null,
    trade_style: null, entry_condition: null, exit_condition: null,
    direction: 'long', status: 'closed', entry_price: 100, exit_price: 101,
    size: 1, stop_loss: null, take_profit: null,
    entry_at: '2026-08-01T10:00:00', exit_at: '2026-08-01T11:00:00',
    fees: 0, followed_rules: null, notes: null, reflection: null,
    created_at: '2026-08-01T10:00:00', updated_at: '2026-08-01T11:00:00',
    symbol: 'TEST', instrument_name: null, quote_currency: 'USD',
    price_mode: 'standard', contract_size: 100, asset_class: 'equity',
    strategy_name: null, emotion_name: null,
    ...overrides,
  };
}

describe('computeStats', () => {
  it('sizes each trade by its own price_mode', () => {
    const standard = makeTrade({ id: 1, price_mode: 'standard' });
    const cents = makeTrade({ id: 2, size: 2, price_mode: 'cents' });
    // standard: 1 lot × 100 contract × 1 = 100; cents: 2 × 100 × 0.01 = 2
    expect(computeTradePnl(standard)).toBeCloseTo(100, 6);
    expect(computeTradePnl(cents)).toBeCloseTo(2, 6);
    expect(computeStats([standard, cents]).allTimePnl).toBeCloseTo(102, 6);
  });

  it('derives totals, win rate and streak from recent results', () => {
    const trades = [
      makeTrade({ id: 1, entry_price: 100, exit_price: 101 }),
      makeTrade({ id: 2, entry_price: 100, exit_price: 99, exit_at: '2026-08-02T11:00:00' }),
      makeTrade({ id: 3, entry_price: 100, exit_price: 99, exit_at: '2026-08-03T11:00:00' }),
    ];
    const stats = computeStats(trades);
    expect(stats.totalTrades).toBe(3);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(2);
    expect(stats.winRate).toBeCloseTo(33.33, 1);
    expect(stats.currentStreak).toBe(-2);
  });
});

describe('computeTradePnl', () => {
  it('converts JPY to USD even when the stored quote is the generic USD default (short USDJPY 0.01 lot, cents)', () => {
    // MT5: -0.16 JPY / 157.536 = -0.0010155 USD -> -0.10 USC
    const trade = makeTrade({
      symbol: 'USDJPY',
      quote_currency: 'USD',
      price_mode: 'cents',
      direction: 'short',
      entry_price: 157.536,
      exit_price: 157.552,
      size: 0.01,
      contract_size: 100000,
    });
    const pnl = computeTradePnl(trade);
    expect(pnl).toBeCloseTo(-0.0010155, 6);
    expect(pnl * 100).toBeCloseTo(-0.10, 2);
  });

  it('respects an explicitly stored non-default quote currency', () => {
    const trade = makeTrade({
      symbol: 'USDJPY',
      quote_currency: 'JPY',
      price_mode: 'cents',
      direction: 'short',
      entry_price: 157.536,
      exit_price: 157.552,
      size: 0.01,
      contract_size: 100000,
    });
    expect(computeTradePnl(trade)).toBeCloseTo(-0.0010155, 6);
  });

  it('display unit converts the same canonical P&L (USC <-> USD) without recomputing', () => {
    // Same trade as it appears on the dashboard hero, trade card and detail screen.
    const trade = makeTrade({
      symbol: 'USDJPY',
      quote_currency: 'USD',
      price_mode: 'cents',
      direction: 'short',
      entry_price: 157.536,
      exit_price: 157.552,
      size: 0.01,
      contract_size: 100000,
    });

    const pnl = computeTradePnl(trade);
    expect(pnl).toBeCloseTo(-0.0010155, 6);
    expect(formatPnl(pnl, 'usc')).toBe('0.10 USC');
    expect(formatPnl(pnl, 'usd')).toBe('$0.001');

    // Dashboard hero shows the sum of visible trades; the sum must convert too.
    const hero = computeStats([trade]).allTimePnl;
    expect(hero).toBeCloseTo(-0.0010155, 6);
    expect(formatPnl(hero, 'usc')).toBe('0.10 USC');
    expect(formatPnl(hero, 'usd')).toBe('$0.001');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/stats/computeStats.test.ts`
Expected: FAIL — `computeStats(trades, 'standard')`/`computeTradePnl(trade, 'cents')` no longer compile (too many arguments), and `formatPnl` still uses the old signature.

- [ ] **Step 3: Implement per-trade sizing**

Edit `src/stats/computeStats.ts`:

1. In `computeTradePnl` (lines 60-73), remove the `accountType` parameter and pass `accountType: trade.price_mode`:

```ts
export function computeTradePnl(trade: TradeWithInstrument): number {
  if (trade.exit_price == null) return 0;

  return computeTradePnlInUsd({
    direction: trade.direction,
    entryPrice: trade.entry_price,
    exitPrice: trade.exit_price,
    lots: trade.size,
    contractSize: trade.contract_size,
    quoteCurrency: resolveQuoteCurrency(trade.symbol, trade.quote_currency),
    fees: trade.fees,
    accountType: trade.price_mode,
  });
}
```

2. In `computeStats` (line 87), drop the parameter:

```ts
export function computeStats(trades: TradeWithInstrument[]): StatsResult {
```

3. Inside `computeStats`, replace all three `computeTradePnl(t, accountType)` calls (lines 99, 122, 125) with `computeTradePnl(t)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/stats/computeStats.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL — `useDashboard.ts:81`, `index.tsx`, `trades.tsx`, `trade/[id].tsx`, `TradeRow.tsx` still pass the removed argument. These are fixed in Tasks 4/6/7/8. (Run this as a note; do not fix yet — later tasks own those files.)

- [ ] **Step 6: Commit**

```bash
git add src/stats/computeStats.ts src/stats/computeStats.test.ts
git commit -m "feat: size each trade by its own price_mode"
```

---

### Task 3: `accounts.price_mode` column, migration, and DB helpers

**Files:**
- Modify: `src/db/schema.ts` (lines 7-13)
- Modify: `src/db/database.ts` (imports lines 1-17; accounts DDL lines 50-58; seeding block lines 219-226; new account helpers section near line 573)

**Interfaces:**
- Consumes: `PriceMode` type already in `src/db/schema.ts`.
- Produces: `Account` gains `price_mode: PriceMode`; `getFirstAccount(db: SQLiteDatabase): Promise<Account | null>`; `updateAccountPriceMode(db: SQLiteDatabase, id: number, priceMode: PriceMode): Promise<void>`. Migration must be idempotent (safe on every app start) and must leave no `accountType` key in `settings`.

- [ ] **Step 1: Add `price_mode` to the `Account` type**

In `src/db/schema.ts`, change the `Account` type:

```ts
export type Account = {
  id: number;
  name: string;
  currency: string; // ISO 4217
  starting_balance: number;
  price_mode: PriceMode;
  created_at: string;
};
```

- [ ] **Step 2: Update the accounts DDL and imports**

In `src/db/database.ts`:

1. Add `Account` to the import block from `./schema` (line 3-15), so it reads `Account, Trade, AssetClass, ...` in the same style.

2. Replace the accounts `CREATE TABLE` (lines 50-58):

```sql
CREATE TABLE IF NOT EXISTS accounts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL DEFAULT 'Main',
  currency         TEXT    NOT NULL DEFAULT 'USD',
  starting_balance REAL    NOT NULL DEFAULT 0,
  price_mode       TEXT    NOT NULL CHECK (price_mode IN ('standard','cents')) DEFAULT 'standard',
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 3: Add the idempotent migration after account seeding**

Immediately after the account-seeding block (after line 226, before the `// --- v2 upgrade` comment), insert:

```ts
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
```

(`getSetting` is a function declaration later in the file, so it is hoisted and callable from here.)

- [ ] **Step 4: Add account helpers**

In `src/db/database.ts`, just above the `// ─── Settings helpers` section (line 573), add:

```ts
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
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean. (The migration itself cannot run in Vitest — expo-sqlite has no node runtime. It is verified by code review against the pattern at `database.ts:240-275` and by manual smoke test in Task 10.)

- [ ] **Step 6: Run the existing test suite**

Run: `pnpm test`
Expected: PASS (format + computeStats were already updated in Tasks 1-2; nothing else reads `Account` directly).

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/db/database.ts
git commit -m "feat: account-level price_mode with legacy settings migration"
```

---

### Task 4: Resolve `price_mode` from `accounts` in all trade queries

**Files:**
- Modify: `src/db/database.ts` (`getTradeById`, lines 316-332)
- Modify: `src/hooks/useDashboard.ts` (query, lines 38-56)
- Modify: `src/hooks/useTrades.ts` (query, lines 16-34)

**Interfaces:**
- Consumes: `trades.account_id` FK → `accounts.id` (both already exist in the schema).
- Produces: the three queries still alias the column as `price_mode`, so `TradeWithInstrument.price_mode` keeps working with no type changes. Instrument `price_mode` is now never selected by the app.

- [ ] **Step 1: Update `getTradeById`**

In `src/db/database.ts`, replace the query in `getTradeById` (lines 316-331) with:

```ts
  return db.getFirstAsync<TradeWithInstrument>(`
    SELECT t.*,
           i.symbol,
           i.name   AS instrument_name,
           i.quote_currency,
           a.price_mode,
           i.contract_size,
           i.asset_class,
           s.name   AS strategy_name,
           e.name   AS emotion_name
    FROM   trades t
    JOIN   accounts a ON a.id = t.account_id
    JOIN   instruments i ON i.id = t.instrument_id
    LEFT JOIN strategies s ON s.id = t.strategy_id
    LEFT JOIN emotions e  ON e.id = t.emotion_id
    WHERE  t.id = ?
  `, [id]);
```

- [ ] **Step 2: Update the `useDashboard` query**

In `src/hooks/useDashboard.ts`, replace the query string (lines 38-56) with:

```ts
        db.getAllAsync<TradeWithInstrument>(`
          SELECT t.*,
                 i.symbol,
                 i.name   AS instrument_name,
                 i.quote_currency,
                 a.price_mode,
                 i.contract_size,
                 i.asset_class,
                 t.trade_style,
                 t.entry_condition,
                 t.exit_condition,
                 s.name   AS strategy_name,
                 e.name   AS emotion_name
          FROM   trades t
          JOIN   accounts a ON a.id = t.account_id
          JOIN   instruments i ON i.id = t.instrument_id
          LEFT JOIN strategies s ON s.id = t.strategy_id
          LEFT JOIN emotions e  ON e.id = t.emotion_id
          ORDER  BY t.entry_at DESC
        `),
```

- [ ] **Step 3: Update the `useTrades` query**

In `src/hooks/useTrades.ts`, replace the query string (lines 16-34) with:

```ts
      const rows = await db.getAllAsync<TradeWithInstrument>(`
        SELECT t.*,
               i.symbol,
               i.name   AS instrument_name,
               i.quote_currency,
               a.price_mode,
               i.contract_size,
               i.asset_class,
               t.trade_style,
               t.entry_condition,
               t.exit_condition,
               s.name   AS strategy_name,
               e.name   AS emotion_name
        FROM   trades t
        JOIN   accounts a ON a.id = t.account_id
        JOIN   instruments i ON i.id = t.instrument_id
        LEFT JOIN strategies s ON s.id = t.strategy_id
        LEFT JOIN emotions e  ON e.id = t.emotion_id
        ORDER  BY t.entry_at DESC
      `);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean (queries are strings; types unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/db/database.ts src/hooks/useDashboard.ts src/hooks/useTrades.ts
git commit -m "feat: join accounts for price_mode in trade queries"
```

---

### Task 5: `SettingsContext` gains `displayUnit`; `setAccountType` writes to `accounts`

**Files:**
- Modify: `src/hooks/SettingsContext.tsx` (whole file, lines 1-54)

**Interfaces:**
- Consumes: `getFirstAccount`, `updateAccountPriceMode` (Task 3); `getAllSettings`, `setSetting` (already in `src/db/database.ts`); `DisplayUnit` (Task 1); `AccountType` (already in `src/stats/tradeMath`).
- Produces: `useAccountSetting()` now returns `{ accountType: AccountType; displayUnit: DisplayUnit; loading: boolean; setAccountType: (value: AccountType) => Promise<void>; setDisplayUnit: (value: DisplayUnit) => Promise<void> }`. Behavior: on load, `accountType` comes from the first account's `price_mode`; `displayUnit` is the stored `settings.displayUnit` if present, else defaults from account type (`cents → 'usc'`, `standard → 'usd'`). `setAccountType` persists to `accounts.price_mode` and must NOT change `displayUnit`. `setDisplayUnit` persists to the `settings` table under key `displayUnit`.

- [ ] **Step 1: Rewrite `SettingsContext.tsx`**

Replace the whole file:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getAllSettings, setSetting, getFirstAccount, updateAccountPriceMode } from '../db/database';
import { AccountType } from '../stats/tradeMath';
import { DisplayUnit } from '../lib/format';

type SettingsContextValue = {
  accountType: AccountType;
  displayUnit: DisplayUnit;
  loading: boolean;
  setAccountType: (value: AccountType) => Promise<void>;
  setDisplayUnit: (value: DisplayUnit) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

// Single reactive source of truth for account type (sizing) and display unit
// (view). Every P&L screen subscribes here, so toggling either re-renders all
// of them instantly instead of waiting for a per-screen refetch on focus.
// The display unit defaults to the account type only at load; after that the
// two settings are independent — changing the account type never rewrites the
// display unit.
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [accountType, setAccountTypeState] = useState<AccountType>('standard');
  const [displayUnit, setDisplayUnitState] = useState<DisplayUnit>('usd');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const settings = await getAllSettings(db);
        const account = await getFirstAccount(db);
        const accountTypeValue = (account?.price_mode ?? 'standard') as AccountType;
        const stored = settings['displayUnit'];
        const defaultUnit: DisplayUnit = accountTypeValue === 'cents' ? 'usc' : 'usd';
        if (active) {
          setAccountTypeState(accountTypeValue);
          setDisplayUnitState(stored === 'usc' || stored === 'usd' ? stored : defaultUnit);
        }
      } catch (e) {
        console.error('SettingsProvider: failed to load settings', e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [db]);

  const setAccountType = useCallback(async (value: AccountType) => {
    const account = await getFirstAccount(db);
    if (!account) throw new Error('No account found. Please restart the app.');
    await updateAccountPriceMode(db, account.id, value);
    setAccountTypeState(value);
  }, [db]);

  const setDisplayUnit = useCallback(async (value: DisplayUnit) => {
    await setSetting(db, 'displayUnit', value);
    setDisplayUnitState(value);
  }, [db]);

  const value = useMemo(
    () => ({ accountType, displayUnit, loading, setAccountType, setDisplayUnit }),
    [accountType, displayUnit, loading, setAccountType, setDisplayUnit]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useAccountSetting(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useAccountSetting must be used within SettingsProvider');
  return ctx;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean — existing consumers still read `accountType`/`setAccountType`, which are still provided.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/SettingsContext.tsx
git commit -m "feat: displayUnit setting in SettingsContext; account type persists to accounts"
```

---

### Task 6: `PnlText`, `TradeRow`, `useDashboard`, and the dashboard screen

**Files:**
- Modify: `src/ui/PnlText.tsx` (whole file)
- Modify: `src/ui/TradeRow.tsx` (whole file)
- Modify: `src/hooks/useDashboard.ts` (whole file)
- Modify: `app/(tabs)/index.tsx` (lines 163-187, 190-246, 249, 334-341, 341, 479, 541, 613, 636-644, 656, 670, 741, 760-762, 815, 840, 851, 858, 885)

**Interfaces:**
- Consumes: `DisplayUnit` (Task 1); `computeTradePnl(trade)`, `computeStats(trades)` (Task 2); `useAccountSetting()` (Task 5).
- Produces: `PnlText` prop `accountType?: 'standard' | 'cents'` becomes `displayUnit?: DisplayUnit`. `TradeRow` keeps `accountType` (for the `Inv` sizing) and gains `displayUnit` (for P&L formatting). `useDashboard()` returns `displayUnit: DisplayUnit` instead of `accountType` and calls `computeStats(trades)` with no argument.

- [ ] **Step 1: Rewrite `PnlText.tsx`**

```tsx
import React from 'react';
import { Text, TextStyle } from 'react-native';
import { formatPnl, DisplayUnit } from '../lib/format';

export function PnlText({
  value,
  size = 'text-base',
  weight = 'font-bold',
  align,
  glow = false,
  displayUnit = 'usd',
}: {
  value: number;
  size?: string;
  weight?: string;
  align?: 'center';
  glow?: boolean;
  displayUnit?: DisplayUnit;
}) {
  const isZero = value === 0;
  const isPositive = value > 0;
  const color = isZero ? 'text-[#6b6880]' : isPositive ? 'text-neon-green' : 'text-neon-red';
  const glowStyle: TextStyle = glow
    ? {
        textShadowColor: isZero ? 'rgba(107,104,128,0.4)' : isPositive ? 'rgba(0,230,138,0.5)' : 'rgba(255,77,106,0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 16,
      }
    : {};

  return (
    <Text
      className={`${color} ${size} ${weight} ${align === 'center' ? 'text-center' : ''}`}
      style={[{ fontVariant: ['tabular-nums'] }, glowStyle]}
    >
      {formatPnl(value, displayUnit)}
    </Text>
  );
}
```

- [ ] **Step 2: Rewrite `TradeRow.tsx`**

```tsx
import React from 'react';
import { Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { TradeWithInstrument, computeTradePnl } from '../stats/computeStats';
import { computeInvestedUsd, AccountType } from '../stats/tradeMath';
import { formatPnl, DisplayUnit } from '../lib/format';

export function TradeRow({
  trade,
  onPress,
  index = 0,
  accountType = 'standard',
  displayUnit = 'usd',
}: {
  trade: TradeWithInstrument;
  onPress: () => void;
  index?: number;
  accountType?: AccountType;
  displayUnit?: DisplayUnit;
}) {
  const entryDate = new Date(trade.entry_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const isOpen = trade.status === 'open';
  const pnl = isOpen ? 0 : computeTradePnl(trade);
  const pnlColor = isOpen ? '#A8AEC1' : pnl >= 0 ? '#00E68A' : '#FF4D6A';
  const pnlFormatted = isOpen ? '–' : formatPnl(pnl, displayUnit);

  const directionColor = trade.direction === 'long' ? '#00E68A' : '#FF4D6A';
  const dirBg = trade.direction === 'long' ? 'rgba(0,230,138,0.1)' : 'rgba(255,77,106,0.1)';

  // Investment in USD, scaled for the account type (cent-account positions are 100x smaller)
  const invested = computeInvestedUsd({
    entryPrice: trade.entry_price,
    lots: trade.size,
    contractSize: trade.contract_size,
    quoteCurrency: trade.quote_currency,
    accountType,
  });

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 50).springify().damping(18)}>
      <Pressable
        onPress={onPress}
        className="mb-3 bg-dark-card rounded-2xl border border-dark-border p-4"
        style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
      >
        {/* ROW 1: Symbol & Direction | PnL */}
        <View className="flex-row items-center justify-between mb-2.5">
          <View className="flex-row items-center gap-x-3">
            <Text className="font-bold text-base text-white tracking-wide">{trade.symbol}</Text>
            <View
              className="px-2 py-0.5 rounded-md border"
              style={{ borderColor: directionColor, backgroundColor: dirBg }}
            >
              <Text style={{ color: directionColor }} className="text-[10px] font-bold uppercase tracking-widest">
                {trade.direction === 'long' ? 'LONG' : 'SHORT'}
              </Text>
            </View>
          </View>
          <Text style={{ color: pnlColor }} className="text-base font-black tracking-wide">
            {pnlFormatted}
          </Text>
        </View>

        {/* ROW 2: Investment */}
        <View className="flex-row items-center mb-2.5">
          <Ionicons name="wallet-outline" size={13} color="#6b6880" />
          <Text className="text-[12px] font-semibold ml-1.5" style={{ color: '#A8AEC1' }}>
            Inv: ${Math.round(invested)}
          </Text>
        </View>

        {/* ROW 3: Date · Status */}
        <View className="flex-row items-center gap-x-4">
          <View className="flex-row items-center gap-x-1">
            <Ionicons name="calendar-outline" size={12} color="#6b6880" />
            <Text className="text-[11px] font-medium" style={{ color: '#6b6880' }}>{entryDate}</Text>
          </View>
          <View
            className="px-2 py-0.5 rounded-md"
            style={{ backgroundColor: isOpen ? 'rgba(77,158,255,0.12)' : 'rgba(0,230,138,0.1)' }}
          >
            <Text
              className="text-[9px] font-bold uppercase tracking-widest"
              style={{ color: isOpen ? '#4D9EFF' : '#00E68A' }}
            >
              {isOpen ? 'Open' : 'Closed'}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
```

- [ ] **Step 3: Rewrite `useDashboard.ts`**

```ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Goal } from '../db/schema';
import { TradeWithInstrument, StatsResult, computeStats } from '../stats/computeStats';
import { DisplayUnit } from '../lib/format';
import { useAccountSetting } from './SettingsContext';

type DashboardData = {
  stats: StatsResult;
  trades: TradeWithInstrument[];
  weeklyGoal: Goal | null;
  displayUnit: DisplayUnit;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

const EMPTY_STATS: StatsResult = {
  todayPnl: 0, weekPnl: 0, monthPnl: 0, allTimePnl: 0,
  winRate: 0, totalTrades: 0, wins: 0, losses: 0,
  expectancy: 0, currentStreak: 0,
};

export function useDashboard(): DashboardData {
  const db = useSQLiteContext();
  const { displayUnit } = useAccountSetting();
  const [trades, setTrades] = useState<TradeWithInstrument[]>([]);
  const [weeklyGoal, setWeeklyGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const [tradesList, goal] = await Promise.all([
        db.getAllAsync<TradeWithInstrument>(`
          SELECT t.*,
                 i.symbol,
                 i.name   AS instrument_name,
                 i.quote_currency,
                 a.price_mode,
                 i.contract_size,
                 i.asset_class,
                 t.trade_style,
                 t.entry_condition,
                 t.exit_condition,
                 s.name   AS strategy_name,
                 e.name   AS emotion_name
          FROM   trades t
          JOIN   accounts a ON a.id = t.account_id
          JOIN   instruments i ON i.id = t.instrument_id
          LEFT JOIN strategies s ON s.id = t.strategy_id
          LEFT JOIN emotions e  ON e.id = t.emotion_id
          ORDER  BY t.entry_at DESC
        `),
        db.getFirstAsync<Goal>(`
          SELECT * FROM goals
          WHERE kind = 'profit_goal'
            AND period = 'weekly'
            AND effective_to IS NULL
          ORDER BY effective_from DESC
          LIMIT 1
        `),
      ]);
      setTrades(tradesList);
      setWeeklyGoal(goal ?? null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { fetch(); }, [fetch]);

  useFocusEffect(useCallback(() => { fetch({ silent: true }); }, [fetch]));

  // Stats are recomputed reactively so the dashboard converts immediately when
  // the display unit is toggled in Settings.
  const stats = useMemo(() => computeStats(trades), [trades]);

  return { stats, trades, weeklyGoal, displayUnit, loading, error, refetch: fetch };
}
```

- [ ] **Step 4: Update `app/(tabs)/index.tsx`**

Apply these edits:

1. Add `DisplayUnit` to the import from `../../src/lib/format` (line 27):
   ```ts
   import { formatMoney, formatPnl, DisplayUnit } from '../../src/lib/format';
   ```

2. Add `useAccountSetting` to the import (find the existing `useAccountSetting` import line in this file — it currently does not import it, so add):
   ```ts
   import { useAccountSetting } from '../../src/hooks/SettingsContext';
   ```

3. `PnlHeroCard` (lines 163-187): rename the prop and its PnlText usage:
   ```tsx
   const PnlHeroCard = ({ pnl, label, displayUnit }: { pnl: number; label: string; displayUnit: DisplayUnit }) => {
   ```
   and inside:
   ```tsx
   <PnlText value={pnl} size="text-5xl" weight="font-semibold" glow displayUnit={displayUnit} />
   ```

4. `WeeklyCalendar` (line 190): rename prop and the `formatPnl` call at line 237:
   ```tsx
   const WeeklyCalendar = ({ currentWeek, selectedDate, onSelect, dailyPnls, onPrevWeek, onNextWeek, displayUnit }: any) => {
   ```
   and line 237:
   ```tsx
   {formatPnl(pnl, displayUnit)}
   ```

5. `MonthlyCalendar` (line 249): rename the destructured prop `accountType` → `displayUnit` (the destructure is typed `: any`, so no annotation change is needed). `MonthlyCalendar` never calls `formatPnl` — the prop is only passed through.

6. `formatPnlShort` (lines 334-339): use `DisplayUnit`:
   ```ts
   function formatPnlShort(v: number, displayUnit: DisplayUnit = 'usd'): string {
     const displayVal = displayUnit === 'usc' ? v * 100 : v;
     if (Math.abs(displayVal) >= 1000) return `${(displayVal / 1000).toFixed(1)}k`;
     return `${Math.round(displayVal)}`;
   }
   ```

7. `Trendline` (line 341): rename the prop type and destructure `accountType` → `displayUnit`; update the two usages at line 479 (`formatPnlShort(val, displayUnit)`) and line 541 (`formatPnl(points[hoverIndex].value, displayUnit)`).

8. Dashboard body (line 613):
   ```tsx
   const { stats, trades, weeklyGoal, displayUnit, loading, error } = useDashboard();
   const { accountType } = useAccountSetting();
   ```

9. `dailyPnls` (lines 636-644): `computeTradePnl(t, accountType)` → `computeTradePnl(t)`; deps `[trades, accountType]` → `[trades]`.

10. `chartPoints` memo (lines 656, 670): `computeTradePnl(t, accountType)` → `computeTradePnl(t)`. Deps line 741: remove `accountType` → `[period, trades, selectedDate, currentWeek, currentMonth, dailyPnls]`.

11. `selectedPnl` (lines 760-762): `computeTradePnl(t, accountType)` → `computeTradePnl(t)`; deps `[visibleTrades, accountType]` → `[visibleTrades]`.

12. `PnlHeroCard` usage (line 815): `accountType={accountType}` → `displayUnit={displayUnit}`.

13. `WeeklyCalendar` usage (line 840): `accountType={accountType}` → `displayUnit={displayUnit}`.

14. `MonthlyCalendar` usage (line 851): `accountType={accountType}` → `displayUnit={displayUnit}`.

15. `Trendline` usage (line 858): `accountType={accountType}` → `displayUnit={displayUnit}`.

16. `TradeRow` usage (lines 882-887): pass both:
    ```tsx
    <TradeRow
      key={trade.id}
      trade={trade}
      accountType={accountType}
      displayUnit={displayUnit}
      onPress={() => router.push(`/trade/${trade.id}`)}
    />
    ```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean. If the dashboard screen still has stragglers (unused `accountType`, missed `formatPnl`), fix them.

- [ ] **Step 6: Run the test suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/PnlText.tsx src/ui/TradeRow.tsx src/hooks/useDashboard.ts "app/(tabs)/index.tsx"
git commit -m "feat: dashboard renders P&L in the chosen display unit"
```

---

### Task 7: Trades list screen — filters compare in the display unit

**Files:**
- Modify: `app/(tabs)/trades.tsx` (lines 196-206, 302-306, 358, 414-417, 434, 478, 566-569)

**Interfaces:**
- Consumes: `computeTradePnl(trade)` (Task 2); `useAccountSetting()` → `displayUnit` (Task 5); `TradeRow` `displayUnit` prop (Task 6).
- Produces: `FilterSheet` takes `displayUnit: DisplayUnit` instead of `accountType`. The P&L filter range is entered in the display unit and compared against each trade's real-USD P&L after scaling by `displayUnit === 'usc' ? 0.01 : 1`.

- [ ] **Step 1: Update imports and `FilterSheet`**

1. Add `DisplayUnit` to the import from `../../src/lib/format` in `app/(tabs)/trades.tsx`.
2. In `FilterSheet` (line 197), replace `accountType` with `displayUnit` in the destructure and the prop type (line 205):
   ```tsx
   function FilterSheet({
     visible, onClose, draft, setDraft, onApply, onClear, displayUnit,
   }: {
     visible: boolean;
     onClose: () => void;
     draft: FilterState;
     setDraft: (f: FilterState) => void;
     onApply: () => void;
     onClear: () => void;
     displayUnit: DisplayUnit;
   }) {
   ```
3. In the PnL section (lines 301-308), replace the label and prefix:
   ```tsx
   <SectionLabel label={displayUnit === 'usc' ? 'Profit & Loss (USC)' : 'Profit & Loss'} />
   <RangeInput
     minVal={draft.pnlMin} maxVal={draft.pnlMax}
     onMinChange={v => set('pnlMin', v)} onMaxChange={v => set('pnlMax', v)}
     prefix={displayUnit === 'usc' ? '' : '$'}
   />
   ```
4. If `AccountType` import is now unused elsewhere in the file, remove it.

- [ ] **Step 2: Update the screen body**

1. Line 358:
   ```tsx
   const { accountType, displayUnit } = useAccountSetting();
   ```
2. Filter logic (lines 414-417):
   ```tsx
   const pnl = computeTradePnl(t);
   const pnlUnit = displayUnit === 'usc' ? 0.01 : 1;
   if (applied.pnlMin && pnl < parseFloat(applied.pnlMin) * pnlUnit) return false;
   if (applied.pnlMax && pnl > parseFloat(applied.pnlMax) * pnlUnit) return false;
   ```
3. Deps line 434: `[trades, search, applied, displayUnit]`.
4. `FilterSheet` usage (line 478): `accountType={accountType}` → `displayUnit={displayUnit}`.
5. `TradeRow` usage (line 566): add `displayUnit={displayUnit}` alongside the existing `accountType={accountType}`.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/trades.tsx"
git commit -m "feat: trades filter and rows use the display unit"
```

---

### Task 8: Trade detail and add-trade screens

**Files:**
- Modify: `app/trade/[id].tsx` (lines 35, 67, 101)
- Modify: `app/add-trade.tsx` (lines 104-150, 243, 422-428)

**Interfaces:**
- Consumes: `computeTradePnl(trade)` (Task 2); `useAccountSetting()` → `displayUnit` (Task 5); `PnlText` `displayUnit` prop (Task 6); `formatPnl(pnl, displayUnit)` (Task 1).
- Produces: Trade detail P&L is computed per-trade and formatted in the display unit. Add-trade preview keeps `accountType` for sizing and uses `displayUnit` for the preview text.

- [ ] **Step 1: Update `app/trade/[id].tsx`**

1. Line 35: replace with:
   ```tsx
   const { displayUnit } = useAccountSetting();
   ```
2. Line 67: `const pnl = computeTradePnl(trade);`
3. Line 101: `displayUnit={displayUnit}` instead of `accountType={accountType}`.

- [ ] **Step 2: Update `app/add-trade.tsx`**

1. Add `DisplayUnit` to the import from `../src/lib/format` (line 14).
2. `PnlPreviewCard` (line 130): extend the props type and the format call:
   ```tsx
   function PnlPreviewCard(p: Parameters<typeof computeFormPnl>[0] & { accountType: AccountType; displayUnit: DisplayUnit }) {
     const pnl = computeFormPnl(p);
     if (pnl === null) return null;
     const win = pnl >= 0;
     const c = win ? '#00E68A' : '#FF4D6A';
     ...
     {formatPnl(pnl, p.displayUnit)}
     ...
   }
   ```
   (`computeFormPnl` at line 104 keeps its `accountType` parameter — the preview must size with the account type, exactly like a saved trade. Only the text format uses `displayUnit`.)
3. Line 243: `const { accountType, displayUnit, loading: settingsLoading } = useAccountSetting();`
4. `PnlPreviewCard` usage (lines 422-428): add `displayUnit={displayUnit}`.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "app/trade/[id].tsx" app/add-trade.tsx
git commit -m "feat: detail and add-trade screens use display unit"
```

---

### Task 9: Settings screen — two separate controls

**Files:**
- Modify: `app/(tabs)/settings.tsx` (whole file, lines 1-63)

**Interfaces:**
- Consumes: `useAccountSetting()` → `{ accountType, displayUnit, setAccountType, setDisplayUnit, loading }` (Task 5); `Segmented` from `../../src/ui` (existing component, generic over `T extends string`, props `{ options, value, onChange, dangerKeys? }`).
- Produces: A **segmented Account Type** control (`Standard | Cents`) that calls `setAccountType`, and the existing **switch** retitled to **Display Unit** that calls `setDisplayUnit`. Copy states that account type controls sizing; display unit only changes how P&L is shown.

- [ ] **Step 1: Rewrite `app/(tabs)/settings.tsx`**

```tsx
import React from 'react';
import { View, Text, Switch, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Segmented } from '../../src/ui';
import { useAccountSetting } from '../../src/hooks/SettingsContext';
import { AccountType } from '../../src/stats/tradeMath';
import { DisplayUnit } from '../../src/lib/format';

export default function SettingsTab() {
  const insets = useSafeAreaInsets();
  const { accountType, displayUnit, setAccountType, setDisplayUnit, loading } = useAccountSetting();

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><ActivityIndicator size="large" color="#00E68A" /></View>;
  }

  const toggleDisplayUnit = async (value: boolean) => {
    await setDisplayUnit(value ? 'usc' : 'usd');
  };

  return (
    <View className="flex-1 bg-dark-bg" style={{ paddingTop: insets.top }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Animated.View entering={FadeIn.duration(400)} className="flex-row justify-between items-center px-4 pt-4 pb-2 bg-dark-bg">
        <Text className="text-2xl font-black text-dark-text">Settings</Text>
      </Animated.View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 }}>

        <Animated.View entering={FadeInDown.duration(400).springify()}>
          <View className="bg-[#1a1b24] border border-[#2b2d3a] rounded-2xl p-4 mb-4">
            <Text className="text-white font-bold text-base mb-3">Account Type</Text>
            <Segmented<AccountType>
              options={[{ key: 'standard', label: 'Standard' }, { key: 'cents', label: 'Cents' }]}
              value={accountType}
              onChange={(v) => setAccountType(v)}
            />
            <View className="bg-[#13141a] rounded-xl p-3 border border-[#1e1d2b] mt-3">
              <Text className="text-[#6b6880] text-[11px] font-medium leading-4">
                Account type sets position sizing: cents accounts map lots to 100× smaller positions (MT5 cent-account sizing). Prices and fees are still entered as real values.
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).springify()}>
          <View className="bg-[#1a1b24] border border-[#2b2d3a] rounded-2xl p-4 mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-xl bg-[#00E68A]/10 border border-[#00E68A]/20 items-center justify-center">
                  <Ionicons name="eye" size={20} color="#00E68A" />
                </View>
                <View>
                  <Text className="text-white font-bold text-base">Display Unit</Text>
                  <Text className="text-[#8B92A5] text-xs">Show PnL in USC instead of USD</Text>
                </View>
              </View>
              <Switch
                trackColor={{ false: '#3e3b4b', true: '#00E68A' }}
                thumbColor={displayUnit === 'usc' ? '#13141a' : '#f4f3f4'}
                ios_backgroundColor="#3e3b4b"
                onValueChange={toggleDisplayUnit}
                value={displayUnit === 'usc'}
              />
            </View>
            <View className="bg-[#13141a] rounded-xl p-3 border border-[#1e1d2b] mt-2">
              <Text className="text-[#6b6880] text-[11px] font-medium leading-4">
                The display unit only changes how P&L is shown (1 USD = 100 USC). It never changes how positions are sized — that is set by the account type above.
              </Text>
            </View>
          </View>
        </Animated.View>

      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/settings.tsx"
git commit -m "feat: separate account type and display unit settings"
```

---

### Task 10: Full verification

**Files:**
- No code changes; verification only.

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: PASS — including the 4 MT5 regression cases in `src/stats/tradeMath.test.ts` (untouched).

- [ ] **Step 2: Strict typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Confirm no stale references**

Run: `rg "computeTradePnl\(" --type ts --type tsx` (or the repo's equivalent). Every call site must be `computeTradePnl(trade)` with exactly one argument.
Run: `rg "computeStats\(" --type ts --type tsx`. Every call site must be `computeStats(trades)` with exactly one argument.
Run: `rg "formatPnl\([^,]*," ` — second argument must be a `DisplayUnit`-typed value.
Run: `rg "accountType" app src` — remaining `accountType` references are only: `TradeRow`'s sizing prop, `trades.tsx` `Inv` sizing, `add-trade.tsx` preview sizing, `settings.tsx` segmented control, and `SettingsContext` itself.

- [ ] **Step 4: Manual smoke test on a device/emulator**

Run: `npx expo start` and check:
1. Launch on a fresh install → a seeded `Main` account exists with `price_mode` defaulting to `'standard'`; Settings shows Account Type = Standard, Display Unit = OFF.
2. With an existing DB that had `settings.accountType = 'cents'` → after upgrade, Account Type shows Cents, Display Unit defaults ON (USC), and the legacy `accountType` key is gone from the settings table (verify via the SQLite debug screen if available).
3. On a cents account with the USDJPY 0.01-lot short from the spec: detail screen shows `0.10 USC`. Toggle Display Unit OFF → shows `$0.001`. The Dashboard hero, calendars, trendline, and trade rows all change to the same unit instantly.
4. Changing Account Type (Standard ↔ Cents) re-sizes every P&L but leaves the Display Unit switch exactly where it was.

- [ ] **Step 5: Final commit for any cleanup**

If Steps 3-4 uncovered any stragglers, fix and commit them; otherwise skip.

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-08-11-display-unit-toggle-design.md` maps to a task — precision rules (Task 1), per-trade sizing (Task 2), account-level storage + migration (Task 3), query joins (Task 4), context two-settings model + sync rule (Task 5), dashboard (Task 6), trades filter (Task 7), detail/add-trade (Task 8), settings UI (Task 9), verification incl. manual smoke + stale-ref scan (Task 10).
- **Placeholder scan:** no TBD/TODO/"similar to Task N" references; every code step carries full file content or exact before/after text.
- **Type consistency:** `DisplayUnit` defined in Task 1 and reused verbatim in Tasks 5-9; `computeTradePnl(trade)` / `computeStats(trades)` signatures defined in Task 2 and used consistently in Tasks 4, 6, 7, 8; `TradeRow` keeps `accountType` (sizing) plus new `displayUnit` in Tasks 6-7; `SettingsContext` value shape defined in Task 5 matches every consumer.
