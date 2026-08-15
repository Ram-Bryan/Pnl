# Design: MT5 Import as Source of Truth, Cent-Exact P&L, Pro Chart

Date: 2026-08-15
Status: Approved (user reviewed design in conversation, then approved the written spec)

## Problem

Six issues reported by the user, verified in code:

1. **Import pollutes Notes.** `importTradesFromCsv` stores `MT5 ticket: <id>` in the
   `notes` column solely to dedup re-imports. Users who annotate imported trades get
   that junk mixed into their notes, and the dedup key is an implementation detail
   living in user-facing text.
2. **Prices are rounded for display.** `formatPrice` rounds values ≥ 100 to 2 decimals
   and everything else to 4, so a price stored as `157.536` can be shown as `157.54`.
   Users want prices displayed exactly as imported.
3. **CSV timestamps are shifted.** `normalizeImportedDateTime` converts the CSV's UTC
   wall-clock time to the device's local wall time, so the stored value is not what the
   CSV shows.
4. **Month P&L does not match MT5.** The app sums full-precision per-trade P&L
   (`-55.25 USC` on the August export); MT5 rounds each trade to the account's cent
   before summing (`-55.35 USC`). Forensic check: the app's formula reproduces MT5 to
   ≤ 0.005 USC on every EUR/GBP/JPY row; the remaining ~0.07 USC/month gap is on gold
   (XAU) where MT5 prices from internal deal fills that differ from the CSV's listed
   average prices and cannot be reproduced from position-level data.
5. **Investment ignores display unit.** `TradeRow` hardcodes `Inv: $<n>` regardless of
   the display unit; the computation itself (`computeInvestedUsd`) is correct.
6. **Trend chart is not pro.** When P&L crosses zero, the y-axis can render
   `0 0 0 0 0` (sub-cent values `Math.round` to 0 / `-0`), there is no clear zero
   (x-axis) reference line, and the area fill is a single flat color that doesn't
   read as up-vs-down.

An open-trade detail page also shows a redundant "Open" pill under the big "Open" text.

## Goals / Non-goals

Goals:
- CSV is the source of truth for import fields (ticket, timestamps, prices).
- Trade P&L rounds per trade to the account's cent before any summing (MT5-style).
- Investment follows the display unit.
- Trend chart has correct labels, a zero axis, and a single blue visual identity.
- Dashboard day/week/month buckets are consistent in UTC.
- Open-trade detail page shows one clear "Open" indicator (blue text, no pill).

Non-goals:
- Reproducing MT5's gold deal-fill rounding (impossible from position-level CSV).
- Importing the CSV's `profit` column — P&L stays always-computed (AGENTS.md).
- Changing manual-entry timestamps to UTC (they are already UTC for the default "now").
- Any change to the add-trade form behavior.

## Design

### 1. Ticket column replaces the notes hack

**Schema** (`src/db/schema.ts`): `Trade` gains `ticket: string | null`;
`TradeWithInstrument` (`src/stats/computeStats.ts`) gains `ticket: string | null`.

**Migration** (`src/db/database.ts` `initializeDatabase`): additive, same pattern as the
existing `trade_style` migration — check `pragma_table_info('trades')`, and if the
`ticket` column is missing:

```sql
ALTER TABLE trades ADD COLUMN ticket TEXT;
UPDATE trades SET ticket = substr(notes, 13)
  WHERE notes LIKE 'MT5 ticket: %';
```

`substr(notes, 13)` strips the 12-char `MT5 ticket: ` prefix, leaving the raw ticket.
The legacy notes text is **left in place** (users may have added their own text around
it); dedup simply stops reading it.

**Import** (`src/db/database.ts` `importTradesFromCsv`):
- Dedup lookup becomes `SELECT id, status FROM trades WHERE ticket = ? LIMIT 1` with
  `row.ticket.trim()` (no `MT5 ticket:` wrapper).
- Insert path writes `ticket` (new column) and `notes` stays `null` on import.
- `closeTradeFromImport` (upgrade path) keeps its partial UPDATE — it must also stop
  writing `notes`, so the user's notes survive the open→closed upgrade. It sets
  `ticket` (from the history row) on upgrade.

`csvRowToTradeDraft` (`src/lib/csvParser.ts`) drops `notes: 'MT5 ticket: ...'`
(`notes: null`) and carries `ticket: row.ticket.trim() || null`.

### 2. Verbatim timestamps

`normalizeImportedDateTime(value, isUtc = true)` in `src/lib/csvParser.ts` keeps the
format normalization (`2024.08.14 09:19:24` → `2024-08-14T09:19:24`) but **removes the
UTC→local conversion** — it returns the normalized string as-is, in the frame the CSV
provided (server/UTC wall clock). The `isUtc` parameter is no longer needed and is
removed (single call site today; nothing else imports it).

### 3. Price precision at import and display

**Import** (`src/lib/csvParser.ts`): prices are parsed then rounded to max 6 decimals
with trailing zeros trimmed, so the stored float round-trips cleanly:

```ts
const parsePrice = (raw: string): number | null => {
  const v = raw.trim();
  if (!v) return null;
  return Number(parseFloat(v).toFixed(6));
};
```

Applied to `opening_price`, `closing_price`, `stop_loss`, `take_profit` (not `lots`,
not commission/swap). `157.536` → `157.536`; `1.3514599999999999` → `1.35146`;
`1.1544200000000002` → `1.15442`; never `157.536000`.

**Display** (`src/lib/format.ts` `formatPrice`): show up to 6 decimals, no padding,
no extra rounding:

```ts
export function formatPrice(value: number): string {
  return Number(value.toFixed(6)).toString();
}
```

Affects the trade detail page (`app/trade/[id].tsx`) Entry/Exit price, Stop Loss,
Take Profit. No other call sites.

### 4. MT5-style per-trade cent rounding

`src/stats/computeStats.ts` `computeTradePnl` rounds the computed USD P&L to the
account's cent before returning:

```ts
// MT5 rounds each trade's realized profit to the account currency's cent before
// carrying it into totals. cents accounts display USC (2 decimals), so their USD
// value is quantized to 0.0001.
function roundPnlToAccountCent(pnlUsd: number, priceMode: 'standard' | 'cents'): number {
  const digits = priceMode === 'cents' ? 4 : 2;
  return Number(pnlUsd.toFixed(digits));
}
```

`computeTradePnlInUsd` (`src/stats/tradeMath.ts`) stays unrounded — the add-trade
preview keeps full precision; `computeTradePnl` is the single boundary where rounding
enters (used by stats, dashboard, trade detail, and `TradeRow`).

Net effect on the August export: `-55.249` → `-55.23 USC`, structurally matching MT5's
accounting. Gold trades retain MT5's internal deal-fill residual (accepted).

### 5. Investment follows the display unit

**`src/ui/TradeRow.tsx`**: the `Inv:` line formats with `displayUnit`:

- `usd` → `` `Inv: $${Math.round(invested)}` `` (unchanged look)
- `usc` → `` `Inv: ${Math.round(invested * 100)} USC` ``

`invested` stays the USD value from `computeInvestedUsd` (already cent-scaled).

**`app/(tabs)/trades.tsx`**: the "Investment (Size)" `RangeInput` `prefix` uses
`displayUnit === 'usc' ? '' : '$'` (mirroring the existing P&L filter row's prefix
logic at lines ~270-278).

### 6. UTC day buckets

**`src/stats/computeStats.ts`**: `todayStr`, `weekStartStr`, `monthStr` are derived from
UTC instead of local device time (replace `localYmd`/`getWeekStart` with UTC variants).
This aligns the stats buckets with MT5's UTC days and with the dashboard calendars
(`getWeekDays`/`getMonthDays` already use `Date.UTC`).

**`app/(tabs)/index.tsx`**: the `todayLocal` default for `selectedDate`/`viewDate`
switches to a UTC today string (it currently computes local YMD). Manual "now" entries
are already stored as UTC ISO (`useAddTrade` `toISOString().slice(0,19)`), so they land
in the same bucket.

Note: manually picked dates are stored as local wall-clock strings; under UTC buckets
they slice by their string date, which matches UTC during the day and can shift only
for picks within ~offset hours of local midnight — pre-existing behavior, out of scope.

### 7. Trend chart polish (`app/(tabs)/index.tsx`)

- **`formatPnlShort`**: never emit `0`/`-0` for sub-cent or sub-unit values. Show
  decimals proportional to magnitude in the display unit: 2 decimals when
  `|displayVal| < 100`, integer otherwise, `k` at ≥ 1000. Handle `-0` → `0`.
- **Zero axis**: when the y range spans 0, draw a solid, clearly visible horizontal
  line at `zeroY` (distinct stroke from the dashed gridlines) spanning the plot width
  — the x-axis marking the boundary between up and down.
- **Single blue identity**: line and area gradient use blue (`#4D9EFF` family) instead
  of the current green/red-by-final-PnL coloring. (User: "not bi color: blue".)
- The `0` value continues to be a y-tick whenever the range crosses 0 (already true via
  `getNiceTicks` step multiples).

### 8. Open-trade detail page (`app/trade/[id].tsx`)

- Remove the "Open" pill block (lines ~134-140).
- The big "Open" text at P&L level becomes blue (`text-[#4D9EFF]`-style) instead of
  amber, keeping the existing glow shadow.

## Data / state

- One additive DB migration (`trades.ticket`), idempotent on fresh installs, backfills
  legacy imported tickets from notes.
- No stored P&L anywhere (unchanged invariant).

## Error handling

- No new error paths. The migration uses the same additive pattern as existing
  migrations (no-op when the column exists).
- `computeTradePnl` rounding never throws; values remain finite by construction.

## Testing

- `src/lib/csvParser.test.ts`:
  - open/closed detection unchanged; new assertions: verbatim timestamp round-trip,
    no `MT5 ticket:` note in `csvRowToTradeDraft`, price precision (`1.3514599999999999`
    → `1.35146`, `157.536` → `157.536`).
- `src/lib/format.test.ts`: `formatPrice` shows up to 6 decimals without padding.
- `src/stats/computeStats.test.ts`: per-trade cent rounding (cents → 4-decimal USD,
  standard → 2-decimal USD); UTC day buckets (today/week/month boundaries).
- Full gate: `pnpm typecheck` + `pnpm test` (80+ tests).
- No SQLite unit-test harness exists in this repo, so ticket-based dedup and the
  notes-preserving open→closed upgrade are verified in Manual verification below.

## Manual verification

- Import `01_01_2007-14_08_2026.csv` on a cents account: month P&L reads `-55.23 USC`
  (was `-55.25`); prices in trade detail match the CSV (e.g. `157.536`, `1.35146`);
  Entry/Exit dates show the CSV's UTC times unchanged; Notes are empty for imported
  trades; re-import reports all as skipped.
- Re-import an open file then its history file: the trade closes and user-set notes on
  the open trade survive.
- Re-import `01_01_2007-14_08_2026.csv` a second time: every row reports as skipped
  (ticket dedup on the new column, not notes).
- Toggle display unit in Settings: `Inv:` and the "Investment (Size)" filter follow it.
- Open a trade detail page: single blue "Open", no pill.
- Dashboard with a mix of wins/losses: y-axis shows real labels (no `0 0 0 0 0`, no
  `-0`), a solid zero line, and a blue line/area.
