# Display-Unit Toggle — Design Spec

Date: 2026-08-11
Status: Approved for implementation

## 1. Problem

Toggling the "Cents Account" setting in Settings currently does two things at once:
it changes how P&L is **sized** (`computeTradePnl`/`computeStats` re-scale the
position 100× and fees by 0.01) *and* how it is **displayed** (`formatPnl`
scales the result ×100 into USC). The result the user rejects:

- `0.10 USC` toggles to `$0.10` — the number stays the same, only the unit
  label swaps. The USD amount is the same size as the USC amount.

MT5 semantics: a `0.01` lot on a **cent account** is a 100× smaller position.
`-0.10 USC` is **`-$0.001`** in real USD. Toggling the display unit must convert
`-0.10 USC ↔ -$0.001` (÷100), never recompute the position size.

### Concrete symptom (user-reported)

USDJPY, short 157.536 → 157.552, `0.01` lot, cent account, `100000` contract:
MT5 reports `-0.10 USC` (= `-$0.001`). The app's toggle shows `0.10 USC ↔ $0.10`,
which is a display-unit relabel, not a conversion.

## 2. Approach (chosen)

Split the single "account type" concept into **two independent facts**:

1. **Account type** (`standard | cents`) — a *fact about the brokerage account*.
   Determines **sizing** (lot scaling ×0.01, fee scaling ×0.01) at compute time.
   Persisted on the `accounts` table (`price_mode` column), because all trades on
   an account share the same account type. Set once; rarely changes.
2. **Display unit** (`usd | usc`) — a *view preference*. Pure formatting:
   USC = USD × 100. Persisted in the `settings` table (`displayUnit` key).
   Default follows the account type; independently toggleable afterward.

This satisfies the user-confirmed behavior: the toggle changes the **display
unit only** (`-0.10 USC ↔ -$0.001`, ÷100), while the canonical P&L (real USD,
sized by the trade's actual account) stays fixed.

Rejected alternatives:
- Keep the global toggle feeding computation (the current model) — that is
  exactly the sizing recompute the user rejected.
- Per-instrument `price_mode` (on `instruments`) — every instrument is
  hardcoded `'standard'` today (`app/(tabs)/symbols.tsx:124`), so trades could
  never be sized as cents; also the account type is an account property, not a
  per-symbol one.

## 3. Design

### 3.1 Data layer — `accounts.price_mode`

- `schema.sql`: add `price_mode TEXT NOT NULL CHECK (price_mode IN ('standard','cents')) DEFAULT 'standard'` to `accounts`.
- `src/db/database.ts` migration (additive, idempotent):
  - `ALTER TABLE accounts ADD COLUMN price_mode ...` when the column is missing.
  - Copy the legacy `settings` key `accountType` (if present) into the seeded
    account's `price_mode` so existing cent-account trades keep correct sizing;
    then delete the legacy key.
- New DB functions:
  - `getFirstAccount(db): Account` — returns the single seeded account (the app
    has one account, `account_id` is always its id; see `useAddTrade.ts:300`).
  - `updateAccountPriceMode(db, id, mode): Promise<void>`.
- Trade queries now source `price_mode` from **accounts**, not instruments:
  - `src/hooks/useDashboard.ts:43` — `a.price_mode AS price_mode`
  - `src/hooks/useTrades.ts:21` — `a.price_mode AS price_mode`
  - `src/db/database.ts` `getTradeById` — `a.price_mode AS price_mode`
  - Each adds `JOIN accounts a ON a.id = t.account_id`.
- `TradeWithInstrument.price_mode` keeps its name/type; it now carries the
  trade's **account** mode. Instrument `price_mode` becomes fully unused (the
  column stays in the schema; the Symbols screen is untouched).

### 3.2 Computation — sizing is per-trade, fixed

`src/stats/computeStats.ts`:
- `computeTradePnl(trade)` — **drop the `accountType` parameter**; use
  `trade.price_mode` internally (delegating to `computeTradePnlInUsd`).
- `computeStats(trades)` — **drop the `accountType` parameter**; every internal
  `computeTradePnl` call sizes from each trade's own `price_mode`.

`src/stats/tradeMath.ts` — unchanged. The low-level pure functions still take an
explicit `accountType` (sizing); they are now fed `trade.price_mode` at the seam.

Result: canonical P&L is always real USD sized by the trade's actual account.
Toggling the view cannot recompute sizing, by construction.

### 3.3 Display formatting — `formatPnl(value, displayUnit)`

`src/lib/format.ts`:
- New type `DisplayUnit = 'usd' | 'usc'`.
- `formatPnl(value, displayUnit: DisplayUnit = 'usd')` — `value` is always real
  USD. USC display = `value × 100`, suffix `USC`. USD display = `$` prefix.
- **Precision rule** (new — required by the confirmed behavior): enough decimals
  to render sub-cent USD amounts.
  - `|v| ≥ 0.01` → 2 decimals (`$12.34`, `0.10 USC`).
  - `0.001 ≤ |v| < 0.01` → 3 decimals (`$0.001`).
  - `|v| < 0.001` → 4 decimals (`$0.0001`).
  - `k`-abbreviation at `1000` unchanged (`$1.4k`, `1.4k USC`).
  - Sign handled by callers (color), formatter keeps returning the absolute
    value, as today.
- Verified examples:
  - `formatPnl(-0.0010155, 'usd')` → `$0.001` (was `$0.00`).
  - `formatPnl(-0.0010155, 'usc')` → `0.10 USC` (unchanged).
- `formatMoney`, `formatPrice`, `capitalize` unchanged.

### 3.4 Settings — two controls

`src/hooks/SettingsContext.tsx` now exposes both facts:

```ts
type SettingsContextValue = {
  accountType: AccountType;              // from accounts.price_mode — sizing
  displayUnit: DisplayUnit;              // from settings 'displayUnit' — view
  loading: boolean;
  setAccountType: (v: AccountType) => Promise<void>;  // persists to accounts
  setDisplayUnit: (v: DisplayUnit) => Promise<void>;  // persists to settings
};
```

- On load: read `getFirstAccount` + `getAllSettings`; `displayUnit` defaults to
  the account type's mapping (`cents → usc`, `standard → usd`) unless the
  `displayUnit` setting is present.
- `setAccountType`: `updateAccountPriceMode` + re-sync display default (change
  account type, display follows unless the user has since set `displayUnit`
  explicitly — see note below).
- `setDisplayUnit`: `setSetting('displayUnit', value)` + state.

`app/(tabs)/settings.tsx`:
- **Account type** control (Standard/Cents segmented) → `setAccountType`.
  Helper copy: "Cent accounts size positions 100× smaller (MT5 cent-account
  sizing). Prices and fees are entered as real values."
- **Display unit** switch (existing toggle, retitled) → `setDisplayUnit`.
  Helper copy: "Display P&L in USC instead of USD. This changes the display
  unit only — calculations are unaffected."

Note on sync: the simplest correct behavior is that changing the account type
also updates the display default (so a newly-declared cents account shows USC).
If the user has already set `displayUnit` explicitly, keep the explicit choice.
(Implementation detail left to the plan; the observable rule is "display
defaults to account type until the user toggles display".)

### 3.5 Call sites (format only — never sizing)

Every P&L *display* now takes `displayUnit` from context; every *computation*
takes no account argument (per-trade sizing):

| File | Change |
|---|---|
| `src/ui/PnlText.tsx` | prop `accountType` → `displayUnit` |
| `src/ui/TradeRow.tsx` | `computeTradePnl(trade)` (no arg); `computeInvestedUsd` uses `trade.price_mode`; `formatPnl(pnl, displayUnit)` |
| `app/(tabs)/index.tsx` | `computeTradePnl(t)` in `dailyPnls`, `chartPoints`, `selectedPnl` (drop arg); `formatPnlShort`, hero, calendars, trendline use `displayUnit` |
| `app/(tabs)/trades.tsx` | `computeTradePnl(t)` (no arg); P&L filter compares typed value in display unit (`displayUnit === 'usc' ? ×0.01 : ×1`); label/prefix follow `displayUnit` |
| `app/trade/[id].tsx` | `computeTradePnl(trade)` (no arg); `PnlText` uses `displayUnit` |
| `app/add-trade.tsx` | preview sizes from `accountType` (the account fact), formats with `displayUnit` |
| `src/hooks/useDashboard.ts` | `computeStats(trades)` (no arg); still surfaces `displayUnit` from context |

### 3.6 Tests

- `src/lib/format.test.ts`:
  - sub-cent standard USD now `$0.001` (was `$0.00`);
  - `formatPnl(-0.0010155, 'usd')` → `$0.001`; `formatPnl(-0.0010155, 'usc')` → `0.10 USC`;
  - existing `k` and 2-decimal cases unchanged.
- `src/stats/computeStats.test.ts`:
  - per-trade tests set `price_mode: 'cents'` on the trade instead of passing a
    2nd argument;
  - the "toggling converts every P&L display unit" test now asserts the **same**
    canonical P&L (`≈ -0.0010155` USD) renders `0.10 USC` ↔ `$0.001`;
  - `computeTradePnl(trade)`/`computeStats(trades)` calls drop the arg.
- The 4 MT5 cent-account regression cases in `src/stats/tradeMath.test.ts`
  stay (they test `computeTradePnlInUsd` directly with explicit sizing).

## 4. Scope & notes

- **No P&L storage.** P&L stays always-computed (AGENTS.md invariant).
- Stored prices/fills are unchanged; account type never alters stored values.
- Existing DBs keep their data; the migration is additive + a one-time legacy
  settings copy.
- The old design doc (`2026-08-10-cent-account-precision-design.md`) is
  superseded on the display/toggle point; add a note pointing to this spec.

## 5. Out of scope (deferred)

- Seeding common forex pairs with correct contract sizes/quote currencies.
- Per-lot commission model; goal-progress UI.
- Multi-account UI (the app still assumes the single seeded account).
