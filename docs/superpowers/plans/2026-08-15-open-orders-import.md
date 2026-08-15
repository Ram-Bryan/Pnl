# Open Orders CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the single CSV import flow auto-detect and import both MT5 closed/history exports and MT5 open-positions exports, upgrading already-imported open trades to closed when their history row arrives.

**Architecture:** `parseCsvRows` (in `src/lib/csvParser.ts`) auto-detects the file kind from headers and tags each row with `kind: 'open' | 'closed'`. A new pure `src/lib/importPlan.ts` decides per-row `insert | upgrade | skip`. `importTradesFromCsv` (`src/db/database.ts`) executes that decision inside its existing transaction, using a new targeted `closeTradeFromImport` helper for upgrades so user-set strategy/emotion/notes/reflection are preserved. `useCsvImport`/`ImportConfirmModal` surface kind and the updated count.

**Tech Stack:** TypeScript strict, expo-sqlite, Vitest (pure-logic layers only — the DB layer has no test harness).

## Global Constraints

- No new dependencies. All changes stay in existing modules plus one new pure module.
- The notes dedup key must remain exactly `MT5 ticket: <ticket>` for **both** kinds (the upgrade path relies on it).
- `importTradesFromCsv` must do all its work inside a single `withTransactionAsync` (never nest a second transaction).
- Open trades are `status: 'open'` with `exit_price = NULL`, `exit_at = NULL`, and a single entry fill — this matches the existing schema and stats (`computeStats`/`strategyStats` already filter closed-only by `status === 'closed' && exit_price != null`).
- Fees are stored as they arrive in the report (cents accounts store USC, standard store USD); do not rescale or reinterpret `commission`/`swap` here.
- Do not mix formatting-only changes into functional diffs.
- Verification commands: `pnpm typecheck` and `pnpm test` must both pass.

---

### Task 1: Pure import-action planner

**Files:**
- Create: `src/lib/importPlan.ts`
- Test: `src/lib/importPlan.test.ts`

**Interfaces:**
- Produces:
  - `type ExistingTradeState = 'none' | 'open' | 'closed'`
  - `type ImportAction = 'insert' | 'upgrade' | 'skip'`
  - `function planImportAction(existing: ExistingTradeState, rowKind: 'open' | 'closed'): ImportAction`
- Consumes: nothing (row kind passed as a plain string to stay decoupled).

Rules (from the approved spec, table):

| Row kind | Existing | Action |
|---|---|---|
| open | none | insert |
| open | open | skip |
| open | closed | skip |
| closed | none | insert |
| closed | open | upgrade |
| closed | closed | skip |

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { planImportAction } from './importPlan';

describe('planImportAction', () => {
  it('inserts open rows only when nothing exists yet', () => {
    expect(planImportAction('none', 'open')).toBe('insert');
    expect(planImportAction('open', 'open')).toBe('skip');
    expect(planImportAction('closed', 'open')).toBe('skip');
  });

  it('upgrades an open trade when its closed/history row arrives', () => {
    expect(planImportAction('open', 'closed')).toBe('upgrade');
  });

  it('skips closed rows already imported as closed', () => {
    expect(planImportAction('closed', 'closed')).toBe('skip');
  });

  it('inserts closed rows with no existing trade', () => {
    expect(planImportAction('none', 'closed')).toBe('insert');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/importPlan.test.ts`
Expected: FAIL — `Failed to resolve import "./importPlan"`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type ExistingTradeState = 'none' | 'open' | 'closed';

export type ImportAction = 'insert' | 'upgrade' | 'skip';

export function planImportAction(existing: ExistingTradeState, rowKind: 'open' | 'closed'): ImportAction {
  if (rowKind === 'open') {
    // Re-importing the same open-positions file must not duplicate positions.
    return existing === 'none' ? 'insert' : 'skip';
  }
  switch (existing) {
    case 'open':
      return 'upgrade';
    case 'closed':
      return 'skip';
    case 'none':
      return 'insert';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/importPlan.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/importPlan.ts src/lib/importPlan.test.ts
git commit -m "feat(import): pure open/closed import-action planner"
```

---

### Task 2: Parser format detection and open-trade mapping

**Files:**
- Modify: `src/lib/csvParser.ts`
- Test: `src/lib/csvParser.test.ts`

**Interfaces:**
- Produces:
  - `type CsvTradeRow` now has `kind: 'open' | 'closed'`, `closing_time_utc: string | null`, `closing_price: number | null`, `swap: number | null`, `close_reason: string | null` (all other fields unchanged).
  - `parseCsvRows(csv: string): CsvTradeRow[]` — unchanged signature, new behavior (detects kind; open rows may be sized by `original_position_size`).
  - `csvRowToTradeDraft(row, accountId, instrumentId): TradeDraft` — open rows yield `status: 'open'` and null exit fields.
  - `csvRowToFills(row): FillRow[]` — open rows yield exactly one entry fill.
- Consumes: nothing new.
- Note: this Task deliberately breaks nothing for closed files; the existing `SAMPLE_CSV` tests must keep passing.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/csvParser.test.ts` (keep the existing `SAMPLE_CSV` constant and all existing tests unchanged):

```ts
const OPEN_SAMPLE = `ticket,opening_time_utc,type,original_position_size,symbol,opening_price,commission
422398499,2026-08-14T15:00:34,sell,0.01,XAUUSDc,4383.649,
422399028,2026-08-14T14:53:09,sell,0.01,XAUUSDc,4382.318,`;

describe('open-positions format', () => {
  it('parses an open-positions export as open trades', () => {
    const rows = parseCsvRows(OPEN_SAMPLE);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe('open');
    expect(rows[0].lots).toBe(0.01); // sized by original_position_size
    expect(rows[0].symbol).toBe('XAUUSDc');
    expect(rows[0].closing_price).toBeNull();
    expect(rows[0].closing_time_utc).toBeNull();
    expect(rows[0].swap).toBeNull();
    expect(rows[0].close_reason).toBeNull();
    expect(rows[0].commission).toBe(0);
  });

  it('maps an open row to an open trade draft', () => {
    const draft = csvRowToTradeDraft(parseCsvRows(OPEN_SAMPLE)[0], 1, 9);
    expect(draft.status).toBe('open');
    expect(draft.direction).toBe('short');
    expect(draft.entry_price).toBe(4383.649);
    expect(draft.exit_price).toBeNull();
    expect(draft.exit_at).toBeNull();
    expect(draft.fees).toBe(0);
    expect(draft.notes).toBe('MT5 ticket: 422398499');
  });

  it('creates a single entry fill for an open trade', () => {
    const fills = csvRowToFills(parseCsvRows(OPEN_SAMPLE)[0]);
    expect(fills).toHaveLength(1);
    expect(fills[0].side).toBe('entry');
    expect(fills[0].price).toBe(4383.649);
  });

  it('still marks the history export as closed', () => {
    expect(parseCsvRows(SAMPLE_CSV)[0].kind).toBe('closed');
  });

  it('throws for an unrecognized header set', () => {
    expect(() => parseCsvRows('foo,bar\n1,2')).toThrow('Missing required column');
  });
});
```

Note: `csvRowToTradeDraft` is not currently imported in the test file — add it to the import at the top:

```ts
import { parseCsvRows, resolveInstrument, csvRowToFills, csvRowToTradeDraft, normalizeImportedDateTime, defaultContractSizeFor } from './csvParser';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/csvParser.test.ts`
Expected: FAIL — existing tests still pass; the new `open-positions format` describe block fails (type errors / wrong shape).

- [ ] **Step 3: Implement format detection and mapping**

In `src/lib/csvParser.ts`:

Replace the `CsvTradeRow` type:

```ts
export type CsvTradeRow = {
  kind: 'open' | 'closed';
  ticket: string;
  opening_time_utc: string;
  closing_time_utc: string | null;
  type: 'buy' | 'sell';
  lots: number;
  symbol: string;
  opening_price: number;
  closing_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  commission: number;
  swap: number | null;
  close_reason: string | null;
};
```

Replace `parseCsvRows` with:

```ts
export function parseCsvRows(csv: string): CsvTradeRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const sizeCol = headers.includes('lots') ? 'lots' : 'original_position_size';

  // Auto-detect which MT5 export this is: a history report has closing
  // columns; an open-positions report has only opening columns.
  const isClosed = headers.includes('closing_time_utc') && headers.includes('closing_price');
  const isOpen =
    !isClosed &&
    headers.includes('opening_time_utc') &&
    headers.includes('opening_price') &&
    headers.includes('type') &&
    headers.includes('symbol') &&
    headers.includes(sizeCol);
  if (!isClosed && !isOpen) {
    throw new Error('Missing required column');
  }
  const kind = isClosed ? 'closed' : 'open';

  const required = isClosed
    ? ['ticket', 'opening_time_utc', 'closing_time_utc', 'type', sizeCol,
       'symbol', 'opening_price', 'closing_price', 'commission', 'swap', 'close_reason']
    : ['ticket', 'opening_time_utc', 'type', sizeCol, 'symbol', 'opening_price', 'commission'];
  for (const col of required) {
    if (!headers.includes(col)) {
      throw new Error(`Missing required column: ${col}`);
    }
  }

  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const rows: CsvTradeRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = parseCsvLine(line);
    if (cells.length < headers.length) continue;

    const get = (key: string): string => (cells[idx[key]] ?? '').trim();
    const getNum = (key: string): number => {
      const v = get(key);
      return v ? parseFloat(v) : 0;
    };
    const getNumOrNull = (key: string): number | null => {
      const v = get(key);
      return v ? parseFloat(v) : null;
    };

    const type = get('type').toLowerCase();
    if (type !== 'buy' && type !== 'sell') continue;

    const closingPrice = isClosed ? getNumOrNull('closing_price') : null;
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
      opening_price: getNum('opening_price'),
      closing_price: closingPrice,
      stop_loss: getNumOrNull('stop_loss'),
      take_profit: getNumOrNull('take_profit'),
      commission: getNum('commission'),
      swap: isClosed ? getNum('swap') : null,
      close_reason: isClosed ? get('close_reason') : null,
    });
  }

  return rows;
}
```

Update `csvRowToTradeDraft` — replace the `status`, `exit_price`, `exit_at`, `fees`, `exit_condition` lines:

```ts
    status: (row.kind === 'open' ? 'open' : 'closed') as 'open' | 'closed',
    entry_price: row.opening_price,
    exit_price: row.closing_price,
    size: row.lots,
    stop_loss: row.stop_loss,
    take_profit: row.take_profit,
    entry_at: row.opening_time_utc,
    exit_at: row.closing_time_utc,
    fees: row.commission + (row.swap ?? 0),
    exit_condition: row.close_reason || null,
```

Update `csvRowToFills`:

```ts
export function csvRowToFills(row: CsvTradeRow): FillRow[] {
  const fills: FillRow[] = [
    {
      side: 'entry',
      price: row.opening_price,
      quantity: row.lots,
      note: null,
      occurred_at: row.opening_time_utc,
    },
  ];
  // Open positions have no exit yet.
  if (row.kind === 'closed' && row.closing_price != null && row.closing_time_utc) {
    fills.push({
      side: 'exit',
      price: row.closing_price,
      quantity: row.lots,
      note: null,
      occurred_at: row.closing_time_utc,
    });
  }
  return fills;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/csvParser.test.ts`
Expected: PASS — all pre-existing tests plus the 5 new open-format tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/csvParser.ts src/lib/csvParser.test.ts
git commit -m "feat(import): auto-detect open vs closed MT5 exports"
```

---

### Task 3: Import lifecycle — open insert, closed upgrade, skip

**Files:**
- Modify: `src/db/database.ts`
- No new tests (the DB layer has no Vitest harness; the decision logic is covered by Task 1, the row mapping by Task 2).

**Interfaces:**
- Consumes:
  - `planImportAction` from `../lib/importPlan`
  - `CsvTradeRow` from `../lib/csvParser` (already imported; now carries `kind`)
  - `TradeStatus` from `./schema` (already imported)
- Produces:
  - `importTradesFromCsv(db, rows, accountId)` return type changes to:
    `Promise<{ imported: number; updated: number; symbols: number; skipped: number; warnCents: boolean }>`
  - Module-private `closeTradeFromImport(db, tradeId, update, fills)` helper.

Preservation requirement (why NOT `updateTradeWithFills`): a CSV-derived draft has `strategy_id`, `emotion_id`, `trade_style`, `entry_condition`, `followed_rules`, `reflection` all `null`. Passing that full draft to `updateTradeWithFills` → `updateTrade` would NULL those columns and wipe whatever the user set on the open trade (strategy, emotion, notes, reflection). So the upgrade path must update **only** the columns the report knows and then replace fills, leaving associations and user text untouched. `trade_tags`, `trade_rule_checks`, and `trade_screenshots` are separate tables keyed by `trade_id` and survive automatically.

- [ ] **Step 1: Add the import + helper + rewrite the function**

Add to the imports in `src/db/database.ts` (top of file, alongside the existing `csvParser` import):

```ts
import { planImportAction } from '../lib/importPlan';
```

Add this helper immediately above `importTradesFromCsv` (it calls the module-private `replaceFills`):

```ts
type ImportCloseUpdate = {
  status: 'closed';
  entry_price: number;
  exit_price: number;
  size: number;
  stop_loss: number | null;
  take_profit: number | null;
  entry_at: string;
  exit_at: string;
  fees: number;
  exit_condition: string | null;
  notes: string | null;
};

// Upgrades an imported open trade to closed using only the columns an MT5
// history row knows about, so strategy/emotion/notes/reflection the user set
// on the open trade are preserved. Must be called inside an open transaction.
async function closeTradeFromImport(
  db: SQLiteDatabase,
  tradeId: number,
  update: ImportCloseUpdate,
  fills: FillRow[],
): Promise<void> {
  await db.runAsync(
    `UPDATE trades SET
       status = ?, entry_price = ?, exit_price = ?, size = ?,
       stop_loss = ?, take_profit = ?, entry_at = ?, exit_at = ?,
       fees = ?, exit_condition = ?, notes = ?,
       updated_at = datetime('now')
     WHERE id = ?`,
    [update.status, update.entry_price, update.exit_price, update.size,
     update.stop_loss, update.take_profit, update.entry_at, update.exit_at,
     update.fees, update.exit_condition, update.notes, tradeId],
  );
  await replaceFills(db, tradeId, fills);
}
```

Replace the body of `importTradesFromCsv` (the signature and return type change too):

```ts
export async function importTradesFromCsv(
  db: SQLiteDatabase,
  rows: CsvTradeRow[],
  accountId: number,
): Promise<{ imported: number; updated: number; symbols: number; skipped: number; warnCents: boolean }> {
  let imported = 0;
  let updated = 0;
  let symbols = 0;
  let skipped = 0;
  let warnCents = false;

  await db.withTransactionAsync(async () => {
    const account = await getFirstAccount(db);
    const accountIsCents = account?.price_mode === 'cents';

    for (const row of rows) {
      const draft = resolveInstrument(row.symbol);

      // Idempotency: re-importing an MT5 report must not duplicate trades.
      // The ticket is stored in notes as "MT5 ticket: <ticket>" for both open
      // and closed imports; statements inside this transaction see earlier
      // inserts, so a ticket repeated in one file is naturally skipped too.
      const ticket = row.ticket.trim();
      const existing = ticket
        ? await db.getFirstAsync<{ id: number; status: TradeStatus }>(
            'SELECT id, status FROM trades WHERE notes = ? LIMIT 1',
            [`MT5 ticket: ${ticket}`],
          )
        : null;

      const action = planImportAction(existing ? existing.status : 'none', row.kind);
      if (action === 'skip') {
        skipped++;
        continue;
      }

      // A cents-account report (symbols ending in "c") is only priced right if
      // the account is set to Cents in Settings; the account price_mode drives
      // P&L math, so surface a warning instead of silently being 100x off.
      if (draft.price_mode === 'cents' && !accountIsCents) warnCents = true;

      let instrument = await db.getFirstAsync<{ id: number; contract_size: number }>(
        'SELECT id, contract_size FROM instruments WHERE symbol = ? AND asset_class = ?',
        [draft.symbol, draft.asset_class],
      );
      if (!instrument) {
        const result = await db.runAsync(
          `INSERT INTO instruments (symbol, name, asset_class, quote_currency, price_mode, contract_size, tick_size)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [draft.symbol, draft.name, draft.asset_class, draft.quote_currency, draft.price_mode, draft.contract_size, draft.tick_size],
        );
        instrument = { id: result.lastInsertRowId, contract_size: draft.contract_size };
        symbols++;
      } else if (instrument.contract_size === 1 && draft.contract_size !== 1) {
        // Earlier imports defaulted every symbol to contract_size 1, silently
        // corrupting forex/gold P&L. P&L reads contract_size at render time, so
        // repairing the instrument retroactively fixes its existing trades.
        await db.runAsync(
          'UPDATE instruments SET contract_size = ? WHERE id = ?',
          [draft.contract_size, instrument.id],
        );
        instrument = { ...instrument, contract_size: draft.contract_size };
      }

      const td = csvRowToTradeDraft(row, accountId, instrument.id);
      const fills = csvRowToFills(row);

      if (action === 'upgrade' && existing) {
        // The open position finally closed; fill in its exit data on the same
        // record instead of inserting a duplicate or leaving it open forever.
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
          notes: td.notes,
        }, fills);
        updated++;
        continue;
      }

      const tradeResult = await db.runAsync(
        `INSERT INTO trades
          (account_id, instrument_id, strategy_id, emotion_id,
           trade_style, entry_condition, exit_condition,
           direction, status, entry_price, exit_price, size,
           stop_loss, take_profit, entry_at, exit_at,
           fees, followed_rules, notes, reflection)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
        ],
      );
      const tradeId = tradeResult.lastInsertRowId;

      for (let i = 0; i < fills.length; i++) {
        const f = fills[i];
        await db.runAsync(
          `INSERT INTO trade_fills (trade_id, side, price, quantity, note, occurred_at, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [tradeId, f.side, f.price, f.quantity, f.note, f.occurred_at, i],
        );
      }

      imported++;
    }
  });

  return { imported, updated, symbols, skipped, warnCents };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors; `useCsvImport` in the next Task is not yet updated, but it only reads `imported`/`symbols`/`skipped`/`warnCents`, and the extra `updated` field does not break it).

- [ ] **Step 3: Run the pure-logic tests**

Run: `pnpm test`
Expected: PASS — all 9 files, 71 tests (unchanged; DB behavior is verified by typecheck + the Task 1/2 unit coverage).

- [ ] **Step 4: Commit**

```bash
git add src/db/database.ts
git commit -m "feat(import): insert open trades, upgrade them when history arrives"
```

---

### Task 4: Import summary and result messaging

**Files:**
- Modify: `src/hooks/useCsvImport.ts`
- Modify: `src/ui/ImportConfirmModal.tsx`

**Interfaces:**
- Consumes:
  - `importTradesFromCsv` result now includes `updated: number` (Task 3).
  - `ImportSummary` type (this Task extends it).
- Produces:
  - `type ImportSummary = { count: number; symbols: string[]; kind: 'open' | 'closed' }`
- Consumes consumers of `ImportSummary`: only `useCsvImport` (constructs it) and `ImportConfirmModal` (renders it).

- [ ] **Step 1: Extend the summary type and messages**

In `src/hooks/useCsvImport.ts`:

```ts
export type ImportSummary = {
  count: number;
  symbols: string[];
  kind: 'open' | 'closed';
};
```

In `pickFile`, after `const rows = parseCsvRows(csvText);`:

```ts
      setSummary({ count: rows.length, symbols: [...new Set(rows.map(r => r.symbol))], kind: rows[0].kind });
```

In `confirmImport`, replace the success block:

```ts
      const result = await importTradesFromCsv(db, rows, account.id);
      setPendingCsv(null);
      await onImported?.();
      const parts = [`${result.imported} trades imported`];
      if (result.updated > 0) {
        parts.push(`${result.updated} open position${result.updated === 1 ? '' : 's'} closed`);
      }
      if (result.skipped > 0) {
        parts.push(`${result.skipped} already present (skipped)`);
      }
      const centsNote = result.warnCents
        ? '\n\nNote: your report uses cents symbols (e.g. XAUUSDc). Set Account Type to Cents in Settings so P&L is priced correctly.'
        : '';
      showSuccess({
        title: 'Import Complete',
        message: parts.join('. ') + centsNote,
      });
```

- [ ] **Step 2: Update the confirm modal wording**

In `src/ui/ImportConfirmModal.tsx`, replace line 29 (`{summary.count} trades found`):

```tsx
          {summary.kind === 'open'
            ? `${summary.count} open position${summary.count === 1 ? '' : 's'} found`
            : `${summary.count} closed trade${summary.count === 1 ? '' : 's'} found`}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: PASS — 9 files, 71 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCsvImport.ts src/ui/ImportConfirmModal.tsx
git commit -m "feat(import): report open vs closed files and closed-position upgrades"
```

---

### Task 5: Final verification

**Files:**
- None (verification only).

- [ ] **Step 1: Full suite + typecheck**

Run: `pnpm typecheck` and `pnpm test`
Expected: typecheck clean; 9 test files / 71+ tests passing (Task 2 added 5, Task 1 added 4 → 80 total).

- [ ] **Step 2: Working tree clean**

Run: `git status --short`
Expected: empty output (all work committed task-by-task).

- [ ] **Step 3: Manual smoke checklist (device/emulator)**

Import the closed `01_01_2007-14_08_2026.csv` — still imports closed trades, `skipped` counts duplicates. Then import a saved open-positions file — open trades appear as **Open** in the Trades list with an entry fill only; re-importing the same open file shows them all as skipped. After a position closes, import its history file — that trade's status flips to Closed with the final P&L and the alert reports "N open positions closed".
