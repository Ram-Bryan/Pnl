# Cent-Account Calculation Precision — Design Spec

Date: 2026-08-10
Status: Approved for implementation

## 1. Problem

P&L calculations and displays are off by a factor of 100 (or worse) for some account
types and instruments:

- `computeTradePnl` has **no account-type awareness**. It multiplies
  `priceDiff × size × contract_size − fees` in whatever units the prices were typed
  in. On a MT5-style **cent account**, a `0.01` lot maps to a 100× smaller position
  than on a standard account; today the app ignores that.
- `formatPnl` assumes the raw value is already **cents** (it divides by 100 for
  standard display). Users enter prices in **dollars**, so the two conventions
  disagree by 100×.
- `TradeRow`'s "Invested" uses an inconsistent multiplier
  (`accountType === 'cents' ? 0.01 : 1`) and `computeFormPnl` (add-trade preview)
  duplicates P&L logic without cent scaling.
- The JPY→USD conversion (÷ entry price) only runs when an instrument's
  `quote_currency` is set correctly. A forex symbol added with the default
  `quote_currency = 'USD'` silently skips the conversion.

**Concrete symptom (user-reported):** USDJPY, entry 157.552 → exit 157.536,
0.01 lot on a cent account. MT5 reports `-0.10 USC`. The app reported `-0.00`
(for lot 0.01) or `-0.16` (for lot 10, because the JPY→USD division was skipped).

### Correct math (MT5-equivalent)

```
effectiveContractSize = contract_size × (accountType === 'cents' ? 0.01 : 1)
volume                = lots × effectiveContractSize          // units of base currency
priceDiff             = long ? (exit − entry) : (entry − exit)
pnlInQuote            = priceDiff × volume                    // in quote currency
pnlUSD                = quote_currency ≠ 'USD' ? pnlInQuote ÷ entry_price : pnlInQuote
feesUSD               = fees × (accountType === 'cents' ? 0.01 : 1)   // fees typed in display unit
pnlUSD              −= feesUSD
```

Check against the reported case: `0.01 × 100,000 × 0.01 = 10` units;
`−0.016 × 10 = −0.16` JPY; `−0.16 ÷ 157.552 ≈ −0.00102` USD → displays `-0.10 USC`. ✓

## 2. Approach (chosen: canonical USD + account-aware compute)

- The canonical computation unit is **real USD dollars**.
- `computeTradePnl` returns USD; `formatPnl` only scales for display
  (cents account → ×100 → `USC`).
- Account type is part of the **calculation** (lot scaling ÷100, fee scaling ÷100),
  not just display.
- All P&L flows through one shared pure function so the preview, detail, list,
  dashboard, and filters cannot drift.

Rejected alternatives: canonical-cents storage (contradicts "prices entered in
dollars"); display-only fix (doesn't fix lot scaling or the unit mismatch).

## 3. Design

### 3.1 New pure module `src/stats/tradeMath.ts`

Single-purpose module owning the money math (per AGENTS.md: business logic lives
behind a domain layer, one purpose per module).

```ts
export type AccountType = 'standard' | 'cents';

export function tradeVolume(lots: number, contractSize: number, accountType: AccountType): number;
// lots × contractSize × (cents ? 0.01 : 1)

export function computeTradePnlInUsd(input: {
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  lots: number;              // trade.size
  contractSize: number;      // instrument.contract_size
  quoteCurrency: string;
  fees: number;              // typed in the account's display unit
  accountType: AccountType;
}): number;
// Steps 1–5 of the formula above. No rounding — full float precision.

export function computeInvestedUsd(input: {
  entryPrice: number;
  lots: number;
  contractSize: number;
  quoteCurrency: string;
  accountType: AccountType;
}): number;
// volume × (quote_currency === 'USD' ? entryPrice : 1)
// Approximation for pairs whose base currency isn't USD; matches reality for
// the common USD-quoted (EURUSD) and USD-based (USDJPY) cases.
```

### 3.2 `src/stats/computeStats.ts`

- `computeTradePnl(trade: TradeWithInstrument, accountType: AccountType = 'standard')`
  becomes a thin wrapper delegating to `computeTradePnlInUsd`.
- `computeStats(trades: TradeWithInstrument[], accountType: AccountType = 'standard')`
  threads the account type into every internal `computeTradePnl` call.
- Aggregation keeps full float precision; rounding happens only at display time.

### 3.3 `src/lib/format.ts`

New convention — `formatPnl(value, accountType)` where `value` is **real USD**:

| accountType | display |
|---|---|
| `standard` | `$X.XX` (≥ $1000 → `$X.Xk`) |
| `cents` | `(value × 100)` → `X.XX USC` (≥ 1000 USC → `X.Xk USC`) |

- Sign is handled by callers (color); formatter keeps returning absolute value with
  2 decimals, as today.
- `formatMoney`, `formatPrice`, `capitalize` unchanged.

### 3.4 Call sites (thread `accountType`)

| File | Change |
|---|---|
| `src/hooks/useDashboard.ts` | `computeStats(tradesList, at)` where `at` = resolved account type |
| `app/(tabs)/index.tsx` | pass accountType to `computeTradePnl` in `dailyPnls`, `chartPoints`, `selectedPnl`; fix `formatPnlShort` to `isCents ? v * 100 : v` |
| `app/trade/[id].tsx` | `computeTradePnl(trade, settings.accountType)` |
| `app/(tabs)/trades.tsx` | P&L filters: convert typed value to USD (`cents ? /100 : 1`) before comparing; label filter with the account's unit |
| `src/ui/TradeRow.tsx` | invested = `computeInvestedUsd(...)`; drop the `cents ? 0.01 : 1` multiplier |
| `app/add-trade.tsx` | `computeFormPnl` delegates to `computeTradePnlInUsd` with `accountType` so preview === saved P&L |

### 3.5 Data-entry fixes

- `app/(tabs)/symbols.tsx`: helper hints under Quote Currency ("JPY for USDJPY")
  and Contract Size ("Forex = 100000 per 1.0 lot").
- `app/add-trade.tsx`: the selected-symbol badge currently shows `price_mode`
  ("Cents mode"), which the app ignores. Replace with the real drivers:
  `FOREX · QUOTE JPY · x100000`.
- `app/(tabs)/settings.tsx`: replace "The raw calculation stays the same — only the
  display scale changes" with accurate copy: on a cent account, lot sizes map to
  100× smaller positions and P&L displays in USC.

### 3.6 Tests (Vitest, pure layers)

- New `src/stats/tradeMath.test.ts`:
  - USDJPY cent: 157.552→157.536, 0.01 lot, contract 100000 → ≈ −0.00102 USD,
    formatted `0.10 USC`.
  - Same trade on standard → ≈ −0.1015 USD, formatted `$0.10`.
  - EURUSD long: 1.0800→1.0810, 0.1 lot standard (10000 units) → +$10.00.
  - Cent-account fees: 0.10 USC → 0.001 USD subtracted.
  - Short-trade sign; zero/empty edge cases; `computeInvestedUsd` sanity.
- Update `src/lib/format.test.ts` to the new USD-native convention.

## 4. Scope & notes

- **No DB schema change.** Existing trades recompute with the corrected formula.
- Historical instruments with a wrong `quote_currency`/`contract_size` must be
  corrected via the Symbols screen — the app cannot infer past data.
- Prices and fills are always stored/displayed as real prices; account type never
  changes stored values.
- `computeTradePnl` keeps its name plus a new second parameter, so existing
  consumers still compile.
- Instrument `price_mode` remains in the schema but stays unused (controlled by the
  global account-type setting).

## 5. Out of scope (deferred)

- Seeding a list of common forex pairs with correct contract sizes/quote currencies.
- Per-lot commission model; goal-progress UI (weekly goal not yet rendered).
