# MT5 Import-Truth, Cent-Exact P&L, Pro Chart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the MT5 CSV the source of truth for imported trades (ticket column, verbatim timestamps, exact prices), round P&L to the account cent per trade, drive investment display from the display unit, bucket dashboard days in UTC, and polish the trend chart (correct labels, solid zero axis, single blue identity).

**Architecture:** All six fixes touch independent layers — `csvParser` (import truth), `database` (ticket dedup + additive migration), `computeStats` (rounding + UTC buckets), `format`/UI (display), and the trend chart. Pure-logic layers (`src/lib`, `src/stats`) are TDD'd with Vitest; DB and screen changes are verified by `pnpm typecheck` plus the manual checklist at the end. P&L stays always-computed (never stored). The import path carries the ticket through raw SQL only — `TradeDraft` is intentionally NOT given a `ticket` field so manual edits (which do a full partial `UPDATE` from the form draft) can never NULL it.

**Tech Stack:** Expo SDK 57 / React Native 0.86, TypeScript strict, expo-sqlite, Vitest, pnpm.

## Global Constraints

- Run `pnpm typecheck` (strict, `tsc --noEmit`) and `pnpm test` (`vitest run`) before any task is "done".
- P&L is always computed via `computeTradePnl` / `computeStats`; never add a stored P&L column.
- `shadow-*` classes are always static literals — never toggle them at runtime (nativewind css-interop limitation). Toggle color classes instead.
- No comments that restate the code; comments explain *why*. Remove stale comments when their code changes.
- Migration pattern: additive, checked via `pragma_table_info`, no-op on fresh installs (follow the existing `trade_style` migration).
- Commit per task, conventional style (`feat:` / `fix:` / `test:` / `refactor:`). **Stage only the files listed in the task** — never the repo-root CSV files (`01_01_2007-*.csv`) or any `_tmp_*.js` scratch file; they are user data / session artifacts, not part of the feature.
- Do not run `git add -A` / `git add .` under any circumstances; use explicit paths.

---

## File Map

| File | Responsibility | Tasks |
|---|---|---|
| `src/lib/csvParser.ts` | CSV → normalized rows; import truth (verbatim time, ≤6-dec prices, no notes, ticket) | 1 |
| `src/lib/csvParser.test.ts` | Parser tests | 1 |
| `src/db/schema.ts` | `Trade.ticket` type | 2 |
| `src/db/database.ts` | Ticket migration, dedup, insert, open→closed upgrade | 2 |
| `src/stats/computeStats.ts` | `computeTradePnl` cent rounding; UTC buckets; `TradeWithInstrument.ticket` | 2, 3, 4 |
| `src/stats/computeStats.test.ts` | Rounding + UTC bucket tests | 3, 4 |
| `src/lib/format.ts` | `formatPrice` ≤6 decimals | 5 |
| `src/lib/format.test.ts` | `formatPrice` tests | 5 |
| `src/ui/TradeRow.tsx` | `Inv:` follows display unit | 6 |
| `app/(tabs)/trades.tsx` | "Investment (Size)" filter prefix follows display unit | 6 |
| `app/trade/[id].tsx` | Remove Open pill; blue "Open" text | 7 |
| `app/(tabs)/index.tsx` | UTC today default; trend chart labels/zero-axis/blue | 4, 8 |

---

### Task 1: CSV is the source of truth (verbatim timestamps, exact prices, no notes hack)

**Files:**
- Modify: `src/lib/csvParser.ts`
- Modify: `src/lib/csvParser.test.ts`

**Interfaces:**
- Consumes: nothing (pure lib).
- Produces:
  - `normalizeImportedDateTime(value: string): string` — **one arg now** (no `isUtc`). Normalizes `2024.08.14 09:19:24` → `2024-08-14T09:19:24` and otherwise returns the input verbatim. No timezone conversion.
  - `csvRowToTradeDraft(...)` returns `TradeDraft`-shaped object **plus** `ticket: string | null` (notes is now `null`). Used by Task 2's import path and the tests.
  - `parsePrice` internal helper (≤6 decimals, trailing zeros trimmed).

- [ ] **Step 1: Update the failing tests**

Edit `src/lib/csvParser.test.ts`:

Replace the `normalizeImportedDateTime` describe block (lines 92-119) with:

```ts
describe('normalizeImportedDateTime', () => {
  it('converts MT5 dot format to ISO date/time', () => {
    const out = normalizeImportedDateTime('2024.08.14 09:19:24');
    expect(out).toBe('2024-08-14T09:19:24');
  });

  it('returns the CSV wall-clock time verbatim (no UTC→local conversion)', () => {
    // The CSV is the source of truth: the stored value must match the export,
    // not the device's local wall time.
    expect(normalizeImportedDateTime('2026-08-14T09:19:24')).toBe('2026-08-14T09:19:24');
    expect(normalizeImportedDateTime('2024.08.14 09:19:24')).toBe('2024-08-14T09:19:24');
  });

  it('normalizes parsed rows to ISO day buckets', () => {
    const rows = parseCsvRows(`ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price,commission,swap,close_reason
1,2024.08.14 09:19:24,2024.08.14 10:31:25,buy,0.01,XAUUSD,100,101,0,0,tp`);
    expect(rows[0].opening_time_utc.slice(0, 10)).toBe('2024-08-14');
    expect(rows[0].opening_time_utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('leaves unparseable values untouched', () => {
    expect(normalizeImportedDateTime('not-a-date')).toBe('not-a-date');
  });
});
```

Add a new describe block for price precision:

```ts
describe('price precision', () => {
  it('parses prices to at most 6 decimals, trimming binary float noise', () => {
    const rows = parseCsvRows(`ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price,commission,swap,close_reason
1,2026-08-14T09:19:24,2026-08-14T10:31:25,buy,0.01,XAUUSD,1.3514599999999999,1.3514599999999999,0,0,tp`);
    expect(rows[0].opening_price).toBe(1.35146);
    expect(rows[0].closing_price).toBe(1.35146);
  });

  it('keeps a full 6-decimal price intact', () => {
    const rows = parseCsvRows(`ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,close_reason
1,2026-08-14T09:19:24,2026-08-14T10:31:25,buy,0.01,XAUUSDc,4349.4,4349.896,4349.896,4361.814,,,sl`);
    expect(rows[0].opening_price).toBe(4349.4);
    expect(rows[0].closing_price).toBe(4349.896);
    expect(rows[0].stop_loss).toBe(4349.896);
    expect(rows[0].take_profit).toBe(4361.814);
  });
});
```

Update the open-positions draft test (lines 147-156) — notes now empty, ticket carried:

```ts
  it('maps an open row to an open trade draft', () => {
    const draft = csvRowToTradeDraft(parseCsvRows(OPEN_SAMPLE)[0], 1, 9);
    expect(draft.status).toBe('open');
    expect(draft.direction).toBe('short');
    expect(draft.entry_price).toBe(4383.649);
    expect(draft.exit_price).toBeNull();
    expect(draft.exit_at).toBeNull();
    expect(draft.fees).toBe(0);
    expect(draft.notes).toBeNull();
    expect(draft.ticket).toBe('422398499');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/csvParser.test.ts`
Expected: FAIL — `normalizeImportedDateTime('2024.08.14 09:19:24')` errors (arity mismatch is not an error in JS, so failures show as `1.3514599999999999` ≠ `1.35146` and `draft.notes` ≠ `null`).

- [ ] **Step 3: Implement `csvParser.ts` changes**

In `src/lib/csvParser.ts`:

Replace the whole `normalizeImportedDateTime` function and its doc comment (lines 182-203) with:

```ts
// MT5 history exports timestamps as "2024.08.14 09:19:24" (dot separators). The
// CSV is the source of truth: keep the wall-clock time exactly as exported
// (server/UTC), only normalizing the format to the app's naive ISO shape
// (YYYY-MM-DDTHH:mm:ss). No timezone conversion — the stored value must match the
// CSV, and day buckets are derived in UTC.
export function normalizeImportedDateTime(value: string): string {
  const v = value.trim();
  if (!v) return v;
  return v
    .replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3')
    .replace(' ', 'T');
}
```

Add the `parsePrice` helper just below it:

```ts
// Prices round-trip to ≤6 decimals with trailing zeros trimmed; MT5 exports at
// most 6 significant decimals, so this never changes the CSV's value but keeps
// binary floats from leaking garbage like 1.3514599999999999.
const parsePrice = (raw: string): number | null => {
  const v = raw.trim();
  if (!v) return null;
  return Number(parseFloat(v).toFixed(6));
};
```

In `parseCsvRows`, change the price field reads (lines 75-95) to use `parsePrice`:

```ts
    const closingPrice = isClosed ? parsePrice(get('closing_price')) : null;
    const closingTime = isClosed ? normalizeImportedDateTime(get('closing_time_utc')) : null;
    // A closed row must carry its exit data; otherwise it can't be priced and
    // would silently vanish from stats — skip it instead.
    if (isClosed && (closingPrice === null || !closingTime)) continue;

    rows.push({
      kind,
      ticket: get('ticket'),
      opening_time_utc: normalizeImportedDateTime(get('opening_time_utc')),
      closing_time_utc: closingTime,
      type,
      lots: getNum(sizeCol),
      symbol: get('symbol'),
      opening_price: parsePrice(get('opening_price')) ?? 0,
      closing_price: closingPrice,
      stop_loss: parsePrice(get('stop_loss')),
      take_profit: parsePrice(get('take_profit')),
      commission: getNum('commission'),
      swap: isClosed ? getNum('swap') : null,
      close_reason: isClosed ? get('close_reason') : null,
    });
```

In `csvRowToTradeDraft` (lines 215-242), drop the notes hack and carry the ticket:

```ts
    notes: null,
    ticket: row.ticket.trim() || null,
```

(The `notes:` line replaces the current `` notes: `MT5 ticket: ${row.ticket}`, ``; add the `ticket:` line right after it.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/csvParser.test.ts`
Expected: PASS (all describes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/csvParser.ts src/lib/csvParser.test.ts
git commit -m "fix: csv import is source of truth — verbatim times, exact prices, ticket in its own field"
```

---

### Task 2: Ticket column replaces the notes dedup hack (schema + migration + import)

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/stats/computeStats.ts` (type only)
- Modify: `src/db/database.ts`

**Interfaces:**
- Consumes: `csvRowToTradeDraft` from Task 1 (its object now carries `ticket`, `notes` is `null`).
- Produces:
  - `Trade.ticket: string | null` (new schema field) and `TradeWithInstrument.ticket: string | null`.
  - `insertTrade(db, trade: Omit<Trade, 'id' | 'created_at' | 'updated_at' | 'ticket'>): Promise<number>` — signature loosened so `TradeDraft` (no `ticket`) stays assignable.
  - `importTradesFromCsv` dedups on `WHERE ticket = ?`; the import INSERT writes `ticket` and `notes NULL`; `closeTradeFromImport` stops writing `notes` and writes `ticket` instead.
  - Additive migration `v3`: `ALTER TABLE trades ADD COLUMN ticket TEXT;` + backfill from notes.
- `TradeDraft` is **intentionally unchanged** — see `database.ts` `updateTrade` (line 419): it does `UPDATE trades SET <every key of the passed object>`. If the manual edit form draft ever contained `ticket`, saving an edit to an imported trade would NULL the ticket on every save. Keeping it out of `TradeDraft` makes manual edits ticket-preserving for free.

- [ ] **Step 1: Add the schema fields**

In `src/db/schema.ts`, `Trade` type, after `reflection: string | null;` (line 96):

```ts
  ticket: string | null; // MT5 import ticket; null for manual trades
```

In `src/stats/computeStats.ts`, `TradeWithInstrument` type, after `reflection: string | null;` (line 29):

```ts
  ticket: string | null;
```

- [ ] **Step 2: Loosen `insertTrade` so `TradeDraft` stays assignable**

In `src/db/database.ts` line 383, change the parameter type to exclude `ticket` (the SQL column list in the function body is unchanged — manual inserts just leave `ticket` NULL):

```ts
export async function insertTrade(
  db: SQLiteDatabase,
  trade: Omit<Trade, 'id' | 'created_at' | 'updated_at' | 'ticket'>
): Promise<number> {
```

- [ ] **Step 3: Add the additive `v3` migration**

In `src/db/database.ts`, immediately after the `if (!hasTradeStyle) { ... }` block (ends line 261), reuse the already-fetched `tradesCols`:

```ts
  // --- v3 upgrade: MT5 import ticket (additive; no-op on fresh installs) ---
  const hasTicket = tradesCols.some((c) => c.name === 'ticket');
  if (!hasTicket) {
    await db.execAsync(`ALTER TABLE trades ADD COLUMN ticket TEXT;`);
    // Backfill legacy imports whose ticket lived in notes as "MT5 ticket: <id>".
    // substr(notes, 13) strips the 12-char prefix. The legacy notes text is left
    // in place — users may have annotated around it; dedup just stops reading it.
    await db.runAsync(
      `UPDATE trades SET ticket = substr(notes, 13) WHERE notes LIKE 'MT5 ticket: %'`
    );
  }
```

- [ ] **Step 4: Dedup on the ticket column**

In `importTradesFromCsv` (lines 864-874), replace the dedup lookup:

```ts
      // Idempotency: re-importing an MT5 report must not duplicate trades. The
      // ticket lives in its own column; statements inside this transaction see
      // earlier inserts, so a ticket repeated in one file is naturally skipped.
      const ticket = row.ticket.trim();
      const existing = ticket
        ? await db.getFirstAsync<{ id: number; status: TradeStatus }>(
            'SELECT id, status FROM trades WHERE ticket = ? LIMIT 1',
            [ticket],
          )
        : null;
```

- [ ] **Step 5: Open→closed upgrade stops touching notes, writes ticket**

Change `ImportCloseUpdate` (lines 809-821): replace `notes: string | null;` with `ticket: string;`.

In `closeTradeFromImport` (lines 832-842), remove `notes = ?` from the SET list and the `update.notes` param; add `ticket = ?`:

```ts
  await db.runAsync(
    `UPDATE trades SET
       status = ?, entry_price = ?, exit_price = ?, size = ?,
       stop_loss = ?, take_profit = ?, entry_at = ?, exit_at = ?,
       fees = ?, exit_condition = ?, ticket = ?,
       updated_at = datetime('now')
     WHERE id = ?`,
    [update.status, update.entry_price, update.exit_price, update.size,
     update.stop_loss, update.take_profit, update.entry_at, update.exit_at,
     update.fees, update.exit_condition, update.ticket, tradeId],
  );
```

At the call site (lines 916-928), replace `notes: td.notes,` with `ticket,` (the already-trimmed loop variable, which is non-null because the row was found by that ticket):

```ts
        await closeTradeFromImport(db, existing.id, {
          status: 'closed',
          entry_price: td.entry_price,
          exit_price: td.exit_price as number,
          size: td.size,
          stop_loss: td.stop_loss,
          take_profit: td.take_profit,
          entry_at: td.entry_at,
          exit_at: td.exit_at as string,
          fees: td.fees,
          exit_condition: td.exit_condition,
          ticket,
        }, fills);
```

- [ ] **Step 6: Import INSERT writes `ticket`, keeps `notes` NULL**

In the insert branch (lines 933-952), add the `ticket` column (21 placeholders now):

```ts
      const tradeResult = await db.runAsync(
        `INSERT INTO trades
          (account_id, instrument_id, strategy_id, emotion_id,
           trade_style, entry_condition, exit_condition,
           direction, status, entry_price, exit_price, size,
           stop_loss, take_profit, entry_at, exit_at,
           fees, followed_rules, notes, reflection, ticket)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          td.account_id, td.instrument_id,
          td.strategy_id, td.emotion_id,
          td.trade_style, td.entry_condition, td.exit_condition,
          td.direction, td.status,
          td.entry_price, td.exit_price, td.size,
          td.stop_loss, td.take_profit,
          td.entry_at, td.exit_at,
          td.fees, td.followed_rules,
          td.notes, td.reflection,
          ticket,
        ],
      );
```

(`td.notes` is `null` from Task 1, so imported trades import with empty notes.)

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (There is no SQLite unit-test harness in this repo, so dedup/migration/upgrade behavior is verified in the Manual Verification task.)

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts src/stats/computeStats.ts src/db/database.ts
git commit -m "feat: dedup imports by trades.ticket instead of the notes hack"
```

---

### Task 3: Per-trade P&L rounds to the account cent (MT5-style)

**Files:**
- Modify: `src/stats/computeStats.ts`
- Modify: `src/stats/computeStats.test.ts`

**Interfaces:**
- Consumes: `computeTradePnlInUsd` (unchanged, stays full precision).
- Produces: `computeTradePnl(trade: TradeWithInstrument): number` now returns the account-cent-rounded USD P&L (cents → 4 decimals, standard → 2). Single rounding boundary — stats, dashboard, detail, and `TradeRow` all read it.

- [ ] **Step 1: Write the failing tests**

Append to `src/stats/computeStats.test.ts` inside the `computeTradePnl` describe (line 57):

```ts
  it('rounds each trade to the account cent before summing (standard → 2 decimals)', () => {
    const trade = makeTrade({
      price_mode: 'standard',
      entry_price: 100,
      exit_price: 100.1234,
      size: 1,
      contract_size: 1,
    });
    expect(computeTradePnl(trade)).toBe(0.12);
  });

  it('rounds cents-account P&L to 4-decimal USD (the USC cent)', () => {
    const trade = makeTrade({
      price_mode: 'cents',
      entry_price: 100,
      exit_price: 100.12345,
      size: 1,
      contract_size: 1,
    });
    expect(computeTradePnl(trade)).toBe(0.1235);
  });

  it('a sub-cent P&L rounds to exactly 0 even when full precision is nonzero', () => {
    const trade = makeTrade({
      price_mode: 'cents',
      entry_price: 100,
      exit_price: 100.00003,
      size: 1,
      contract_size: 1,
    });
    expect(computeTradePnl(trade)).toBe(0);
    expect(computeStats([trade]).allTimePnl).toBe(0);
  });
```

Update the two existing USDJPY assertions that pinned full precision (lines 71 and 103, plus the hero sum at line 109). With cent rounding, `-0.0010155` USD → `-0.001` (4 decimals):

```ts
    const pnl = computeTradePnl(trade);
    expect(pnl).toBe(-0.001);
    expect(pnl * 100).toBeCloseTo(-0.10, 2);
```

and

```ts
    const pnl = computeTradePnl(trade);
    expect(pnl).toBe(-0.001);
    expect(formatPnl(pnl, 'usc')).toBe('0.10 USC');
    expect(formatPnl(pnl, 'usd')).toBe('$0.001');

    // Dashboard hero shows the sum of visible trades; the sum must convert too.
    const hero = computeStats([trade]).allTimePnl;
    expect(hero).toBe(-0.001);
    expect(formatPnl(hero, 'usc')).toBe('0.10 USC');
    expect(formatPnl(hero, 'usd')).toBe('$0.001');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/stats/computeStats.test.ts`
Expected: FAIL — new cases show unrounded values (`0.1234`, `0.12345`, `0.00003`) and the updated USDJPY cases fail against the still-unrounded implementation.

- [ ] **Step 3: Implement the rounding**

In `src/stats/computeStats.ts`, replace the body of `computeTradePnl` (lines 60-73) and add the helper:

```ts
// MT5 rounds each trade's realized profit to the account currency's cent before
// carrying it into totals. Cents accounts display USC (2 decimals), so their USD
// value is quantized to 0.0001. This is the single rounding boundary — the
// add-trade preview uses computeTradePnlInUsd directly and keeps full precision.
function roundPnlToAccountCent(pnlUsd: number, priceMode: 'standard' | 'cents'): number {
  const digits = priceMode === 'cents' ? 4 : 2;
  return Number(pnlUsd.toFixed(digits));
}

export function computeTradePnl(trade: TradeWithInstrument): number {
  if (trade.exit_price == null) return 0;

  return roundPnlToAccountCent(
    computeTradePnlInUsd({
      direction: trade.direction,
      entryPrice: trade.entry_price,
      exitPrice: trade.exit_price,
      lots: trade.size,
      contractSize: trade.contract_size,
      quoteCurrency: resolveQuoteCurrency(trade.symbol, trade.quote_currency),
      fees: trade.fees,
      accountType: trade.price_mode,
    }),
    trade.price_mode,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/stats/computeStats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stats/computeStats.ts src/stats/computeStats.test.ts
git commit -m "fix: round per-trade P&L to the account cent before summing (MT5-style)"
```

---

### Task 4: UTC day buckets

**Files:**
- Modify: `src/stats/computeStats.ts`
- Modify: `src/stats/computeStats.test.ts`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `computeStats` derives `todayStr` / `weekStartStr` / `monthStr` from UTC (matching MT5 server days and the already-UTC `getWeekDays`/`getMonthDays` calendars). Dashboard `todayUtc` default for `selectedDate`/`viewDate`.

- [ ] **Step 1: Write the failing tests**

Append to `src/stats/computeStats.test.ts` (inside the `computeStats` describe):

```ts
  it('buckets today/week/month in UTC (matches MT5 server days, not device local)', () => {
    const now = new Date();
    const todayUtc = now.toISOString().slice(0, 10);
    const stats = computeStats([
      makeTrade({
        id: 1,
        entry_price: 100,
        exit_price: 101,
        size: 1,
        contract_size: 1,
        entry_at: `${todayUtc}T09:00:00`,
        exit_at: `${todayUtc}T10:00:00`,
      }),
    ]);
    expect(stats.todayPnl).toBe(1);
    expect(stats.weekPnl).toBe(1); // today is always in the current UTC week
    expect(stats.monthPnl).toBe(1);
  });

  it('keeps a previous-month trade out of the current week/month buckets', () => {
    const now = new Date();
    const prevMonth15th = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    const prevMonthStr = prevMonth15th.toISOString().slice(0, 10);
    const stats = computeStats([
      makeTrade({
        id: 1,
        entry_price: 100,
        exit_price: 101,
        size: 1,
        contract_size: 1,
        entry_at: `${prevMonthStr}T09:00:00`,
        exit_at: `${prevMonthStr}T10:00:00`,
      }),
    ]);
    expect(stats.monthPnl).toBe(0);
    expect(stats.weekPnl).toBe(0);
    expect(stats.allTimePnl).toBe(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/stats/computeStats.test.ts`
Expected: FAIL on the new cases when the device timezone is not UTC (on a UTC machine they pass — the regression is still pinned: reverting to local buckets would break them on non-UTC CI). If the machine is UTC, verify the failure by temporarily changing `localYmd` to slice `toISOString` — then restore. (Only do this if needed to confirm the test actually exercises the switch.)

- [ ] **Step 3: Implement UTC buckets in `computeStats.ts`**

Replace the `localYmd` / `getWeekStart` helpers and their comment (lines 75-93) with UTC variants:

```ts
// Stored dates are naive UTC ISO: manual "now" entries use toISOString() and
// imported CSV timestamps are kept verbatim in the export's UTC frame. So
// "today", week start and month must be derived in UTC too — matching MT5's
// server days and the dashboard calendars (getWeekDays/getMonthDays use
// Date.UTC). Deriving them in local time would shift trades into the wrong
// bucket for users outside UTC around midnight.
function utcYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function getWeekStartUtc(d: Date): string {
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - ((day + 6) % 7); // Monday as week start
  const monday = new Date(d);
  monday.setUTCDate(diff);
  return utcYmd(monday);
}
```

In `computeStats` (lines 96-99):

```ts
  const now = new Date();
  const todayStr = utcYmd(now);
  const weekStartStr = getWeekStartUtc(now);
  const monthStr = todayStr.slice(0, 7);
```

- [ ] **Step 4: Switch the dashboard default to UTC today**

In `app/(tabs)/index.tsx`, replace the `todayLocal` memo (lines 709-712) and rename it (its name is now honest):

```ts
  const todayUtc = useMemo(() => {
    return new Date().toISOString().split('T')[0]; // UTC today
  }, []);
```

Update all four usages and the effect dep array:
- line 714: `useState<string>(todayLocal)` → `useState<string>(todayUtc)`
- line 715: `useState<string>(todayLocal)` → `useState<string>(todayUtc)`
- line 778: `setSelectedDate(todayLocal)` → `setSelectedDate(todayUtc)`
- line 779: `setViewDate(todayLocal)` → `setViewDate(todayUtc)`
- line 781: `}, [period, todayLocal]);` → `}, [period, todayUtc]);`

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/stats/computeStats.test.ts` then `pnpm typecheck`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/stats/computeStats.ts src/stats/computeStats.test.ts "app/(tabs)/index.tsx"
git commit -m "fix: derive dashboard day/week/month buckets in UTC to match MT5 server days"
```

---

### Task 5: Prices display up to 6 decimals (no rounding, no padding)

**Files:**
- Modify: `src/lib/format.ts`
- Modify: `src/lib/format.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `formatPrice(value: number): string` → `Number(value.toFixed(6)).toString()`. Existing callers (`app/trade/[id].tsx` Entry/Exit Price, Stop Loss, Take Profit) need no changes.

- [ ] **Step 1: Update the failing test**

In `src/lib/format.test.ts`, replace the `formatPrice` describe block (lines 36-42):

```ts
describe('formatPrice', () => {
  it('shows up to 6 decimals without padding or extra rounding', () => {
    expect(formatPrice(157.536)).toBe('157.536');
    expect(formatPrice(1.35146)).toBe('1.35146');
    expect(formatPrice(1.23456)).toBe('1.23456');
    expect(formatPrice(1234.5)).toBe('1234.5');
    expect(formatPrice(100)).toBe('100');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — `formatPrice(157.536)` returns `157.54`, `formatPrice(1.23456)` returns `1.2346`.

- [ ] **Step 3: Implement**

In `src/lib/format.ts`, replace `formatPrice` (lines 26-30):

```ts
// Imported prices are stored to ≤6 decimals (csvParser.parsePrice); show them
// exactly as stored — no rounding down to 2/4 decimals and no zero-padding.
export function formatPrice(value: number): string {
  return Number(value.toFixed(6)).toString();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "fix: display prices up to 6 decimals instead of rounding to 2/4"
```

---

### Task 6: Investment follows the display unit

**Files:**
- Modify: `src/ui/TradeRow.tsx`
- Modify: `app/(tabs)/trades.tsx`

**Interfaces:**
- Consumes: `displayUnit: DisplayUnit` prop (already passed to `TradeRow`), `invested` USD value from `computeInvestedUsd` (already cent-scaled).
- Produces: no new exports — pure display change.

- [ ] **Step 1: Update `TradeRow` `Inv:` line**

In `src/ui/TradeRow.tsx`, replace lines 114-116:

```tsx
              <Text className="text-[12px] font-semibold ml-1.5" style={{ color: '#A8AEC1' }}>
                {displayUnit === 'usc'
                  ? `Inv: ${Math.round(invested * 100)} USC`
                  : `Inv: $${Math.round(invested)}`}
              </Text>
```

- [ ] **Step 2: Update the trades filter prefix**

In `app/(tabs)/trades.tsx`, in the "Investment (Size)" block (line 266), mirror the P&L row's prefix logic right below it (lines 270-278):

```tsx
          <RangeInput
            minVal={draft.sizeMin} maxVal={draft.sizeMax}
            onMinChange={v => set('sizeMin', v)} onMaxChange={v => set('sizeMax', v)}
            prefix={displayUnit === 'usc' ? '' : '$'}
          />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/TradeRow.tsx "app/(tabs)/trades.tsx"
git commit -m "fix: investment display follows the display unit"
```

---

### Task 7: Open-trade detail shows one blue "Open", no pill

**Files:**
- Modify: `app/trade/[id].tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no exports.

- [ ] **Step 1: Make the big "Open" blue**

In `app/trade/[id].tsx` line 122:

```tsx
          {isOpen ? (
            <Text className="text-4xl font-black text-[#4D9EFF] mb-6" style={{ textShadowColor: 'rgba(77,158,255,0.4)', textShadowRadius: 16 }}>Open</Text>
          ) : (
```

- [ ] **Step 2: Remove the redundant pill**

Delete the entire `isOpen` pill block (lines 134-140):

```tsx
          {isOpen && (
            <View className="px-4 py-1.5 rounded-full mt-2" style={{ backgroundColor: 'rgba(255,181,71,0.15)', borderWidth: 1, borderColor: 'rgba(255,181,71,0.3)' }}>
              <Text className="text-sm font-bold capitalize text-[#FFB547]">
                Open
              </Text>
            </View>
          )}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/trade/[id].tsx"
git commit -m "fix: open-trade detail shows a single blue Open indicator, drop the amber pill"
```

---

### Task 8: Trend chart polish — real labels, solid zero axis, single blue

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no exports.

- [ ] **Step 1: Fix `formatPnlShort`**

Replace lines 485-489:

```ts
// Y-axis labels must never collapse to "0"/"-0" for sub-unit ticks. Decimals
// scale with magnitude in the display unit; anything that rounds to exactly
// zero is shown as plain "0" (never "-0").
function formatPnlShort(v: number, displayUnit: DisplayUnit = 'usd'): string {
  const displayVal = displayUnit === 'usc' ? v * 100 : v;
  const rounded = Math.round(displayVal * 100) / 100;
  if (rounded === 0) return '0';
  const abs = Math.abs(rounded);
  if (abs >= 1000) return `${(rounded / 1000).toFixed(1)}k`;
  if (abs < 100) return rounded.toFixed(2);
  return `${Math.round(rounded)}`;
}
```

- [ ] **Step 2: Single blue identity**

Replace line 539 (`const finalPnl = points[n - 1].value;`) and line 540:

```ts
  // Single brand color for the whole series — no green/red split by final P&L.
  const primaryColor = '#4D9EFF';
```

(`finalPnl` was only used to pick the old two-tone color; removing it removes dead code.)

- [ ] **Step 3: Solid, visible zero axis**

Replace the zero-line block (lines 578-583) so it reads as a real x-axis boundary — solid, heavier, clearly distinct from the dashed gridlines:

```tsx
          {/* Solid zero (x-axis) reference — the boundary between up and down */}
          {isZeroVisible && (
            <Line
              x1={PAD_LEFT} y1={zeroY} x2={dim.w - PAD_RIGHT} y2={zeroY}
              stroke="#444b66" strokeWidth="2"
            />
          )}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "fix: trend chart — real y labels, solid zero axis, single blue identity"
```

---

### Task 9: Full gate, cleanup, manual verification

**Files:**
- None to commit (unless the gate finds issues).

- [ ] **Step 1: Run the full gate**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm test`
Expected: PASS — all suites, 80+ tests.

- [ ] **Step 2: Clean up session artifacts**

Run: `git status --porcelain`
The repo-root `01_01_2007-*.csv` files are user data — leave them. Delete the scratch verification scripts created during the forensic check (they are untracked session artifacts, not part of the repo):

```bash
git clean -n -f "_tmp_verify.js" "_tmp_verify2.js" "_tmp_verify3.js"
```

Then confirm that list contains exactly those three `_tmp_verify*.js` files and no user files, and run `git clean -f` on them.

- [ ] **Step 3: Manual verification (device)**

From the spec, confirm on a cents account with `01_01_2007-14_08_2026.csv`:
- Import: month P&L reads `-55.23 USC` (was `-55.25`); trade detail prices match the CSV exactly (e.g. `157.536`, `1.35146`); Entry/Exit dates show the CSV's UTC times unchanged; Notes are empty for imported trades.
- Re-import the same file: every row reports as skipped (ticket dedup, not notes).
- Import an open file, write a note on an open trade, then import the matching history file: the trade closes and the note survives; the ticket is still populated.
- Toggle display unit in Settings: `Inv:` on the trade row and the "Investment (Size)" filter prefix follow it.
- Open an open-trade detail page: single blue "Open", no amber pill.
- Dashboard with mixed wins/losses: y-axis shows real labels (no `0 0 0 0 0`, no `-0`), a solid zero line, and a single blue line/area.
- Restart the app once to confirm the migration ran cleanly on the existing DB.

- [ ] **Step 4: Report**

Summarize: which tasks passed the gate, any deviations, and the manual verification results. Do not claim manual items passed unless actually verified on device.

---

## Self-Review Notes

- **Spec coverage:** section 1 → Task 2 (plus Task 1's `csvRowToTradeDraft`); section 2 → Task 1; section 3 (import) → Task 1, (display) → Task 5; section 4 → Task 3; section 5 → Task 6; section 6 → Task 4; section 7 → Task 8; section 8 → Task 7; Testing + Manual → Task 9.
- **Placeholder scan:** every code step has the actual final code; every test has concrete inputs/asserts; no "TBD"/"add error handling"/"write tests" stubs.
- **Type consistency:** `normalizeImportedDateTime(value)` single-arg everywhere (Task 1 updates the only test call sites; Task 1/2's `database.ts` calls are already single-arg after the signature change). `Trade.ticket` / `TradeWithInstrument.ticket` added in Task 2; `insertTrade` param excludes `ticket` so `TradeDraft` (never gains the field) stays assignable. `csvRowToTradeDraft` returns `ticket: string | null`; `database.ts` uses the loop `ticket` var (non-null there) for SQL.
- **Rounding boundary:** `computeTradePnlInUsd` untouched; only `computeTradePnl` rounds. Existing test `toBeCloseTo(-0.0010155, 6)` was pinned to the old full-precision behavior and updated in Task 3, not left to fail.
