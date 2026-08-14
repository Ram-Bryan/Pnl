# Strategy Management + Symbol Picker Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Strategies tab (create/edit/archive strategies with rule checklists and full performance stats), let add-trade select and create strategies, and fix the add-trade symbol picker by converting it to a bottom Sheet with "Add new symbol" first.

**Architecture:** Pure-extension over the existing `strategies`/`strategy_rules`/`trade_rule_checks` schema — no migrations. A new pure stats module (`src/stats/strategyStats.ts`) computes per-strategy performance; thin DB CRUD wrappers and two hooks feed two new screens. The add-trade symbol picker moves from a fragile inline dropdown to the existing `Sheet` pattern. One shared trades query is extracted to stop the third duplication.

**Tech Stack:** Expo SDK 57 / React Native 0.86, expo-router, expo-sqlite, TypeScript strict, NativeWind v4.2.6 (Tailwind class strings), Vitest, pnpm.

## Global Constraints

- TypeScript strict — `pnpm typecheck` (`tsc --noEmit`) must pass before committing.
- Unit tests via `pnpm test` (Vitest); cover pure layers only (`src/lib`, `src/stats`). The DB layer (`src/db/database.ts`) is NOT unit-tested in this repo — verify DB tasks with typecheck + code review only.
- **P&L is always computed, never stored** — every dollar figure comes from `computeTradePnl`/`computeStats`/`computeStrategyStats`.
- **Static-shadow invariant:** `shadow-*` classes are static literals (`shadow-sm`/`shadow-lg`/`shadow-none`) and are never toggled at runtime. Toggle colors, not shadows.
- Numeric displays use `fontVariant: ['tabular-nums']`; money formatting goes through `src/lib/format.ts`.
- Error convention (chosen: exceptions): DB/IO errors throw and propagate; hooks/screens catch and surface via `Alert` — never a silent `catch`.
- No comments unless they explain *why* (never restate what).
- One concern per commit; run typecheck + tests before each commit.

## File Structure

| File                                            | Responsibility                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/stats/strategyStats.ts` (new)              | Pure per-strategy stats + rule-adherence math                                                 |
| `src/stats/strategyStats.test.ts` (new)         | Unit tests for the above                                                                      |
| `src/db/database.ts`                            | `getAllTradesWithInstrument`, strategy/rule CRUD, `getStrategyRuleCounts`, `getRuleAdherence` |
| `src/hooks/useStrategies.ts` (new)              | Strategies list + stats map + CRUD actions                                                    |
| `src/hooks/useStrategyDetail.ts` (new)          | One strategy: stats, rules w/ adherence, recent trades                                        |
| `src/ui/StrategyFormSheet.tsx` (new)            | Shared add/edit strategy form sheet                                                           |
| `app/(tabs)/strategies.tsx` (new)               | Strategies tab list                                                                           |
| `app/strategy/[id].tsx` (new)                   | Strategy detail screen                                                                        |
| `app/(tabs)/_layout.tsx`, `app/_layout.tsx`     | Register tab + route                                                                          |
| `src/hooks/useAddTrade.ts`, `app/add-trade.tsx` | Strategy preselection, rule counts, new-strategy flow, symbol Sheet                           |

Existing files to modify: `src/hooks/useDashboard.ts`, `src/hooks/useTrades.ts` (use the extracted query).

---

### Task 1: Pure strategy stats engine

**Files:**
- Create: `src/stats/strategyStats.ts`
- Test: `src/stats/strategyStats.test.ts`

**Interfaces:**
- Consumes: `TradeWithInstrument`, `computeTradePnl` from `src/stats/computeStats.ts`.
- Produces:
  - `type StrategyStats = { totalTrades: number; wins: number; losses: number; winRate: number; netPnl: number; grossProfit: number; grossLoss: number; profitFactor: number | null; expectancy: number; avgWin: number; avgLoss: number; bestTrade: number; worstTrade: number; currentStreak: number }`
  - `computeStrategyStats(trades: TradeWithInstrument[]): StrategyStats`
  - `type RuleAdherenceInput = { ruleId: number; rule_text: string; checked: number; unchecked: number }`
  - `type RuleAdherence = { ruleId: number; ruleText: string; checked: number; unchecked: number; adherence: number }`
  - `computeRuleAdherence(rows: RuleAdherenceInput[]): RuleAdherence[]`

- [ ] **Step 1: Write the failing test**

Create `src/stats/strategyStats.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TradeWithInstrument } from './computeStats';
import { computeStrategyStats, computeRuleAdherence } from './strategyStats';

function makeTrade(p: Partial<TradeWithInstrument>): TradeWithInstrument {
  return {
    id: 1, account_id: 1, instrument_id: 1, strategy_id: 1, emotion_id: null,
    trade_style: null, entry_condition: null, exit_condition: null,
    direction: 'long', status: 'closed', entry_price: 100, exit_price: 110,
    size: 1, stop_loss: null, take_profit: null,
    entry_at: '2026-01-01T00:00:00', exit_at: '2026-01-01T00:00:00',
    fees: 0, followed_rules: null, notes: null, reflection: null,
    created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00',
    symbol: 'AAPL', instrument_name: null, quote_currency: 'USD',
    price_mode: 'standard', contract_size: 1, asset_class: 'equity',
    strategy_name: null, emotion_name: null,
    ...p,
  };
}

describe('computeStrategyStats', () => {
  it('returns all-zero stats for empty input', () => {
    expect(computeStrategyStats([])).toEqual({
      totalTrades: 0, wins: 0, losses: 0, winRate: 0, netPnl: 0,
      grossProfit: 0, grossLoss: 0, profitFactor: null, expectancy: 0,
      avgWin: 0, avgLoss: 0, bestTrade: 0, worstTrade: 0, currentStreak: 0,
    });
  });

  it('computes win rate, P&L buckets, profit factor and expectancy', () => {
    const s = computeStrategyStats([
      makeTrade({ id: 1, entry_price: 100, exit_price: 110 }), // +10
      makeTrade({ id: 2, entry_price: 100, exit_price: 120 }), // +20
      makeTrade({ id: 3, entry_price: 100, exit_price: 90 }),  // -10
      makeTrade({ id: 4, entry_price: 100, exit_price: 80 }),  // -20
    ]);
    expect(s.totalTrades).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(2);
    expect(s.winRate).toBe(50);
    expect(s.netPnl).toBe(0);
    expect(s.grossProfit).toBe(30);
    expect(s.grossLoss).toBe(30);
    expect(s.profitFactor).toBe(1);
    expect(s.expectancy).toBe(0);
    expect(s.avgWin).toBe(15);
    expect(s.avgLoss).toBe(15);
    expect(s.bestTrade).toBe(20);
    expect(s.worstTrade).toBe(-20);
  });

  it('profitFactor is null when there are no losses', () => {
    const s = computeStrategyStats([
      makeTrade({ id: 1, entry_price: 100, exit_price: 110 }),
    ]);
    expect(s.profitFactor).toBeNull();
    expect(s.losses).toBe(0);
    expect(s.avgLoss).toBe(0);
    expect(s.winRate).toBe(100);
  });

  it('ignores open trades', () => {
    const s = computeStrategyStats([
      makeTrade({ id: 1, entry_price: 100, exit_price: 110 }),
      makeTrade({ id: 2, entry_price: 100, exit_price: null, status: 'open' }),
    ]);
    expect(s.totalTrades).toBe(1);
    expect(s.netPnl).toBe(10);
  });

  it('computes the current streak from the most recent trade backwards', () => {
    const s = computeStrategyStats([
      makeTrade({ id: 1, entry_price: 100, exit_price: 110, entry_at: '2026-01-01T00:00:00', exit_at: '2026-01-01T00:00:00' }),
      makeTrade({ id: 2, entry_price: 100, exit_price: 120, entry_at: '2026-01-02T00:00:00', exit_at: '2026-01-02T00:00:00' }),
      makeTrade({ id: 3, entry_price: 100, exit_price: 90,  entry_at: '2026-01-03T00:00:00', exit_at: '2026-01-03T00:00:00' }),
      makeTrade({ id: 4, entry_price: 100, exit_price: 80,  entry_at: '2026-01-04T00:00:00', exit_at: '2026-01-04T00:00:00' }),
    ]);
    expect(s.currentStreak).toBe(-2);
  });
});

describe('computeRuleAdherence', () => {
  it('computes adherence percentages', () => {
    expect(computeRuleAdherence([
      { ruleId: 1, rule_text: 'Wait for retest', checked: 3, unchecked: 1 },
      { ruleId: 2, rule_text: 'Never move stop', checked: 4, unchecked: 0 },
      { ruleId: 3, rule_text: 'Half size on news', checked: 0, unchecked: 2 },
    ])).toEqual([
      { ruleId: 1, ruleText: 'Wait for retest', checked: 3, unchecked: 1, adherence: 75 },
      { ruleId: 2, ruleText: 'Never move stop', checked: 4, unchecked: 0, adherence: 100 },
      { ruleId: 3, ruleText: 'Half size on news', checked: 0, unchecked: 2, adherence: 0 },
    ]);
  });

  it('returns empty array for no rows', () => {
    expect(computeRuleAdherence([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/stats/strategyStats.test.ts`
Expected: FAIL — module `./strategyStats` not found.

- [ ] **Step 3: Write the implementation**

Create `src/stats/strategyStats.ts`:

```ts
import { TradeWithInstrument, computeTradePnl } from './computeStats';

export type StrategyStats = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  currentStreak: number;
};

export type RuleAdherenceInput = { ruleId: number; rule_text: string; checked: number; unchecked: number };
export type RuleAdherence = { ruleId: number; ruleText: string; checked: number; unchecked: number; adherence: number };

export function computeStrategyStats(trades: TradeWithInstrument[]): StrategyStats {
  const closed = trades.filter((t) => t.status === 'closed' && t.exit_price != null);
  const pnls = closed.map((t) => computeTradePnl(t));

  const wins = pnls.filter((p) => p > 0).length;
  const losses = pnls.filter((p) => p < 0).length;
  const grossProfit = pnls.filter((p) => p > 0).reduce((s, p) => s + p, 0);
  const grossLoss = pnls.filter((p) => p < 0).reduce((s, p) => s - p, 0);
  const netPnl = pnls.reduce((s, p) => s + p, 0);
  const totalTrades = closed.length;

  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;
  const expectancy = totalTrades > 0 ? netPnl / totalTrades : 0;
  const avgWin = wins > 0 ? grossProfit / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;
  const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
  const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;

  let streak = 0;
  if (closed.length > 0) {
    const sorted = [...closed].sort((a, b) => (b.exit_at ?? b.entry_at).localeCompare(a.exit_at ?? a.entry_at));
    const firstPnl = computeTradePnl(sorted[0]);
    const sign = firstPnl >= 0 ? 1 : -1;
    for (const t of sorted) {
      const pnl = computeTradePnl(t);
      if ((pnl >= 0 ? 1 : -1) !== sign) break;
      streak += sign;
    }
  }

  return {
    totalTrades, wins, losses, winRate, netPnl, grossProfit, grossLoss,
    profitFactor, expectancy, avgWin, avgLoss, bestTrade, worstTrade, currentStreak: streak,
  };
}

export function computeRuleAdherence(rows: RuleAdherenceInput[]): RuleAdherence[] {
  return rows.map((r) => {
    const total = r.checked + r.unchecked;
    return {
      ruleId: r.ruleId,
      ruleText: r.rule_text,
      checked: r.checked,
      unchecked: r.unchecked,
      adherence: total > 0 ? (r.checked / total) * 100 : 0,
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/stats/strategyStats.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS (45 existing + 7 new = 52).

- [ ] **Step 6: Commit**

```bash
git add src/stats/strategyStats.ts src/stats/strategyStats.test.ts
git commit -m "feat: strategy stats engine with win rate, profit factor, streak"
```

---

### Task 2: Extract shared trades-with-instrument query

**Files:**
- Modify: `src/db/database.ts` (add function near `getTradeById`)
- Modify: `src/hooks/useDashboard.ts:37-57`
- Modify: `src/hooks/useTrades.ts:16-35`

**Interfaces:**
- Produces: `getAllTradesWithInstrument(db: SQLiteDatabase): Promise<TradeWithInstrument[]>` — the exact SQL currently inlined in `useDashboard`/`useTrades` (joins `accounts` for `price_mode`, `instruments`, `strategies`, `emotions`; `ORDER BY t.entry_at DESC`).
- Consumes: `SQLiteDatabase` from `expo-sqlite`, `TradeWithInstrument` from `src/stats/computeStats`.

- [ ] **Step 1: Add the shared query**

In `src/db/database.ts`, add after `getTradeById` (it already imports `SQLiteDatabase` and `TradeWithInstrument`):

```ts
export async function getAllTradesWithInstrument(db: SQLiteDatabase): Promise<TradeWithInstrument[]> {
  return db.getAllAsync<TradeWithInstrument>(`
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
}
```

- [ ] **Step 2: Point useDashboard at it**

In `src/hooks/useDashboard.ts`:
- Add import: `import { getAllTradesWithInstrument } from '../db/database';`
- Replace the inline `db.getAllAsync<TradeWithInstrument>(...trades query...)` call inside `Promise.all` with `getAllTradesWithInstrument(db)`.
- The `TradeWithInstrument` import from `../stats/computeStats` is still used by the state type — keep it.

- [ ] **Step 3: Point useTrades at it**

In `src/hooks/useTrades.ts`:
- Add import: `import { getAllTradesWithInstrument } from '../db/database';`
- Replace the inline `db.getAllAsync<TradeWithInstrument>(...trades query...)` call with `getAllTradesWithInstrument(db)`.
- Keep the `TradeWithInstrument` import for the state type.

- [ ] **Step 4: Verify**

Run: `pnpm test`
Expected: PASS (52 — dashboard/trades tests untouched, behavior preserved).

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/db/database.ts src/hooks/useDashboard.ts src/hooks/useTrades.ts
git commit -m "refactor: extract shared getAllTradesWithInstrument query"
```

---

### Task 3: Strategy and rule CRUD in the data layer

**Files:**
- Modify: `src/db/database.ts` (add below the existing `getStrategies`/`getStrategyRules`)

**Interfaces:**
- Consumes: `SQLiteDatabase`, `Strategy` from `./schema`.
- Produces:
  - `getStrategyById(db, id): Promise<Strategy | null>`
  - `insertStrategy(db, input: { name: string; description: string | null }): Promise<number>` (returns new id; trims input; duplicate `name` throws — surfaced by the UI)
  - `updateStrategy(db, id, input: { name: string; description: string | null }): Promise<void>`
  - `archiveStrategy(db, id): Promise<void>` (sets `archived_at`, keeps history)
  - `insertStrategyRule(db, strategyId, ruleText): Promise<number>` (appends `sort_order` after the current max)
  - `updateStrategyRule(db, ruleId, ruleText): Promise<void>`
  - `archiveStrategyRule(db, ruleId): Promise<void>`
  - `getStrategyRuleCounts(db): Promise<Record<number, number>>` (active rules per strategy)
  - `getRuleAdherence(db, strategyId): Promise<{ ruleId: number; rule_text: string; checked: number; unchecked: number }[]>` (all active rules, even unused ones)

- [ ] **Step 1: Add the functions**

Append to `src/db/database.ts` after `getStrategyRules`:

```ts
export async function getStrategyById(db: SQLiteDatabase, id: number): Promise<Strategy | null> {
  return db.getFirstAsync<Strategy>('SELECT * FROM strategies WHERE id = ?', [id]);
}

export async function insertStrategy(
  db: SQLiteDatabase,
  input: { name: string; description: string | null }
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO strategies (name, description) VALUES (?, ?)',
    [input.name.trim(), input.description?.trim() || null]
  );
  return result.lastInsertRowId;
}

export async function updateStrategy(
  db: SQLiteDatabase,
  id: number,
  input: { name: string; description: string | null }
): Promise<void> {
  await db.runAsync(
    'UPDATE strategies SET name = ?, description = ? WHERE id = ?',
    [input.name.trim(), input.description?.trim() || null, id]
  );
}

export async function archiveStrategy(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync("UPDATE strategies SET archived_at = datetime('now') WHERE id = ?", [id]);
}

export async function insertStrategyRule(db: SQLiteDatabase, strategyId: number, ruleText: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM strategy_rules WHERE strategy_id = ?',
    [strategyId]
  );
  const result = await db.runAsync(
    'INSERT INTO strategy_rules (strategy_id, rule_text, sort_order) VALUES (?, ?, ?)',
    [strategyId, ruleText.trim(), row?.n ?? 0]
  );
  return result.lastInsertRowId;
}

export async function updateStrategyRule(db: SQLiteDatabase, ruleId: number, ruleText: string): Promise<void> {
  await db.runAsync('UPDATE strategy_rules SET rule_text = ? WHERE id = ?', [ruleText.trim(), ruleId]);
}

export async function archiveStrategyRule(db: SQLiteDatabase, ruleId: number): Promise<void> {
  await db.runAsync("UPDATE strategy_rules SET archived_at = datetime('now') WHERE id = ?", [ruleId]);
}

export async function getStrategyRuleCounts(db: SQLiteDatabase): Promise<Record<number, number>> {
  const rows = await db.getAllAsync<{ strategy_id: number; n: number }>(
    `SELECT strategy_id, COUNT(*) AS n FROM strategy_rules WHERE archived_at IS NULL GROUP BY strategy_id`
  );
  const map: Record<number, number> = {};
  for (const row of rows) map[row.strategy_id] = row.n;
  return map;
}

export async function getRuleAdherence(
  db: SQLiteDatabase,
  strategyId: number
): Promise<{ ruleId: number; rule_text: string; checked: number; unchecked: number }[]> {
  return db.getAllAsync<{ ruleId: number; rule_text: string; checked: number; unchecked: number }>(`
    SELECT r.id AS ruleId, r.rule_text,
           COALESCE(SUM(c.checked), 0) AS checked,
           COALESCE(COUNT(c.trade_id), 0) - COALESCE(SUM(c.checked), 0) AS unchecked
    FROM   strategy_rules r
    LEFT JOIN trade_rule_checks c ON c.strategy_rule_id = r.id
    WHERE  r.strategy_id = ? AND r.archived_at IS NULL
    GROUP  BY r.id
    ORDER  BY r.sort_order
  `, [strategyId]);
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/db/database.ts
git commit -m "feat: strategy and rule CRUD plus adherence aggregation"
```

---

### Task 4: `useStrategies` hook

**Files:**
- Create: `src/hooks/useStrategies.ts`

**Interfaces:**
- Consumes: `getStrategies`, `getAllTradesWithInstrument`, `insertStrategy`, `updateStrategy`, `archiveStrategy`, `insertStrategyRule`, `updateStrategyRule`, `archiveStrategyRule` (all `src/db/database.ts`); `computeStrategyStats` (Task 1).
- Produces (the `strategiesApi` object consumed by Task 7 tab and Task 8 detail screen):
  ```ts
  {
    strategies: Strategy[];
    statsByStrategy: Record<number, StrategyStats>;
    loading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    addStrategy(input: { name: string; description: string | null }): Promise<void>;
    updateStrategy(id: number, input: { name: string; description: string | null }): Promise<void>;
    archiveStrategy(id: number): Promise<void>;
    addRule(strategyId: number, ruleText: string): Promise<void>;
    updateRule(ruleId: number, ruleText: string): Promise<void>;
    archiveRule(ruleId: number): Promise<void>;
  }
  ```

- [ ] **Step 1: Write the hook**

Create `src/hooks/useStrategies.ts`:

```ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Strategy } from '../db/schema';
import {
  getStrategies,
  getAllTradesWithInstrument,
  insertStrategy as insertStrategyDb,
  updateStrategy as updateStrategyDb,
  archiveStrategy as archiveStrategyDb,
  insertStrategyRule as insertStrategyRuleDb,
  updateStrategyRule as updateStrategyRuleDb,
  archiveStrategyRule as archiveStrategyRuleDb,
} from '../db/database';
import { TradeWithInstrument } from '../stats/computeStats';
import { StrategyStats, computeStrategyStats } from '../stats/strategyStats';

export type StrategyInput = { name: string; description: string | null };

export function useStrategies() {
  const db = useSQLiteContext();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [trades, setTrades] = useState<TradeWithInstrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const [strategyRows, tradeRows] = await Promise.all([
        getStrategies(db),
        getAllTradesWithInstrument(db),
      ]);
      setStrategies(strategyRows);
      setTrades(tradeRows);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { fetch(); }, [fetch]);
  useFocusEffect(useCallback(() => { fetch({ silent: true }); }, [fetch]));

  const statsByStrategy = useMemo(() => {
    const map: Record<number, StrategyStats> = {};
    for (const s of strategies) map[s.id] = computeStrategyStats(trades.filter((t) => t.strategy_id === s.id));
    return map;
  }, [strategies, trades]);

  const addStrategy = useCallback(async (input: StrategyInput) => {
    await insertStrategyDb(db, input);
    await fetch({ silent: true });
  }, [db, fetch]);

  const updateStrategy = useCallback(async (id: number, input: StrategyInput) => {
    await updateStrategyDb(db, id, input);
    await fetch({ silent: true });
  }, [db, fetch]);

  const archiveStrategy = useCallback(async (id: number) => {
    await archiveStrategyDb(db, id);
    await fetch({ silent: true });
  }, [db, fetch]);

  const addRule = useCallback(async (strategyId: number, ruleText: string) => {
    await insertStrategyRuleDb(db, strategyId, ruleText);
    await fetch({ silent: true });
  }, [db, fetch]);

  const updateRule = useCallback(async (ruleId: number, ruleText: string) => {
    await updateStrategyRuleDb(db, ruleId, ruleText);
    await fetch({ silent: true });
  }, [db, fetch]);

  const archiveRule = useCallback(async (ruleId: number) => {
    await archiveStrategyRuleDb(db, ruleId);
    await fetch({ silent: true });
  }, [db, fetch]);

  return {
    strategies, statsByStrategy, loading, error,
    refetch: fetch,
    addStrategy, updateStrategy, archiveStrategy, addRule, updateRule, archiveRule,
  };
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useStrategies.ts
git commit -m "feat: useStrategies hook with per-strategy stats"
```

---

### Task 5: `useStrategyDetail` hook

**Files:**
- Create: `src/hooks/useStrategyDetail.ts`

**Interfaces:**
- Consumes: `getStrategyById`, `getRuleAdherence`, `getAllTradesWithInstrument` (Task 2/3); `computeRuleAdherence`, `computeStrategyStats` (Task 1).
- Produces:
  ```ts
  {
    strategy: Strategy | null;
    stats: StrategyStats;
    rules: RuleAdherence[];
    recentTrades: TradeWithInstrument[]; // first 10 by entry_at DESC
    loading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
  }
  ```

- [ ] **Step 1: Write the hook**

Create `src/hooks/useStrategyDetail.ts`:

```ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Strategy } from '../db/schema';
import { getStrategyById, getRuleAdherence, getAllTradesWithInstrument } from '../db/database';
import { TradeWithInstrument } from '../stats/computeStats';
import {
  RuleAdherence,
  StrategyStats,
  computeRuleAdherence,
  computeStrategyStats,
} from '../stats/strategyStats';

export function useStrategyDetail(strategyId: number) {
  const db = useSQLiteContext();
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [rules, setRules] = useState<RuleAdherence[]>([]);
  const [trades, setTrades] = useState<TradeWithInstrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const [strategyRow, adherenceRows, allTrades] = await Promise.all([
        getStrategyById(db, strategyId),
        getRuleAdherence(db, strategyId),
        getAllTradesWithInstrument(db),
      ]);
      setStrategy(strategyRow);
      setRules(computeRuleAdherence(adherenceRows));
      setTrades(allTrades);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db, strategyId]);

  useEffect(() => { fetch(); }, [fetch]);
  useFocusEffect(useCallback(() => { fetch({ silent: true }); }, [fetch]));

  const strategyTrades = useMemo(() => trades.filter((t) => t.strategy_id === strategyId), [trades, strategyId]);
  const stats: StrategyStats = useMemo(() => computeStrategyStats(strategyTrades), [strategyTrades]);
  const recentTrades = strategyTrades.slice(0, 10);

  return { strategy, stats, rules, recentTrades, loading, error, refetch: fetch };
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useStrategyDetail.ts
git commit -m "feat: useStrategyDetail hook with adherence and recent trades"
```

---

### Task 6: Shared `StrategyFormSheet` component

**Files:**
- Create: `src/ui/StrategyFormSheet.tsx`
- Modify: `src/ui/index.ts` (export it)

**Interfaces:**
- Consumes: `Sheet`, `Field`, `TextInputField`, `Button` from the UI kit (`./index`).
- Produces:
  ```ts
  StrategyFormSheet({
    visible: boolean;
    onClose: () => void;
    initial?: { name: string; description: string | null }; // provided = edit mode
    onSubmit: (input: { name: string; description: string | null }) => Promise<void> | void;
    saving?: boolean;
  })
  ```
  The component validates (non-empty name), surfaces DB errors via `Alert`, and calls `onClose()` only after `onSubmit` resolves.

- [ ] **Step 1: Write the component**

Create `src/ui/StrategyFormSheet.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { View, Text, Alert } from 'react-native';
import { Sheet, Field, TextInputField, Button } from './index';

export function StrategyFormSheet({
  visible,
  onClose,
  initial,
  onSubmit,
  saving = false,
}: {
  visible: boolean;
  onClose: () => void;
  initial?: { name: string; description: string | null };
  onSubmit: (input: { name: string; description: string | null }) => Promise<void> | void;
  saving?: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
    }
  }, [visible, initial]);

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Strategy name is required.');
      return;
    }
    try {
      await onSubmit({ name: name.trim(), description: description.trim() || null });
      onClose();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save strategy.');
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={initial ? 'Edit Strategy' : 'New Strategy'}>
      <View className="mt-4">
        <Field label="Name *">
          <TextInputField value={name} onChangeText={setName} placeholder="e.g. ICT Killzone" />
        </Field>
        <Field label="Description">
          <TextInputField
            value={description}
            onChangeText={setDescription}
            placeholder="What is the edge? When does it work?"
            multiline
            style={{ minHeight: 80 }}
          />
        </Field>
        <View className="pt-2 pb-4">
          <Button title={saving ? 'Saving…' : 'Save Strategy'} onPress={submit} disabled={saving} />
        </View>
      </View>
    </Sheet>
  );
}
```

- [ ] **Step 2: Export it**

In `src/ui/index.ts`, add: `export { StrategyFormSheet } from './StrategyFormSheet';`

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui/StrategyFormSheet.tsx src/ui/index.ts
git commit -m "feat: shared StrategyFormSheet component"
```

---

### Task 7: Strategies tab

**Files:**
- Create: `app/(tabs)/strategies.tsx`
- Modify: `app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `useStrategies()` (Task 4), `useAccountSetting()` (`src/hooks/SettingsContext`), `formatPnl`/`DisplayUnit` (`src/lib/format`), `StrategyFormSheet` (Task 6), `EmptyState` (`src/ui`).
- Produces: tab route `strategies` registered as `(tabs)` child; navigates to `/strategy/{id}`.

- [ ] **Step 1: Write the screen**

Create `app/(tabs)/strategies.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { EmptyState, StrategyFormSheet } from '../../src/ui';
import { formatPnl } from '../../src/lib/format';
import { useStrategies } from '../../src/hooks/useStrategies';
import { useAccountSetting } from '../../src/hooks/SettingsContext';

export default function StrategiesTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { strategies, statsByStrategy, loading, addStrategy } = useStrategies();
  const { displayUnit } = useAccountSetting();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><ActivityIndicator size="large" color="#00E68A" /></View>;
  }

  return (
    <View className="flex-1 bg-dark-bg" style={{ paddingTop: insets.top }}>
      <Animated.View entering={FadeIn.duration(400)} className="flex-row justify-between items-center px-4 pt-4 pb-2 bg-dark-bg">
        <Text className="text-2xl font-black text-dark-text">Strategies</Text>
        <TouchableOpacity onPress={() => setSheetOpen(true)} className="bg-[#1a1b24] p-3 rounded-2xl border border-[#2b2d3a]">
          <Ionicons name="add" size={20} color="#00E68A" />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 }}>
        {strategies.length === 0 ? (
          <EmptyState icon="bulb-outline" title="No strategies yet." subtitle="Tap the + button to create your first strategy." />
        ) : (
          strategies.map((s, i) => {
            const st = statsByStrategy[s.id];
            return (
              <Animated.View key={s.id} entering={FadeInDown.duration(400).delay(Math.min(i * 60, 600)).springify().damping(18)}>
                <TouchableOpacity
                  onPress={() => router.push(`/strategy/${s.id}`)}
                  activeOpacity={0.7}
                  className="bg-[#13141a] rounded-2xl p-4 mb-3 border border-[#1e1d2b]"
                >
                  <View className="flex-row items-center mb-2.5">
                    <View className="w-10 h-10 rounded-xl bg-[#1a1b24] border border-[#2b2d3a] items-center justify-center mr-3">
                      <Ionicons name="bulb" size={18} color="#00E68A" />
                    </View>
                    <View className="flex-1 pr-2">
                      <Text className="text-white text-lg font-black">{s.name}</Text>
                      {s.description ? <Text className="text-[#8B92A5] text-xs mt-0.5" numberOfLines={1}>{s.description}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#555B6E" />
                  </View>
                  <View className="flex-row items-center gap-4 px-1">
                    <View className="flex-1">
                      <Text className="text-[10px] uppercase tracking-wider text-[#6b6880] font-bold">Closed</Text>
                      <Text className="text-white font-bold" style={{ fontVariant: ['tabular-nums'] }}>{st.totalTrades}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-[10px] uppercase tracking-wider text-[#6b6880] font-bold">Win rate</Text>
                      <Text className="text-white font-bold" style={{ fontVariant: ['tabular-nums'] }}>
                        {st.totalTrades > 0 ? `${st.winRate.toFixed(0)}%` : '—'}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-[10px] uppercase tracking-wider text-[#6b6880] font-bold">Net</Text>
                      <Text className="font-black" style={{ color: st.netPnl >= 0 ? '#00E68A' : '#FF4D6A', fontVariant: ['tabular-nums'] }}>
                        {(st.netPnl >= 0 ? '+' : '−')}{formatPnl(st.netPnl, displayUnit)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      <StrategyFormSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onSubmit={addStrategy} />
    </View>
  );
}
```

- [ ] **Step 2: Register the tab**

In `app/(tabs)/_layout.tsx`, add a screen between `trades` and `symbols`:

```tsx
<Tabs.Screen
  name="strategies"
  options={{
    title: 'Strategies',
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="bulb" size={size} color={color} />
    ),
  }}
/>
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/strategies.tsx app/(tabs)/_layout.tsx
git commit -m "feat: strategies tab with per-strategy stats list"
```

---

### Task 8: Strategy detail screen

**Files:**
- Create: `app/strategy/[id].tsx`
- Modify: `app/_layout.tsx` (register the route)

**Interfaces:**
- Consumes: `useStrategyDetail(strategyId)` (Task 5), `useStrategies()` actions (Task 4), `useAccountSetting()` for `accountType`/`displayUnit`, `TradeRow`, `Card`, `SectionHeader`, `EmptyState`, `StrategyFormSheet`, `Sheet`, `TextInputField`, `Button` (`src/ui`), `formatPnl`/`DisplayUnit` (`src/lib/format`), `RuleAdherence` (`src/stats/strategyStats`).
- Produces: route `strategy/[id]`; navigates to `/add-trade?strategyId={id}` and `/trade/{id}`.

- [ ] **Step 1: Write the screen**

Create `app/strategy/[id].tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  Button, Card, SectionHeader, TradeRow, EmptyState, StrategyFormSheet, TextInputField, Sheet,
} from '../../src/ui';
import { formatPnl, DisplayUnit } from '../../src/lib/format';
import { RuleAdherence } from '../../src/stats/strategyStats';
import { useStrategies } from '../../src/hooks/useStrategies';
import { useStrategyDetail } from '../../src/hooks/useStrategyDetail';
import { useAccountSetting } from '../../src/hooks/SettingsContext';

function StatCell({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? '#00E68A' : tone === 'bad' ? '#FF4D6A' : '#F0F2F5';
  return (
    <View className="bg-[#13141a] rounded-2xl border border-[#1e1d2b] p-4">
      <Text className="text-[10px] uppercase tracking-wider text-[#6b6880] font-bold mb-1">{label}</Text>
      <Text className="text-lg font-black" style={{ color, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

function fmtSigned(v: number, displayUnit: DisplayUnit): string {
  return `${v >= 0 ? '+' : '−'}${formatPnl(v, displayUnit)}`;
}

export default function StrategyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const parsedId = parseInt(id, 10);
  const strategyId = Number.isNaN(parsedId) ? 0 : parsedId;

  const { strategy, stats, rules, recentTrades, loading, error, refetch } = useStrategyDetail(strategyId);
  const { addRule, updateRule, archiveRule, updateStrategy, archiveStrategy } = useStrategies();
  const { accountType, displayUnit } = useAccountSetting();

  const [editStrategyOpen, setEditStrategyOpen] = useState(false);
  const [ruleSheetOpen, setRuleSheetOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleAdherence | null>(null);
  const [ruleText, setRuleText] = useState('');

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><ActivityIndicator size="large" color="#00E68A" /></View>;
  }
  if (error) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><EmptyState icon="alert-circle-outline" title="Couldn't load this strategy." subtitle={error.message} /></View>;
  }
  if (!strategy) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><EmptyState icon="alert-circle-outline" title="Strategy not found." /></View>;
  }

  const openAddRule = () => { setEditingRule(null); setRuleText(''); setRuleSheetOpen(true); };
  const openEditRule = (rule: RuleAdherence) => { setEditingRule(rule); setRuleText(rule.ruleText); setRuleSheetOpen(true); };

  const saveRule = async () => {
    if (!ruleText.trim()) { Alert.alert('Validation', 'Rule text is required.'); return; }
    try {
      if (editingRule) await updateRule(editingRule.ruleId, ruleText.trim());
      else await addRule(strategy.id, ruleText.trim());
      await refetch();
      setRuleSheetOpen(false);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save rule.');
    }
  };

  const confirmArchiveRule = (rule: RuleAdherence) => {
    Alert.alert('Archive Rule', `Remove "${rule.ruleText}" from this strategy? Past trades keep it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: async () => { await archiveRule(rule.ruleId); await refetch(); } },
    ]);
  };

  const confirmArchiveStrategy = () => {
    Alert.alert('Archive Strategy', `Archive "${strategy.name}"? It stays on historical trades.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: async () => { await archiveStrategy(strategy.id); router.back(); } },
    ]);
  };

  const pf = stats.profitFactor == null ? '∞' : stats.profitFactor.toFixed(3);

  return (
    <View className="flex-1 bg-dark-bg">
      <Stack.Screen options={{ title: 'Strategy' }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>

        <Animated.View entering={FadeIn.duration(400)}>
          <Card className="p-6 mb-5">
            <View className="flex-row items-start justify-between mb-3">
              <View className="flex-1 pr-4">
                <Text className="text-2xl font-black text-white mb-2">{strategy.name}</Text>
                {strategy.description ? <Text className="text-[#A8AEC1] leading-5">{strategy.description}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => setEditStrategyOpen(true)} className="p-2 bg-[#1a1b24] rounded-xl border border-[#2b2d3a]">
                <Ionicons name="pencil" size={18} color="#8B92A5" />
              </TouchableOpacity>
            </View>
            <Button title="＋ New Trade" onPress={() => router.push(`/add-trade?strategyId=${strategy.id}`)} />
          </Card>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(400).delay(80)}>
          <Card className="p-6 mb-5">
            <SectionHeader title="Performance" />
            <View className="flex-row flex-wrap gap-3 mt-3">
              <View className="flex-1 min-w-[45%]"><StatCell label="Net P&L" value={fmtSigned(stats.netPnl, displayUnit)} tone={stats.netPnl >= 0 ? 'good' : 'bad'} /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Closed Trades" value={String(stats.totalTrades)} /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Win Rate" value={stats.totalTrades > 0 ? `${stats.winRate.toFixed(1)}%` : '—'} tone={stats.winRate >= 50 ? 'good' : 'bad'} /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Profit Factor" value={pf} /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Expectancy" value={fmtSigned(stats.expectancy, displayUnit)} tone={stats.expectancy >= 0 ? 'good' : 'bad'} /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Avg Win" value={fmtSigned(stats.avgWin, displayUnit)} /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Avg Loss" value={fmtSigned(stats.avgLoss, displayUnit)} tone="bad" /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Best Trade" value={fmtSigned(stats.bestTrade, displayUnit)} tone="good" /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Worst Trade" value={fmtSigned(stats.worstTrade, displayUnit)} tone="bad" /></View>
              <View className="flex-1 min-w-[45%]">
                <StatCell
                  label="Streak"
                  value={stats.currentStreak > 0 ? `${stats.currentStreak}W` : stats.currentStreak < 0 ? `${-stats.currentStreak}L` : '—'}
                  tone={stats.currentStreak > 0 ? 'good' : stats.currentStreak < 0 ? 'bad' : 'neutral'}
                />
              </View>
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(400).delay(160)}>
          <Card className="p-6 mb-5">
            <View className="flex-row items-center justify-between mb-2">
              <SectionHeader title="Rules" />
              <TouchableOpacity onPress={openAddRule} className="flex-row items-center p-2">
                <Ionicons name="add-circle" size={18} color="#00E68A" />
                <Text className="text-[#00E68A] font-bold ml-1 text-sm">Add rule</Text>
              </TouchableOpacity>
            </View>
            {rules.length === 0 ? (
              <Text className="text-[#6b6880] text-sm py-3">No rules yet. Add the checklist you must follow for this strategy.</Text>
            ) : (
              rules.map((rule) => (
                <View key={rule.ruleId} className="flex-row items-center py-3 border-b border-dark-border">
                  <View className="flex-1">
                    <Text className="text-white text-sm font-semibold">{rule.ruleText}</Text>
                    <View className="mt-2 h-1.5 rounded-full bg-[#1e1d2b] overflow-hidden">
                      <View className="h-full rounded-full" style={{ width: `${rule.adherence}%`, backgroundColor: rule.adherence >= 70 ? '#00E68A' : rule.adherence >= 40 ? '#FFB547' : '#FF4D6A' }} />
                    </View>
                    <Text className="text-[11px] text-[#8B92A5] mt-1" style={{ fontVariant: ['tabular-nums'] }}>
                      {rule.checked}/{rule.checked + rule.unchecked} followed · {rule.adherence.toFixed(0)}%
                    </Text>
                  </View>
                  <View className="flex-row ml-3">
                    <TouchableOpacity onPress={() => openEditRule(rule)} className="p-2">
                      <Ionicons name="pencil" size={16} color="#8B92A5" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmArchiveRule(rule)} className="p-2">
                      <Ionicons name="trash-outline" size={16} color="#FF4D6A" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </Card>
        </Animated.View>

        {recentTrades.length > 0 && (
          <Animated.View entering={FadeIn.duration(400).delay(240)}>
            <Card className="p-6 mb-5">
              <SectionHeader title="Recent Trades" />
              <View className="mt-3">
                {recentTrades.map((trade, i) => (
                  <TradeRow key={trade.id} trade={trade} index={i} onPress={() => router.push(`/trade/${trade.id}`)} accountType={accountType} displayUnit={displayUnit} />
                ))}
              </View>
            </Card>
          </Animated.View>
        )}

        <Button title="Archive Strategy" variant="danger" onPress={confirmArchiveStrategy} />
      </ScrollView>

      <StrategyFormSheet
        visible={editStrategyOpen}
        onClose={() => setEditStrategyOpen(false)}
        initial={{ name: strategy.name, description: strategy.description }}
        onSubmit={async (input) => { await updateStrategy(strategy.id, input); await refetch(); }}
      />

      <Sheet visible={ruleSheetOpen} onClose={() => setRuleSheetOpen(false)} title={editingRule ? 'Edit Rule' : 'Add Rule'}>
        <View className="mt-4">
          <TextInputField value={ruleText} onChangeText={setRuleText} placeholder="e.g. Only trade after a liquidity sweep" multiline />
          <View className="pt-2 pb-4">
            <Button title="Save Rule" onPress={saveRule} />
          </View>
        </View>
      </Sheet>
    </View>
  );
}
```

- [ ] **Step 2: Register the route**

In `app/_layout.tsx`, add inside `<Stack>` (after the `trade/[id]` screen):

```tsx
<Stack.Screen
  name="strategy/[id]"
  options={{ title: 'Strategy' }}
/>
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/strategy/[id].tsx app/_layout.tsx
git commit -m "feat: strategy detail screen with performance stats and rule adherence"
```

---

### Task 9: `useAddTrade` — strategy preselection and rule counts

**Files:**
- Modify: `src/db/database.ts` (already has `getStrategyRuleCounts` from Task 3)
- Modify: `src/hooks/useAddTrade.ts`
- Modify: `app/add-trade.tsx` (pass `strategyId` through; hook consumption only — UI comes in Task 11)

**Interfaces:**
- Consumes: `insertStrategy`, `getStrategies`, `getStrategyRules`, `getStrategyRuleCounts` (`src/db/database.ts`).
- Produces (additions to `useAddTrade`'s return):
  ```ts
  {
    strategyRuleCounts: Record<number, number>;
    createStrategy(input: { name: string; description: string | null }): Promise<number>; // inserts, refreshes the strategies list, returns the new id
  }
  ```
- `useAddTrade({ tradeId, strategyId })` — when `strategyId` is passed and not editing, preselect that strategy and load its rules.

- [ ] **Step 1: Preselect in useAddTrade**

In `src/hooks/useAddTrade.ts`:

- Change the signature to `export function useAddTrade({ tradeId, strategyId }: { tradeId?: number; strategyId?: number })`.
- Add state next to `strategies`: `const [strategyRuleCounts, setStrategyRuleCounts] = useState<Record<number, number>>({});`
- In the load effect, add `getStrategyRuleCounts` to the initial `Promise.all` and store it:
  ```ts
  const [emotionRows, tagRows, strategyRows, instRows, ruleCounts] = await Promise.all([
    getEmotions(db), getTags(db), getStrategies(db), getInstruments(db), getStrategyRuleCounts(db),
  ]);
  ...
  setStrategyRuleCounts(ruleCounts);
  ```
- After the edit-mode block, before `return`, add the preselection (only for new trades):
  ```ts
  if (!editMode && strategyId != null) {
    strategyIdRef.current = strategyId;
    setFields((f) => ({ ...f, strategyId }));
    const rules = await getStrategyRules(db, strategyId);
    if (mounted) setStrategyRules(rules);
  }
  ```
- Update the load effect's dependency array from `[db, editMode, tradeId]` to `[db, editMode, tradeId, strategyId]` (the body now reads `strategyId`).
- Add `createStrategy` next to `selectStrategy`:
  ```ts
  const createStrategy = useCallback(async (input: { name: string; description: string | null }) => {
    const id = await insertStrategy(db, input);
    const rows = await getStrategies(db);
    setStrategies(rows);
    setStrategyRuleCounts(await getStrategyRuleCounts(db));
    return id;
  }, [db]);
  ```
- Add imports: `insertStrategy`, `getStrategyRuleCounts` to the existing `../db/database` import block.
- Add `strategyRuleCounts` and `createStrategy` to the returned object.

- [ ] **Step 2: Pass the param from the screen**

In `app/add-trade.tsx`:
- Change the params read to `const { id, strategyId } = useLocalSearchParams<{ id?: string; strategyId?: string }>();`
- Parse and pass through:
  ```ts
  const parsedStrategyId = strategyId ? parseInt(strategyId, 10) : undefined;
  const presetStrategyId = parsedStrategyId != null && !Number.isNaN(parsedStrategyId) ? parsedStrategyId : undefined;
  const { fields, setters, pickers, errors, fillRows, addFill, removeFill, setFill, saving, save, editMode, loading: addTradeLoading, ruleChecks, strategyRuleCounts, createStrategy } = useAddTrade({ tradeId, strategyId: presetStrategyId });
  ```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAddTrade.ts app/add-trade.tsx
git commit -m "feat: preselect strategy in add-trade and expose rule counts"
```

---

### Task 10: Symbol picker → bottom Sheet (bug fix)

**Files:**
- Modify: `app/add-trade.tsx`

**Interfaces:**
- Consumes: `useSQLiteContext` (`expo-sqlite`), `insertInstrument` (`src/db/database`), `Instrument`, `AssetClass` (`src/db/schema`), `ASSET_CLASSES` (`src/lib/constants`), `inferQuoteCurrency` (`src/lib/quoteCurrency`), `Sheet`/`Button`/`Segmented`/`NumericInput`/`TextInputField`/`SelectRow`-pattern (`src/ui`).
- Produces: the symbol field opens a `SymbolSheet`; deleting the old `symbolQuery`/`symbolFocused` dropdown.

- [ ] **Step 1: Add imports**

In `app/add-trade.tsx`:
- Add to the react-native import: nothing new needed (ScrollView, TouchableOpacity already there).
- Add `import { useSQLiteContext } from 'expo-sqlite';`
- Add to `'../src/db/database'`: `insertInstrument`.
- Add `import { Instrument, AssetClass } from '../src/db/schema';`
- Add `ASSET_CLASSES` to the existing `'../src/lib/constants'` import.
- Add `inferQuoteCurrency` to the existing `'../src/lib/quoteCurrency'` import.

- [ ] **Step 2: Remove the old dropdown**

In `app/add-trade.tsx`:
- Delete `const [symbolQuery, setSymbolQuery] = useState('');` and `const [symbolFocused, setSymbolFocused] = useState(false);`.
- Delete the `useEffect` that syncs `symbolQuery` from `fields.instrumentId`.
- Delete `const filteredInstruments = ...` (line ~260).
- Delete the whole `<View style={{ zIndex: 100 }}>…</View>` dropdown block (the `TextInputField`, the invisible overlay `Pressable`, and the absolute-positioned list), replacing the `<Field label="Symbol *">` body with:
  ```tsx
  <Field label="Symbol *">
    <SelectRow value={selectedInstrument?.symbol ?? null} placeholder="Select symbol…" onPress={() => setSymbolSheetOpen(true)} />
    {selectedInstrument && (
      <Animated.View entering={FadeInDown.duration(300)} className="flex-row items-center gap-2 mt-2 px-1">
        <Ionicons name="checkmark-circle" size={14} color="#00E68A" />
        <Text className="text-xs text-[#00E68A] font-semibold">
          {selectedInstrument.asset_class.toUpperCase()} · {quoteCurrency.toUpperCase()}{contractSize !== 1 ? ` · x${contractSize}` : ''}
        </Text>
      </Animated.View>
    )}
  </Field>
  ```
- Change the ScrollView's `onScrollBeginDrag` to `onScrollBeginDrag={() => Keyboard.dismiss()}` (drop the `symbolFocused` reference).
- Add state: `const db = useSQLiteContext();` and `const [symbolSheetOpen, setSymbolSheetOpen] = useState(false);` in the component body.
- Render `<SymbolSheet visible={symbolSheetOpen} onClose={() => setSymbolSheetOpen(false)} instruments={pickers.instruments} onSelect={(instId) => { setters.setInstrumentId(instId); setSymbolSheetOpen(false); }} />` next to the strategy `Sheet` (after line ~532).

- [ ] **Step 3: Write the SymbolSheet component**

Add to `app/add-trade.tsx` (above the main `AddTrade` component):

```tsx
function SymbolSheet({ visible, onClose, instruments, onSelect }: {
  visible: boolean;
  onClose: () => void;
  instruments: Instrument[];
  onSelect: (id: number) => void;
}) {
  const db = useSQLiteContext();
  const [query, setQuery] = useState('');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [assetClass, setAssetClass] = useState<AssetClass>('forex');
  const [contractSize, setContractSize] = useState('1');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) { setQuery(''); setQuickAddOpen(false); setSymbol(''); setContractSize('1'); }
  }, [visible]);

  const filtered = query.trim().length > 0
    ? instruments.filter((i) => i.symbol.toLowerCase().includes(query.toLowerCase()))
    : instruments;

  const saveQuick = async () => {
    if (!symbol.trim()) { Alert.alert('Validation', 'Symbol is required.'); return; }
    setSaving(true);
    try {
      const inferredQuote = inferQuoteCurrency(symbol);
      const id = await insertInstrument(db, {
        symbol: symbol.toUpperCase(),
        name: null,
        asset_class: assetClass,
        quote_currency: inferredQuote ? inferredQuote : 'USD',
        price_mode: 'standard',
        contract_size: parseFloat(contractSize) || 1,
        tick_size: null,
      });
      onSelect(id);
      onClose();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add symbol.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Select Symbol">
      <View className="mt-4">
        <TextInputField value={query} onChangeText={(v) => setQuery(v.toUpperCase())} placeholder="Search symbol…" autoFocus />

        <TouchableOpacity
          onPress={() => setQuickAddOpen((o) => !o)}
          className="mt-3 mb-2 flex-row items-center px-4 py-3 rounded-2xl bg-[#00E68A]/10 border border-[#00E68A]/20"
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle" size={18} color="#00E68A" />
          <Text className="text-[#00E68A] font-bold ml-2 text-sm">Add new symbol</Text>
          <View className="flex-1" />
          <Ionicons name={quickAddOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#00E68A" />
        </TouchableOpacity>

        {quickAddOpen && (
          <View className="mb-2">
            <TextInputField value={symbol} onChangeText={setSymbol} placeholder="e.g. USDJPY" autoCapitalize="characters" />
            <Text className="text-[11px] text-[#6b6880] mt-1 mb-3">Quote currency auto-detected from the symbol (USDJPY → JPY).</Text>
            <Segmented<AssetClass> options={ASSET_CLASSES.map((a) => ({ key: a.key, label: a.label }))} value={assetClass} onChange={setAssetClass} />
            <View className="mt-3">
              <NumericInput value={contractSize} onChangeText={setContractSize} placeholder="Contract size (forex: 100000)" />
            </View>
            <View className="mt-3 mb-2">
              <Button title={saving ? 'Saving…' : 'Add & Select'} onPress={saveQuick} disabled={saving} />
            </View>
          </View>
        )}

        {filtered.map((inst) => (
          <TouchableOpacity
            key={inst.id}
            onPress={() => { onSelect(inst.id); onClose(); }}
            className="py-4 border-b border-[#2b2d3a] flex-row justify-between items-center"
            activeOpacity={0.7}
          >
            <View>
              <Text className="text-white font-bold text-base">{inst.symbol}</Text>
              {inst.name ? <Text className="text-[#8B92A5] text-xs mt-0.5">{inst.name}</Text> : null}
            </View>
            <Text className="text-[#6b6880] text-[11px] font-bold uppercase">{inst.asset_class}</Text>
          </TouchableOpacity>
        ))}
        <View className="h-6" />
      </View>
    </Sheet>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: clean. If `Alert` is not yet imported in `add-trade.tsx`, add it to the react-native import.

- [ ] **Step 5: Commit**

```bash
git add app/add-trade.tsx
git commit -m "fix: symbol picker as a scrollable sheet with add-first quick-create"
```

---

### Task 11: Add-trade strategy sheet upgrade

**Files:**
- Modify: `app/add-trade.tsx`

**Interfaces:**
- Consumes: `strategyRuleCounts`, `createStrategy` (Task 9), `StrategyFormSheet` (Task 6), `selectStrategy` (existing).
- Produces: strategy sheet shows rule counts, a pinned "＋ New strategy" row, and creates + auto-selects a new strategy without leaving the form.

- [ ] **Step 1: Wire the UI**

In `app/add-trade.tsx`:
- Add `StrategyFormSheet` to the `'../src/ui'` import.
- Add state: `const [strategyFormOpen, setStrategyFormOpen] = useState(false);`
- Inside the strategy `Sheet` (before the "No strategy (Clear)" row), add the pinned new-strategy row:
  ```tsx
  <TouchableOpacity
    onPress={() => { setStrategySheetOpen(false); setStrategyFormOpen(true); }}
    className="mt-4 py-4 border-b border-[#2b2d3a] flex-row items-center justify-center bg-[#00E68A]/10 rounded-xl"
    activeOpacity={0.7}
  >
    <Ionicons name="add-circle" size={18} color="#00E68A" />
    <Text className="text-[#00E68A] font-bold ml-2 text-sm">New strategy</Text>
  </TouchableOpacity>
  ```
- In each strategy row, add the rule count under the description:
  ```tsx
  <Text className="text-[#6b6880] text-xs mt-1">{strategyRuleCounts[s.id] ?? 0} rules</Text>
  ```
- Render the form sheet at the end (next to the strategy `Sheet`):
  ```tsx
  <StrategyFormSheet
    visible={strategyFormOpen}
    onClose={() => setStrategyFormOpen(false)}
    onSubmit={async (input) => {
      const newId = await createStrategy(input);
      await setters.selectStrategy(newId);
    }}
  />
  ```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

Run: `pnpm test`
Expected: PASS (52).

- [ ] **Step 3: Commit**

```bash
git add app/add-trade.tsx
git commit -m "feat: create and auto-select strategies from add-trade"
```

---

### Task 12: Full verification and smoke checklist

**Files:** none (verification only).

- [ ] **Step 1: Full suite + typecheck**

Run: `pnpm test`
Expected: PASS (52 tests).

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 2: Stale-reference scan**

Run (expect no matches in `app/` or `src/`):
- `rg "symbolFocused|symbolQuery" app src`
- `rg "Add new symbol" app/add-trade.tsx` — should appear exactly once, as the Sheet's first row button.

- [ ] **Step 3: Working tree check**

Run: `git status --short`
Expected: clean (every task committed).

- [ ] **Step 4: Manual smoke on device (documented for the user, not automatable)**

Run: `npx expo start`
- Strategies tab: create "Breakout v2" with a description → appears in list with `0 closed · —% · +$0.00`.
- Strategy detail: add 3 rules; stats grid shows zeros/∞; "＋ New Trade" opens add-trade with strategy preselected and its rules checklist shown.
- Add-trade symbol field: opens the Sheet; "Add new symbol" is the first row; create `USDJPY` (contract 100000 auto-hint) → it is selected immediately; search filters; existing symbol selection works.
- Enter two closed trades against the strategy (one winner, one loser) → detail now shows win rate 50%, profit factor, expectancy, streak, best/worst, and rule adherence percentages.
- Archive a rule → disappears from the checklist but stays on the historical trade's detail.
- Archive the strategy → confirm dialog; returns to the Strategies tab, list is refreshed.
- Existing dashboard/trades/settings regression check.

- [ ] **Step 5: Final commit**

Nothing to commit unless the smoke test surfaced a fix. If it did, commit the fix scoped on its own.

---

## Notes for the implementer

- **Reading tasks out of order is safe:** each task lists its own exact code. Cross-task names are pinned in each task's **Interfaces** block.
- **`useStrategies` on the detail screen loads all trades again** — deliberate (avoids duplicating action code); negligible cost at this app's scale.
- **Do not add P&L columns** — all stats derive from `computeTradePnl`.
- **`formatPnl` is sign-agnostic** (returns absolute value) — screens add `+`/`−` and color manually, as the plan code does.
