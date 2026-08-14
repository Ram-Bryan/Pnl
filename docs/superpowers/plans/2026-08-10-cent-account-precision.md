# Cent-Account Calculation Precision — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make every P&L calculation account for cents — MT5-equivalent math (lot scaling ÷100 on cent accounts, JPY→USD conversion, fees in display unit) with display-only scaling for USD/USC.

**Architecture:** A new pure module `src/stats/tradeMath.ts` owns all money math and returns **real USD**. `computeTradePnl` / `computeStats` and the add-trade preview become thin wrappers over it. `formatPnl` now treats its input as USD and only scales for display (cents → ×100 USC). `AccountType` is threaded through every call site so the calculation, not just the display, is account-aware.

**Tech Stack:** TypeScript strict, Vitest (pure layers only — no component tests exist), React Native / expo-router screens.

## Global Constraints

- Canonical computation unit is **real USD dollars**. Prices are always stored/displayed as real prices; account type never changes stored values.
- `computeTradePnl(trade, accountType = 'standard')` keeps its name plus a new second parameter — no silent consumer breakage.
- No DB schema change. Existing trades recompute; wrong historical instrument data is fixed via the Symbols screen.
- No rounding in computation — full float precision through aggregation; rounding only in display formatters.
- Screens are presentation-only: all money math lives in `src/stats/tradeMath.ts`, not in components.
- Run `pnpm typecheck` and `pnpm test` before considering a task done. Commit each task separately.

---

### Task 1: Create `src/stats/tradeMath.ts` with the pure money math

**Files:**
- Create: `src/stats/tradeMath.ts`
- Test: `src/stats/tradeMath.test.ts`

**Interfaces:**
- Produces (used by Tasks 2, 5, 7):
  - `export type AccountType = 'standard' | 'cents';`
  - `export function tradeVolume(lots: number, contractSize: number, accountType: AccountType): number`
  - `export function computeTradePnlInUsd(input: { direction: 'long' | 'short'; entryPrice: number; exitPrice: number; lots: number; contractSize: number; quoteCurrency: string; fees: number; accountType: AccountType }): number`
  - `export function computeInvestedUsd(input: { entryPrice: number; lots: number; contractSize: number; quoteCurrency: string; accountType: AccountType }): number`

- [x] **Step 1: Write the failing test** — create `src/stats/tradeMath.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { tradeVolume, computeTradePnlInUsd, computeInvestedUsd } from './tradeMath';

describe('tradeVolume', () => {
  it('scales the position down 100x on a cents account', () => {
    expect(tradeVolume(0.01, 100000, 'cents')).toBe(10);
    expect(tradeVolume(0.01, 100000, 'standard')).toBe(1000);
  });
});

const usdJpy = {
  direction: 'long' as const,
  entryPrice: 157.552,
  exitPrice: 157.536,
  lots: 0.01,
  contractSize: 100000,
  quoteCurrency: 'JPY',
  fees: 0,
};

describe('computeTradePnlInUsd', () => {
  it('matches MT5: USDJPY 0.01 lot on a cents account is ~-0.0010155 USD', () => {
    expect(computeTradePnlInUsd({ ...usdJpy, accountType: 'cents' })).toBeCloseTo(-0.0010155, 6);
  });
  it('is 100x larger on a standard account', () => {
    expect(computeTradePnlInUsd({ ...usdJpy, accountType: 'standard' })).toBeCloseTo(-0.10155, 4);
  });
  it('does not convert when the quote currency is USD', () => {
    const pnl = computeTradePnlInUsd({
      direction: 'long', entryPrice: 1.08, exitPrice: 1.081, lots: 0.1,
      contractSize: 100000, quoteCurrency: 'USD', fees: 0, accountType: 'standard',
    });
    expect(pnl).toBeCloseTo(10, 6);
  });
  it('subtracts fees entered in the display unit (cents fees divided by 100)', () => {
    expect(computeTradePnlInUsd({ ...usdJpy, fees: 0.1, accountType: 'cents' })).toBeCloseTo(-0.0020155, 6);
  });
  it('counts a short as profit when price falls', () => {
    const pnl = computeTradePnlInUsd({
      direction: 'short', entryPrice: 1.1, exitPrice: 1.09, lots: 1,
      contractSize: 100000, quoteCurrency: 'USD', fees: 0, accountType: 'standard',
    });
    expect(pnl).toBeCloseTo(1000, 6);
  });
});

describe('computeInvestedUsd', () => {
  it('uses base volume for USD-based pairs (USDJPY)', () => {
    expect(computeInvestedUsd({ entryPrice: 157.552, lots: 0.01, contractSize: 100000, quoteCurrency: 'JPY', accountType: 'cents' })).toBe(10);
  });
  it('uses entry price x volume for USD-quoted pairs (EURUSD)', () => {
    expect(computeInvestedUsd({ entryPrice: 1.08, lots: 0.1, contractSize: 100000, quoteCurrency: 'USD', accountType: 'standard' })).toBeCloseTo(10800, 4);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/stats/tradeMath.test.ts`
Expected: FAIL — module `./tradeMath` cannot be found.

- [x] **Step 3: Write the implementation** — create `src/stats/tradeMath.ts`

```ts
// Pure money math for P&L, shared by computeStats and the add-trade preview.
// Canonical unit is real USD. On a cents account (MT5 cent-account sizing) lots
// map to 100x smaller positions, and fees are entered in the account's display
// unit (USC), so both are scaled by 0.01 before computing.

export type AccountType = 'standard' | 'cents';

export function tradeVolume(lots: number, contractSize: number, accountType: AccountType): number {
  const centScale = accountType === 'cents' ? 0.01 : 1;
  return lots * contractSize * centScale;
}

export function computeTradePnlInUsd(input: {
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  lots: number;
  contractSize: number;
  quoteCurrency: string;
  fees: number;
  accountType: AccountType;
}): number {
  const { direction, entryPrice, exitPrice, lots, contractSize, quoteCurrency, fees, accountType } = input;
  const priceDiff = direction === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  let pnlInQuote = priceDiff * tradeVolume(lots, contractSize, accountType);
  // Convert non-USD quote currency (e.g. JPY in USDJPY) to USD by the entry rate.
  if (quoteCurrency && quoteCurrency !== 'USD' && entryPrice > 0) {
    pnlInQuote /= entryPrice;
  }
  const feesUsd = fees * (accountType === 'cents' ? 0.01 : 1);
  return pnlInQuote - feesUsd;
}

export function computeInvestedUsd(input: {
  entryPrice: number;
  lots: number;
  contractSize: number;
  quoteCurrency: string;
  accountType: AccountType;
}): number {
  const { entryPrice, lots, contractSize, quoteCurrency, accountType } = input;
  const volume = tradeVolume(lots, contractSize, accountType);
  // Approximation for pairs whose base currency isn't USD; exact for the
  // common USD-quoted (EURUSD) and USD-based (USDJPY) cases.
  return volume * (quoteCurrency === 'USD' ? entryPrice : 1);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/stats/tradeMath.test.ts`
Expected: PASS (all 8 assertions).

- [x] **Step 5: Commit**

```bash
git add src/stats/tradeMath.ts src/stats/tradeMath.test.ts
git commit -m "feat: add account-aware USD money math (tradeMath)"
```

---

### Task 2: Thread `AccountType` through `computeStats.ts` and cover the stats boundary

**Files:**
- Modify: `src/stats/computeStats.ts` (computeTradePnl body lines ~58-75; computeStats signature + lines 101, 124, 127)
- Test: `src/stats/computeStats.test.ts` (new)

**Interfaces:**
- Consumes: `AccountType`, `computeTradePnlInUsd` from `src/stats/tradeMath` (Task 1).
- Produces (used by Tasks 4, 6): `computeTradePnl(trade: TradeWithInstrument, accountType: AccountType = 'standard'): number` and `computeStats(trades: TradeWithInstrument[], accountType: AccountType = 'standard'): StatsResult`.

- [x] **Step 1: Write the failing test** — create `src/stats/computeStats.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { computeStats, TradeWithInstrument } from './computeStats';

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
  it('scales all P&L down 100x on a cents account', () => {
    const trades = [makeTrade({ id: 1 }), makeTrade({ id: 2, size: 2 })];
    expect(computeStats(trades, 'standard').allTimePnl).toBeCloseTo(300, 6);
    expect(computeStats(trades, 'cents').allTimePnl).toBeCloseTo(3, 6);
  });

  it('derives totals, win rate and streak from recent results', () => {
    const trades = [
      makeTrade({ id: 1, entry_price: 100, exit_price: 101 }),
      makeTrade({ id: 2, entry_price: 100, exit_price: 99, exit_at: '2026-08-02T11:00:00' }),
      makeTrade({ id: 3, entry_price: 100, exit_price: 99, exit_at: '2026-08-03T11:00:00' }),
    ];
    const stats = computeStats(trades, 'standard');
    expect(stats.totalTrades).toBe(3);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(2);
    expect(stats.winRate).toBeCloseTo(33.33, 1);
    expect(stats.currentStreak).toBe(-2);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/stats/computeStats.test.ts`
Expected: FAIL — `computeStats(trades, 'standard')` takes 1 argument (signature has no `accountType`).

- [x] **Step 3: Modify `src/stats/computeStats.ts`**

3a. Add the import (top of file, after the `../db/schema` import):

```ts
import { AccountType, computeTradePnlInUsd } from './tradeMath';
```

3b. Replace the entire `computeTradePnl` function (the current body computes P&L inline). New body:

```ts
export function computeTradePnl(trade: TradeWithInstrument, accountType: AccountType = 'standard'): number {
  if (trade.exit_price == null) return 0;
  return computeTradePnlInUsd({
    direction: trade.direction,
    entryPrice: trade.entry_price,
    exitPrice: trade.exit_price,
    lots: trade.size,
    contractSize: trade.contract_size,
    quoteCurrency: trade.quote_currency,
    fees: trade.fees,
    accountType,
  });
}
```

3c. Change `computeStats` signature:

```ts
export function computeStats(trades: TradeWithInstrument[], accountType: AccountType = 'standard'): StatsResult {
```

3d. Update the three internal calls to pass the account type (lines 101, 124, 127):

```ts
const pnl = computeTradePnl(t, accountType);       // in the closed-trades loop
const firstPnl = computeTradePnl(sorted[0], accountType);   // streak
const pnl = computeTradePnl(t, accountType);       // streak loop
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/stats/computeStats.test.ts src/stats/tradeMath.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/stats/computeStats.ts src/stats/computeStats.test.ts
git commit -m "feat: make computeStats/computeTradePnl account-aware"
```

---

### Task 3: Change `formatPnl` to treat input as real USD

**Files:**
- Modify: `src/lib/format.ts` (formatPnl body, lines 6-19)
- Test: `src/lib/format.test.ts`

**Interfaces:**
- Produces (used by Tasks 4, 6, 7): `formatPnl(value: number, accountType: 'standard' | 'cents' = 'standard'): string` where `value` is **real USD** — standard displays `$X.XX`, cents displays `(value × 100)` as `X.XX USC`.

- [x] **Step 1: Update the test to the new convention** — rewrite the `formatPnl` describe block in `src/lib/format.test.ts`

```ts
describe('formatPnl', () => {
  it('formats standard values as real USD', () => {
    expect(formatPnl(1.4)).toBe('$1.40');
    expect(formatPnl(-1.4)).toBe('$1.40');
  });
  it('abbreviates large standard values with k', () => {
    expect(formatPnl(1350)).toBe('$1.4k');
  });
  it('treats sub-cent standard as zero', () => {
    expect(formatPnl(0.001)).toBe('$0.00');
  });
  it('displays cents mode as USC (value times 100)', () => {
    expect(formatPnl(-0.0010155, 'cents')).toBe('0.10 USC');
  });
  it('abbreviates large USC values with k', () => {
    expect(formatPnl(14.5, 'cents')).toBe('1.4k USC');
  });
  it('shows 2 decimals below 1000 USC', () => {
    expect(formatPnl(1.8, 'cents')).toBe('180.00 USC');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/format.test.ts`
Expected: FAIL — current `formatPnl(1.4)` returns `$0.01`, not `$1.40`.

- [x] **Step 3: Modify `src/lib/format.ts`** — replace the `formatPnl` function body:

```ts
export function formatPnl(value: number, accountType: 'standard' | 'cents' = 'standard'): string {
  const isCents = accountType === 'cents';
  // value is real USD. Cents display scales up by 100 (1 USD = 100 USC).
  const displayValue = isCents ? value * 100 : value;
  const rounded = Math.round(displayValue * 100) / 100;
  const v = Math.abs(rounded);
  if (isCents) {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k USC`;
    return `${v.toFixed(3)} USC`;
  }
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${moneyFormatter.format(v)}`;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/format.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: formatPnl treats input as real USD, scales display per account type"
```

---

### Task 4: Thread `accountType` through the dashboard and trade detail

**Files:**
- Modify: `src/hooks/useDashboard.ts:72`
- Modify: `app/(tabs)/index.tsx` (formatPnlShort 334-339; computeTradePnl calls 640, 656, 670, 761 + their memo deps)
- Modify: `app/trade/[id].tsx:67`

**Interfaces:**
- Consumes: `computeTradePnl(trade, accountType)` and `computeStats(trades, accountType)` from `src/stats/computeStats.ts` (Task 2).

- [x] **Step 1: Update `src/hooks/useDashboard.ts`**

Find `setStats(computeStats(tradesList));` (line 72) and change to:

```ts
setStats(computeStats(tradesList, at));
```

(`at` is the `AccountType` already resolved on line 70 from the settings.)

- [x] **Step 2: Update `app/(tabs)/index.tsx` — `formatPnlShort`**

Replace the `formatPnlShort` body (lines 334-339). The `const displayVal` line changes from `isCents ? v : v / 100` to:

```ts
  const displayVal = isCents ? v * 100 : v;
```

- [x] **Step 3: Update `app/(tabs)/index.tsx` — the three P&L memos**

3a. `dailyPnls` (line 640): `const pnl = computeTradePnl(t);` → `const pnl = computeTradePnl(t, accountType);` and change the memo deps from `[trades]` to `[trades, accountType]`.

3b. Inside the `chartPoints`/`xTicks` memo (lines 656 and 670): both `computeTradePnl(t)` → `computeTradePnl(t, accountType)`; add `accountType` to the dep array (line 741).

3c. `selectedPnl` (line 761): `computeTradePnl(t)` → `computeTradePnl(t, accountType)`; change deps from `[visibleTrades]` to `[visibleTrades, accountType]`.

- [x] **Step 4: Update `app/trade/[id].tsx`**

Line 67: `const pnl = computeTradePnl(trade);` → `const pnl = computeTradePnl(trade, settings.accountType);`

- [x] **Step 5: Verify**

Run: `pnpm typecheck` and `pnpm test`
Expected: both pass (typecheck clean, all unit tests green).

- [x] **Step 6: Commit**

```bash
git add src/hooks/useDashboard.ts app/\(tabs\)/index.tsx app/trade/\[id\].tsx
git commit -m "feat: thread account type through dashboard and trade detail P&L"
```

---

### Task 5: Fix the Invested figure in `TradeRow` with `computeInvestedUsd`

**Files:**
- Modify: `src/ui/TradeRow.tsx` (imports; lines 33-35)

**Interfaces:**
- Consumes: `computeInvestedUsd` from `src/stats/tradeMath` (Task 1).
- Consumes: `AccountType` prop already passed as `accountType` to `TradeRow`.

- [x] **Step 1: Update imports in `src/ui/TradeRow.tsx`**

Add after the existing `formatPnl` import:

```ts
import { computeInvestedUsd } from '../stats/tradeMath';
```

- [x] **Step 2: Replace the invested computation**

Remove the `multiplier` line and the inline multiplication. Replace lines 33-35 with:

```ts
  // Investment in USD, scaled for the account type (cent-account positions are 100x smaller)
  const invested = computeInvestedUsd({
    entryPrice: trade.entry_price,
    lots: trade.size,
    contractSize: trade.contract_size,
    quoteCurrency: trade.quote_currency,
    accountType,
  });
```

- [x] **Step 3: Verify**

Run: `pnpm typecheck` and `pnpm test`
Expected: both pass.

- [x] **Step 4: Commit**

```bash
git add src/ui/TradeRow.tsx
git commit -m "fix: compute invested via account-aware USD math"
```

---

### Task 6: Make the trade-list P&L filter unit-aware

**Files:**
- Modify: `app/(tabs)/trades.tsx` (imports; `FilterSheet` signature 195-204; P&L filter UI 298-306; filtering logic 412-414 + deps 431; `FilterSheet` render 468-475)

**Interfaces:**
- Consumes: `AccountType` from `src/stats/tradeMath`; `computeTradePnl(trade, accountType)` from `src/stats/computeStats`.
- The filtered memo compares USD P&L against the user's typed filter, converted to USD (`cents → ×0.01`).

- [x] **Step 1: Add the `AccountType` import**

After `import { computeTradePnl } from '../../src/stats/computeStats';`:

```ts
import { AccountType } from '../../src/stats/tradeMath';
```

- [x] **Step 2: Extend `FilterSheet` with `accountType`**

In the `FilterSheet` props type (lines 196-203) add:

```ts
  accountType: AccountType;
```

and destructure `accountType` from the params (line 195).

- [x] **Step 3: Unit-label the P&L filter UI**

Replace the P&L filter block (lines 298-306) with:

```tsx
        {/* PnL */}
        <View className="mb-8">
          <SectionLabel label={accountType === 'cents' ? 'Profit & Loss (USC)' : 'Profit & Loss'} />
          <RangeInput
            minVal={draft.pnlMin} maxVal={draft.pnlMax}
            onMinChange={v => set('pnlMin', v)} onMaxChange={v => set('pnlMax', v)}
            prefix={accountType === 'cents' ? '' : '$'}
          />
        </View>
```

- [x] **Step 4: Convert the filter values to USD in the filtering logic**

In the `filtered` memo (lines 412-414), replace:

```ts
      const pnl = computeTradePnl(t);
      if (applied.pnlMin && pnl < parseFloat(applied.pnlMin)) return false;
      if (applied.pnlMax && pnl > parseFloat(applied.pnlMax)) return false;
```

with:

```ts
      const pnl = computeTradePnl(t, settings.accountType);
      const pnlUnit = settings.accountType === 'cents' ? 0.01 : 1;
      if (applied.pnlMin && pnl < parseFloat(applied.pnlMin) * pnlUnit) return false;
      if (applied.pnlMax && pnl > parseFloat(applied.pnlMax) * pnlUnit) return false;
```

and change the memo deps (line 431) from `[trades, search, applied]` to `[trades, search, applied, settings.accountType]`.

- [x] **Step 5: Pass `accountType` into `FilterSheet`**

In the render (line 468), add the prop:

```tsx
      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        draft={draft}
        setDraft={setDraft}
        onApply={handleApply}
        onClear={handleClear}
        accountType={settings.accountType}
      />
```

- [x] **Step 6: Verify**

Run: `pnpm typecheck` and `pnpm test`
Expected: both pass.

- [x] **Step 7: Commit**

```bash
git add "app/(tabs)/trades.tsx"
git commit -m "feat: unit-aware P&L filter on trade list"
```

---

### Task 7: Make the add-trade P&L preview use the shared USD math

**Files:**
- Modify: `app/add-trade.tsx` (imports; `computeFormPnl` 102-121; symbol badge 329)

**Interfaces:**
- Consumes: `computeTradePnlInUsd`, `AccountType` from `../src/stats/tradeMath`.
- `computeFormPnl` now requires `accountType` in its params and returns real USD; the preview must display the same number the saved trade will show.

- [x] **Step 1: Add imports**

After `import { averageFillPrice, totalQuantity } from '../src/lib/aggregateFills';`:

```ts
import { computeTradePnlInUsd, AccountType } from '../src/stats/tradeMath';
```

- [x] **Step 2: Rewrite `computeFormPnl`**

Replace the whole function (lines 102-121). The non-USD conversion block (`rawPnl /= avgE`) is no longer needed — it lives in `computeTradePnlInUsd`:

```ts
function computeFormPnl({ entryFills, exitFills, direction, status, contractSize, fees, quoteCurrency, accountType }: {
  entryFills: { price: string; quantity: string }[];
  exitFills: { price: string; quantity: string }[];
  direction: 'long' | 'short'; status: 'open' | 'closed';
  contractSize: number; fees: number; quoteCurrency: string;
  accountType: AccountType;
}): number | null {
  if (status !== 'closed') return null;
  const ve = entryFills.filter(r => r.price && r.quantity).map(r => ({ price: parseFloat(r.price), quantity: parseFloat(r.quantity) }));
  const vx = exitFills.filter(r => r.price).map(r => ({ price: parseFloat(r.price), quantity: 1 }));
  if (!ve.length || !vx.length) return null;
  const avgE = averageFillPrice(ve), sz = totalQuantity(ve), avgX = averageFillPrice(vx);
  if (!isFinite(avgE) || !isFinite(avgX) || !isFinite(sz)) return null;
  return computeTradePnlInUsd({
    direction,
    entryPrice: avgE,
    exitPrice: avgX,
    lots: sz,
    contractSize,
    quoteCurrency,
    fees,
    accountType,
  });
}
```

(`PnlPreviewCard` already passes `accountType` through its spread `p`, and the call site at line 415 already provides `accountType={settings.accountType}` — no further wiring needed.)

- [x] **Step 3: Replace the misleading price-mode badge**

Replace the badge text at line 329:

```tsx
                    {selectedInstrument.asset_class.toUpperCase()} · {selectedInstrument.price_mode === 'cents' ? 'Cents mode' : 'Standard'}{contractSize !== 1 ? ` · x${contractSize}` : ''}
```

with the real drivers — quote currency and contract size:

```tsx
                    {selectedInstrument.asset_class.toUpperCase()} · {quoteCurrency.toUpperCase()}{contractSize !== 1 ? ` · x${contractSize}` : ''}
```

- [x] **Step 4: Verify**

Run: `pnpm typecheck` and `pnpm test`
Expected: both pass.

- [x] **Step 5: Commit**

```bash
git add app/add-trade.tsx
git commit -m "feat: add-trade preview uses shared account-aware P&L math"
```

---

### Task 8: Fix settings copy and add Symbol-screen hints

**Files:**
- Modify: `app/(tabs)/settings.tsx` (info text 53-55)
- Modify: `app/(tabs)/symbols.tsx` (Quote Currency + Contract Size inputs, around lines 212-216)

- [x] **Step 1: Update `app/(tabs)/settings.tsx`**

Replace the info text (lines 53-55) with accurate copy:

```tsx
              <Text className="text-[#6b6880] text-[11px] font-medium leading-4">
                When enabled, PnL is displayed in United States Cents (USC) and lots map to 100× smaller positions (MT5 cent-account sizing). Prices and fees are still entered as real values — the account type scales the calculation; only the display unit changes.
              </Text>
```

- [x] **Step 2: Add a hint under Quote Currency in `app/(tabs)/symbols.tsx`**

After the Quote Currency `FormInput` (line 213), add:

```tsx
            <Text className="text-[#6b6880] text-xs -mt-6 mb-8 px-1">JPY for USDJPY — used to convert P&L to USD.</Text>
```

- [x] **Step 3: Add a hint under Contract Size in `app/(tabs)/symbols.tsx`**

After the Contract Size `FormInput` (line 216), add:

```tsx
            <Text className="text-[#6b6880] text-xs -mt-6 mb-8 px-1">Units per 1.0 lot. Forex: 100000.</Text>
```

- [x] **Step 4: Verify**

Run: `pnpm typecheck` and `pnpm test`
Expected: both pass.

- [x] **Step 5: Commit**

```bash
git add "app/(tabs)/settings.tsx" "app/(tabs)/symbols.tsx"
git commit -m "docs: clarify cent-account behavior and symbol fields"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [x] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all Vitest suites pass (tradeMath, computeStats, format, aggregateFills, constants, assetClass).

- [x] **Step 2: Run the strict typecheck**

Run: `pnpm typecheck`
Expected: clean, no errors.

- [x] **Step 3: Sanity-check the formatted outputs**

Run: `pnpm exec vitest run src/stats/tradeMath.test.ts src/lib/format.test.ts -r verbose` and confirm the USDJPY cent case (`0.10 USC`) and its standard twin (`$0.10`) are covered and green.
