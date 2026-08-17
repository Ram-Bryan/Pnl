# Direction-Aware Mark Price Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use Binance PAXGUSDT bid/ask prices for gold floating P&L so short positions use the ask price and long positions use the bid price, matching the broker's mark-to-market.

**Architecture:** Add a `fetchSpreadPrice` function that returns `{ bid, ask }` for gold (Binance PAXGUSDT bookTicker), store the result in a parallel `spreadPrices` map in PricesContext, and have `computeStats` and `pnlOf` resolve the direction-correct mark price. Falls back to gold-api mid when Binance is unavailable.

**Tech Stack:** TypeScript, Vitest, expo-sqlite (unchanged), React Context (PricesContext)

## Global Constraints

- TypeScript strict mode (`tsc --noEmit` must pass)
- All existing tests must continue to pass (`vitest run`)
- No comments in code unless asked
- Follow existing code conventions (no new libraries)

---

### Task 1: Binance bookTicker spread provider + fetchSpreadPrice

**Files:**
- Modify: `src/prices/fetchQuote.ts:10-11` (add URL constant)
- Modify: `src/prices/fetchQuote.ts:154-160` (add goldBinanceSpreadQuote)
- Modify: `src/prices/fetchQuote.ts:162-193` (add fetchSpreadPrice)
- Test: `src/prices/fetchQuote.test.ts`

**Interfaces:**
- Consumes: `fetchJson`, `goldApiQuote`, `normalizeSymbol`, `classifySymbol` (all existing)
- Produces: `SpreadQuote` type, `goldBinanceSpreadQuote()`, `fetchSpreadPrice(symbol, opts?)`

- [ ] **Step 1: Write failing tests for goldBinanceSpreadQuote and fetchSpreadPrice**

Add to `src/prices/fetchQuote.test.ts`:

```ts
import {
  // ...existing imports...
  goldBinanceSpreadQuote,
  fetchSpreadPrice,
} from './fetchQuote';

// ...existing tests...

describe('goldBinanceSpreadQuote', () => {
  it('parses bid and ask from bookTicker', async () => {
    const opts: FetchQuoteOptions = {
      fetchImpl: okJson({ symbol: 'PAXGUSDT', bidPrice: '4375.88', askPrice: '4376.14' }),
    };
    await expect(goldBinanceSpreadQuote(opts)).resolves.toEqual({ bid: 4375.88, ask: 4376.14 });
  });

  it('throws when bidPrice is missing', async () => {
    const opts: FetchQuoteOptions = { fetchImpl: okJson({ askPrice: '4376.14' }) };
    await expect(goldBinanceSpreadQuote(opts)).rejects.toThrow();
  });

  it('throws when askPrice is missing', async () => {
    const opts: FetchQuoteOptions = { fetchImpl: okJson({ bidPrice: '4375.88' }) };
    await expect(goldBinanceSpreadQuote(opts)).rejects.toThrow();
  });
});

describe('fetchSpreadPrice', () => {
  it('returns bid/ask from Binance for XAUUSD', async () => {
    const opts: FetchQuoteOptions = {
      fetchImpl: okJson({ symbol: 'PAXGUSDT', bidPrice: '4375.88', askPrice: '4376.14' }),
    };
    await expect(fetchSpreadPrice('XAUUSD', opts)).resolves.toEqual({ bid: 4375.88, ask: 4376.14 });
  });

  it('falls back to gold-api mid when Binance fails', async () => {
    const fetchImpl = async (url: string) => {
      if (url.includes('binance')) return fail();
      if (url.includes('gold-api')) return respond({ price: 4377.6 });
      return fail();
    };
    await expect(fetchSpreadPrice('XAUUSD', { fetchImpl })).resolves.toEqual({ bid: 4377.6, ask: 4377.6 });
  });

  it('returns null for non-metal symbols', async () => {
    await expect(fetchSpreadPrice('EURUSD')).resolves.toBeNull();
    await expect(fetchSpreadPrice('BTCUSD')).resolves.toBeNull();
  });

  it('returns null when all providers fail', async () => {
    const opts: FetchQuoteOptions = { fetchImpl: fail };
    await expect(fetchSpreadPrice('XAUUSD', opts)).resolves.toBeNull();
  });

  it('tolerates the cent-account C suffix', async () => {
    const opts: FetchQuoteOptions = {
      fetchImpl: okJson({ symbol: 'PAXGUSDT', bidPrice: '4375.88', askPrice: '4376.14' }),
    };
    await expect(fetchSpreadPrice('XAUUSDc', opts)).resolves.toEqual({ bid: 4375.88, ask: 4376.14 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/prices/fetchQuote.test.ts`
Expected: FAIL — `goldBinanceSpreadQuote` and `fetchSpreadPrice` are not exported.

- [ ] **Step 3: Implement goldBinanceSpreadQuote and fetchSpreadPrice**

Add after line 10 in `src/prices/fetchQuote.ts`:

```ts
export const BINANCE_BOOK_TICKER_URL = 'https://api.binance.com/api/v3/ticker/bookTicker';
```

Add after `binanceQuote` (after line 160), before `fetchLivePrice`:

```ts
export type SpreadQuote = { bid: number; ask: number };

export async function goldBinanceSpreadQuote(opts?: FetchQuoteOptions): Promise<SpreadQuote> {
  const data = await fetchJson(`${BINANCE_BOOK_TICKER_URL}?symbol=PAXGUSDT`, opts);
  const bid = parseFloat((data as { bidPrice?: string })?.bidPrice ?? '');
  const ask = parseFloat((data as { askPrice?: string })?.askPrice ?? '');
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
    throw new Error('Bid/ask not found in Binance bookTicker response');
  }
  return { bid, ask };
}

export async function fetchSpreadPrice(symbol: string, opts?: FetchQuoteOptions): Promise<SpreadQuote | null> {
  const s = normalizeSymbol(symbol);
  if (classifySymbol(s) !== 'metal' || !s.startsWith('XAU')) return null;

  try {
    return await goldBinanceSpreadQuote(opts);
  } catch {
    try {
      const mid = await goldApiQuote('XAU', opts);
      return { bid: mid, ask: mid };
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/prices/fetchQuote.test.ts`
Expected: All tests pass including new ones.

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All 117+ tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/prices/fetchQuote.ts src/prices/fetchQuote.test.ts
git commit -m "feat: add Binance PAXGUSDT bid/ask spread provider for gold"
```

---

### Task 2: PricesContext spreadPrices state

**Files:**
- Modify: `src/hooks/PricesContext.tsx:1-144`

**Interfaces:**
- Consumes: `fetchSpreadPrice` from Task 1, `getOpenSymbols` (existing)
- Produces: `spreadPrices: Record<string, SpreadQuote>` in context value

- [ ] **Step 1: Add spreadPrices state and fetch logic**

In `src/hooks/PricesContext.tsx`:

1. Add import at line 4:
```ts
import { fetchLivePrice, fetchSpreadPrice, type SpreadQuote } from '../prices/fetchQuote';
```

2. Add state after line 41:
```ts
const [spreadPrices, setSpreadPrices] = useState<Record<string, SpreadQuote>>({});
```

3. Inside the `refresh` callback, after the `Promise.allSettled` block that fetches live prices (after line 76, before the settings block), add:
```ts
const spreadResults = await Promise.allSettled(
  symbols.map((s) => fetchSpreadPrice(s)),
);
const nextSpread: Record<string, SpreadQuote> = {};
spreadResults.forEach((result, i) => {
  if (result.status === 'fulfilled' && result.value != null) {
    nextSpread[symbols[i]] = result.value;
  }
});
```

4. After `setPrices(nextPrices)` at line 109, add:
```ts
setSpreadPrices(nextSpread);
```

5. When symbols are empty (line 53-57), also clear spreadPrices:
```ts
setSpreadPrices({});
```

6. Update the context value type at line 13-26 to include:
```ts
spreadPrices: Record<string, SpreadQuote>;
```

7. Add `spreadPrices` to the `useMemo` value object at line 132-135:
```ts
const value = useMemo(
  () => ({ prices, sources, missingSymbols, openSymbols, spreadPrices, lastUpdatedAt, loading, refresh }),
  [prices, sources, missingSymbols, openSymbols, spreadPrices, lastUpdatedAt, loading, refresh],
);
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (spreadPrices is properly typed through the context).

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All existing tests pass (no behavioral change yet — spreadPrices is additive).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/PricesContext.tsx
git commit -m "feat: add spreadPrices to PricesContext from Binance bookTicker"
```

---

### Task 3: computeStats direction-aware mark price

**Files:**
- Modify: `src/stats/computeStats.ts:146-188` (add spreadPrices param, direction-aware mark price)
- Test: `src/stats/computeStats.test.ts`

**Interfaces:**
- Consumes: `SpreadQuote` type from Task 1
- Produces: `computeStats(trades, currentPrices, spreadPrices?)` with direction-aware floating P&L

- [ ] **Step 1: Write failing tests**

Add to `src/stats/computeStats.test.ts`:

```ts
describe('spread-aware floating P&L', () => {
  it('uses ask price for shorts when spread is available', () => {
    const short = makeTrade({
      status: 'open',
      direction: 'short',
      symbol: 'XAUUSD',
      entry_price: 4383.649,
      exit_price: null,
      exit_at: null,
      contract_size: 100,
      size: 0.01,
      price_mode: 'cents',
      entry_at: '2026-08-15T10:00:00',
    });
    // Without spread: mid = 4377.6 → (4383.649−4377.6)×0.01 = 0.0605 USD
    // With spread: ask = 4376.14 → (4383.649−4376.14)×0.01 = 0.0751 USD
    const statsMid = computeStats([short], { XAUUSD: 4377.6 });
    const statsSpread = computeStats([short], { XAUUSD: 4377.6 }, { XAUUSD: { bid: 4375.88, ask: 4376.14 } });
    expect(statsMid.allTimePnl).toBeCloseTo(0.0605, 4);
    expect(statsSpread.allTimePnl).toBeCloseTo(0.0751, 4);
  });

  it('uses bid price for longs when spread is available', () => {
    const long = makeTrade({
      status: 'open',
      direction: 'long',
      symbol: 'XAUUSD',
      entry_price: 4370.0,
      exit_price: null,
      exit_at: null,
      contract_size: 100,
      size: 0.01,
      price_mode: 'cents',
      entry_at: '2026-08-15T10:00:00',
    });
    // Without spread: mid = 4377.6 → (4377.6−4370.0)×0.01 = 0.076 USD
    // With spread: bid = 4375.88 → (4375.88−4370.0)×0.01 = 0.0588 USD
    const statsMid = computeStats([long], { XAUUSD: 4377.6 });
    const statsSpread = computeStats([long], { XAUUSD: 4377.6 }, { XAUUSD: { bid: 4375.88, ask: 4376.14 } });
    expect(statsMid.allTimePnl).toBeCloseTo(0.076, 4);
    expect(statsSpread.allTimePnl).toBeCloseTo(0.0588, 4);
  });

  it('falls back to mid price when spread is not available for symbol', () => {
    const short = makeTrade({
      status: 'open',
      direction: 'short',
      symbol: 'XAUUSD',
      entry_price: 4383.649,
      exit_price: null,
      exit_at: null,
      contract_size: 100,
      size: 0.01,
      price_mode: 'cents',
      entry_at: '2026-08-15T10:00:00',
    });
    const stats = computeStats([short], { XAUUSD: 4377.6 }, {});
    expect(stats.allTimePnl).toBeCloseTo(0.0605, 4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/stats/computeStats.test.ts`
Expected: FAIL — `computeStats` does not accept a third argument.

- [ ] **Step 3: Implement spread-aware mark price in computeStats**

In `src/stats/computeStats.ts`, change the `computeStats` function signature and open-position loop:

1. Add import at top (after line 2):
```ts
import { SpreadQuote } from '../prices/fetchQuote';
```

2. Change the function signature at line 146:
```ts
export function computeStats(
  trades: TradeWithInstrument[],
  currentPrices: Record<string, number> = {},
  spreadPrices?: Record<string, SpreadQuote>,
): StatsResult {
```

3. Change the open-position loop at lines 180-188 to resolve direction-correct mark price:
```ts
for (const t of open) {
  const spread = spreadPrices?.[t.symbol];
  let markPrice = currentPrices[t.symbol];
  if (spread != null && markPrice != null) {
    markPrice = t.direction === 'short' ? spread.ask : spread.bid;
  }
  const pnl = computeUnrealizedPnl(t, markPrice);
  if (pnl === 0) continue;

  todayPnl += pnl;
  weekPnl += pnl;
  monthPnl += pnl;
  allTimePnl += pnl;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/stats/computeStats.test.ts`
Expected: All tests pass including new spread-aware tests.

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/stats/computeStats.ts src/stats/computeStats.test.ts
git commit -m "feat: use ask for shorts / bid for longs in computeStats when spread available"
```

---

### Task 4: Wire spreadPrices into useDashboard, dashboard, and trades screen

**Files:**
- Modify: `src/hooks/useDashboard.ts:76` (pass spreadPrices to computeStats)
- Modify: `app/(tabs)/index.tsx:713-726` (pnlOf uses spreadPrices)
- Modify: `app/(tabs)/trades.tsx:17,330,399-401` (floating P&L uses spreadPrices)

**Interfaces:**
- Consumes: `spreadPrices` from PricesContext (Task 2), `computeStats` with spreadPrices (Task 3)
- Produces: Direction-correct floating P&L in all UI surfaces

- [ ] **Step 1: Wire spreadPrices through useDashboard**

In `src/hooks/useDashboard.ts`:

1. `usePrices` is already imported from `'./PricesContext'` at line 9. Just destructure `spreadPrices` from the existing call.

2. At line 31, change:
```ts
const { prices } = usePrices();
```
to:
```ts
const { prices, spreadPrices } = usePrices();
```

3. At line 76, change:
```ts
const stats = useMemo(() => computeStats(trades, prices), [trades, prices]);
```
to:
```ts
const stats = useMemo(() => computeStats(trades, prices, spreadPrices), [trades, prices, spreadPrices]);
```

- [ ] **Step 2: Wire spreadPrices into dashboard pnlOf**

In `app/(tabs)/index.tsx`:

1. At line 27, destructure `spreadPrices`:
```ts
const { prices, sources, missingSymbols, openSymbols, lastUpdatedAt, refresh } = usePrices();
```
becomes:
```ts
const { prices, spreadPrices, sources, missingSymbols, openSymbols, lastUpdatedAt, refresh } = usePrices();
```

2. At lines 720-726, change `pnlOf` to use spread-aware mark price:
```ts
const pnlOf = React.useCallback(
  (trade: TradeWithInstrument) => {
    if (trade.status !== 'open') return computeTradePnl(trade);
    const spread = spreadPrices?.[trade.symbol];
    const markPrice = spread != null
      ? (trade.direction === 'short' ? spread.ask : spread.bid)
      : prices[trade.symbol];
    return computeUnrealizedPnl(trade, markPrice);
  },
  [prices, spreadPrices],
);
```

3. Update the `dailyPnls` useMemo dependency array at line 825 to include `spreadPrices`:
```ts
}, [trades, pnlOf, todayUtc]);
```
No change needed — `pnlOf` already depends on `spreadPrices` via its own dependency array.

- [ ] **Step 3: Wire spreadPrices into trades screen**

In `app/(tabs)/trades.tsx`:

1. At line 330, destructure `spreadPrices`:
```ts
const { prices: currentPrices } = usePrices();
```
becomes:
```ts
const { prices: currentPrices, spreadPrices } = usePrices();
```

2. At lines 399-401, change the floating P&L computation in the filter logic:
```ts
const pnl = t.status === 'open'
  ? computeUnrealizedPnl(t, currentPrices[t.symbol])
  : computeTradePnl(t);
```
becomes:
```ts
const markPrice = t.status === 'open'
  ? (() => {
      const spread = spreadPrices?.[t.symbol];
      return spread != null
        ? (t.direction === 'short' ? spread.ask : spread.bid)
        : currentPrices[t.symbol];
    })()
  : undefined;
const pnl = t.status === 'open'
  ? computeUnrealizedPnl(t, markPrice)
  : computeTradePnl(t);
```

Wait, that's awkward. Better: extract a helper or inline more cleanly:

```ts
const markPrice = t.status === 'open'
  ? (spreadPrices?.[t.symbol]
      ? (t.direction === 'short' ? spreadPrices[t.symbol].ask : spreadPrices[t.symbol].bid)
      : currentPrices[t.symbol])
  : undefined;
const pnl = t.status === 'open'
  ? computeUnrealizedPnl(t, markPrice)
  : computeTradePnl(t);
```

3. Update the `filtered` useMemo dependency array at line 421 to include `spreadPrices`:
```ts
}, [trades, search, applied, displayUnit, accountType, currentPrices, spreadPrices]);
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useDashboard.ts app/\(tabs\)/index.tsx app/\(tabs\)/trades.tsx
git commit -m "feat: wire spreadPrices into dashboard and trades screen for direction-correct P&L"
```

---

### Task 5: Update synthetic test to use real spread-aware values

**Files:**
- Modify: `src/stats/computeStats.test.ts:173-199`

**Interfaces:**
- Consumes: spread-aware `computeStats` from Task 3
- Produces: Updated test that validates spread-aware behavior with realistic data

- [ ] **Step 1: Update the existing "all-time P&L combines CSV-realized P&L with floating P&L" test**

The existing test at line 173 uses a synthetic entry price (4232.649). Update it to also test with spread data and verify the expected values:

```ts
it('all-time P&L combines CSV-realized P&L with floating P&L on open positions', () => {
  const closed = makeTrade({
    id: 1,
    price_mode: 'cents',
    realized_pnl: -0.5535,
    entry_at: '2026-08-01T10:00:00',
    exit_at: '2026-08-01T11:00:00',
  });
  const openGold = makeTrade({
    id: 2,
    price_mode: 'cents',
    status: 'open',
    direction: 'short',
    symbol: 'XAUUSD',
    entry_price: 4383.649,
    exit_price: null,
    exit_at: null,
    contract_size: 100,
    size: 0.01,
    entry_at: '2026-08-15T10:00:00',
  });
  // Without spread: mid 4377.6 → (4383.649−4377.6)×0.01 = 0.0605 USD floating
  // With spread: ask 4376.14 → (4383.649−4376.14)×0.01 = 0.0751 USD floating
  const statsMid = computeStats([closed, openGold], { XAUUSD: 4377.6 });
  expect(statsMid.allTimePnl).toBeCloseTo(-0.4930, 4);

  const statsSpread = computeStats(
    [closed, openGold],
    { XAUUSD: 4377.6 },
    { XAUUSD: { bid: 4375.88, ask: 4376.14 } },
  );
  expect(statsSpread.allTimePnl).toBeCloseTo(-0.4784, 4);
  expect(statsSpread.allTimePnl * 100).toBeCloseTo(-47.84, 2);
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test src/stats/computeStats.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/stats/computeStats.test.ts
git commit -m "test: update spread-aware P&L test with real XAUUSD entry and bid/ask"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass (117+ tests).

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (no TypeScript errors).

- [ ] **Step 3: Verify no regressions in existing tests**

Check that the existing `fetchLivePrice` chain tests still pass (they should — no changes to the single-price chain).

- [ ] **Step 4: Verify the implementation against real data**

Manually verify: with gold-api mid 4377.6, Binance ask 4376.14:
- Short 0.01 @ 4383.649: (4383.649−4376.14)×0.01 = 0.0751 USD = 7.51 USC (matches MT5 ~7.50)
- Short 0.01 @ 4382.318: (4382.318−4376.14)×0.01 = 0.0618 USD = 6.18 USC (matches MT5 ~6.20)
