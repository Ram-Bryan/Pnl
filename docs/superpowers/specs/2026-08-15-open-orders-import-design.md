# Open Orders CSV Import — Design

**Date:** 2026-08-15
**Status:** Approved
**Related:** `2026-08-14-csv-import-design.md` (closed/history import), `2026-08-10-cent-account-precision-design.md`

## Goal

Make the CSV import handle both MT5 export formats from a single import flow, auto-detecting which one the user picked:

- **Closed / history** — the existing format (has `closing_time_utc`, `closing_price`, `swap`, `close_reason`). Imports closed trades.
- **Open positions** — a new format (only opening columns; has `original_position_size` instead of `lots`, no closing columns). Imports open trades (`status = 'open'`, entry fill only).

## Formats

Closed/history (already supported, unchanged in behavior):

```
ticket,opening_time_utc,closing_time_utc,type,lots,original_position_size,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,profit,equity,margin_level,close_reason
```

Open positions (new):

```
ticket,opening_time_utc,type,original_position_size,symbol,opening_price,commission
```

Key differences:

- Open format has **no** `closing_time_utc`, `closing_price`, `swap`, or `close_reason`.
- Open format sizes by `original_position_size`; the `lots` column is absent.

## Design

### 1. Row model & format detection — `src/lib/csvParser.ts`

`CsvTradeRow` gains `kind: 'open' | 'closed'`; closing fields become nullable:

```ts
type CsvTradeRow = {
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

**Detection** in `parseCsvRows`:

- Headers include `closing_time_utc` **and** `closing_price` → closed.
- Else headers include `opening_time_utc`, `opening_price`, `type`, and a size column (`lots` **or** `original_position_size`) → open.
- Otherwise → throw `Missing required column` (not a recognized MT5 export).

**Required columns per kind:**

| Column | Closed | Open |
|---|---|---|
| `ticket` | required | required |
| `opening_time_utc` | required | required |
| `type` | required | required |
| `symbol` | required | required |
| `opening_price` | required | required |
| size (`lots` or `original_position_size`) | required | required |
| `closing_time_utc` | required | — |
| `closing_price` | required | — |
| `commission` | required (defaults 0 if empty) | required (defaults 0 if empty) |
| `swap` | required | — |
| `close_reason` | required | — |

Size column resolution: use `lots` if present, else `original_position_size`.

**Row mapping:**

- `csvRowToTradeDraft`: open → `status: 'open'`, `exit_price: null`, `exit_at: null`, `exit_condition: null`, `fees = commission`; closed → unchanged (`fees = commission + swap`).
- `csvRowToFills`: open → single entry fill; closed → entry + exit fills.

Rows that fail per-kind validation (e.g. a closed row with an unparseable `closing_price`, or a non-buy/sell `type`) are skipped, matching today's behavior.

### 2. Import lifecycle — `src/db/database.ts` `importTradesFromCsv`

For each row, look up an existing trade by `notes = 'MT5 ticket: <ticket>'` (the same prefix is used for both kinds).

| Row kind | Existing trade | Action |
|---|---|---|
| closed | open | **Upgrade in place** — `updateTradeWithFills(db, id, closedDraft, [entry, exit])`. Sets closed status, exit price/at, fees (`commission + swap`), `close_reason` as `exit_condition`, replaces fills. Strategy/tags/notes/screenshots survive (separate tables keyed by `trade_id`). |
| closed | closed | Skip (already imported). |
| closed | none | Insert new closed trade. |
| open | any | Skip (idempotent re-import of the same open file). |
| open | none | Insert new open trade (entry fill only). |

Counters: `imported` (new trades), `updated` (open → closed upgrades), `skipped` (already present), `symbols` (new instruments), `warnCents` (unchanged; applies to both kinds). All work stays inside the existing `withTransactionAsync`.

### 3. Hook + UI — `src/hooks/useCsvImport.ts`, `src/ui/ImportConfirmModal.tsx`

- `ImportSummary` gains `kind: 'open' | 'closed'`.
- Confirm modal: "N open positions found" vs "N closed trades found" (symbols list unchanged).
- Result alert: report `X imported`, `Y updated (positions closed)`, `Z skipped` when non-zero.

### 4. Tests

- Parser: open-format sample parses with `kind: 'open'` and size from `original_position_size`; closed sample still parses as before; detection throws for an unrecognized header set; `csvRowToFills` open → 1 fill, closed → 2.
- Pure lifecycle decision extracted to `src/lib/importPlan.ts` so the insert/upgrade/skip rule is unit-testable (the DB layer has no Vitest harness in this repo). Cover all five rows of the table above.

## Out of scope

- Pending order (limit/stop) exports — these are not positions; not covered.
- Partial-fill aggregation differences between the open and closed reports — the closed export is authoritative for the final entry/exit; the upgrade replaces values wholesale.
- Any change to the manual add-trade flow.
