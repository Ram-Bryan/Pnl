# Multi-Provider Live Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make open-position mark-to-market work for every real symbol by routing each symbol class through a multi-provider quote chain, and shrink the warning banners to a single line.

**Architecture:** `fetchLivePrice` classifies a symbol (forex / metal / crypto / other) and tries a per-class provider chain in order — Yahoo chart, gold-api.com spot, Binance public, Frankfurter (ECB), ExchangeRate API — throwing only when every provider fails so the existing stored-price fallback kicks in. The banner's two warning states collapse from a stacked title/body block to a single compact row.

**Tech Stack:** TypeScript strict, Vitest, React Native / NativeWind (existing UI kit), expo-sqlite (unchanged).

## Global Constraints

- **No git commits unless the user explicitly approves** (AGENTS.md). End every task with a "verify" step instead of a commit step. The entire live-pricing feature is currently uncommitted.
- Run `pnpm typecheck` and `pnpm test` and confirm both pass before claiming any task done.
- Do not change `PricesContext`'s public contract, `PriceStatusBanner`'s props, or `app/(tabs)/index.tsx`'s banner wiring.
- No comments that restate the code; comments must explain *why*.
- `shadow-*` classes stay static literals, never toggled at runtime.
- Existing unit test file: `src/prices/fetchQuote.test.ts` (Vitest, `pnpm test`).

---

### Task 1: Symbol classification and normalization

**Files:**
- Modify: `src/prices/fetchQuote.ts:21-36`
- Test: `src/prices/fetchQuote.test.ts`

**Interfaces:**
- Consumes: nothing new (existing constants `CURRENCY_CODES`, `CRYPTO_BASES` stay).
- Produces: `normalizeSymbol(symbol: string): string` and `classifySymbol(symbol: string): SymbolKind` where `SymbolKind = 'forex' | 'metal' | 'crypto' | 'other'`.

- [ ] **Step 1: Add the failing tests**

Append to `src/prices/fetchQuote.test.ts`:

```ts
import { classifySymbol, normalizeSymbol } from './fetchQuote';

describe('normalizeSymbol', () => {
  it('strips the cent-account c suffix and uppercases', () => {
    expect(normalizeSymbol('XAUUSDc')).toBe('XAUUSD');
    expect(normalizeSymbol(' eurusdc ')).toBe('EURUSD');
  });
});

describe('classifySymbol', () => {
  it('classifies forex, metal, crypto, and other', () => {
    expect(classifySymbol('EURUSD')).toBe('forex');
    expect(classifySymbol('USDJPY')).toBe('forex');
    expect(classifySymbol('XAUUSD')).toBe('metal');
    expect(classifySymbol('XAGUSD')).toBe('metal');
    expect(classifySymbol('BTCUSD')).toBe('crypto');
    expect(classifySymbol('AAPL')).toBe('other');
    expect(classifySymbol('XAUUSDc')).toBe('metal');
  });
});
```

Note: the import line must be merged with the existing `import { ... } from './fetchQuote';` at the top of the test file — do not add a second import of the same module.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `normalizeSymbol` / `classifySymbol` are not exported yet.

- [ ] **Step 3: Implement the two functions**

In `src/prices/fetchQuote.ts`, add `METAL_BASES` and the two functions (place `SymbolKind` and helpers above `toYahooTicker`):

```ts
// Spot metals Yahoo delisted but gold-api.com still quotes.
const METAL_BASES = new Set(['XAU', 'XAG']);

export type SymbolKind = 'forex' | 'metal' | 'crypto' | 'other';

// Strips the cent-account CFD suffix (XAUUSDc → XAUUSD) the raw CSV may carry.
export function normalizeSymbol(symbol: string): string {
  let s = symbol.trim().toUpperCase();
  if (s.endsWith('C') && s.length > 1) s = s.slice(0, -1);
  return s;
}

export function classifySymbol(symbol: string): SymbolKind {
  const s = normalizeSymbol(symbol);
  if (s.length === 6 && CURRENCY_CODES.has(s.slice(0, 3)) && CURRENCY_CODES.has(s.slice(3, 6))) {
    return 'forex';
  }
  if (s.length === 6 && s.endsWith('USD')) {
    const base = s.slice(0, 3);
    if (METAL_BASES.has(base)) return 'metal';
    if (CRYPTO_BASES.has(base)) return 'crypto';
  }
  return 'other';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all previous tests still green).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

---

### Task 2: Shared fetch helper and per-provider quote functions

**Files:**
- Modify: `src/prices/fetchQuote.ts` (replace the `fetchLivePrice` body and `Fetcher` block, add `fetchJson`, `runChain`, provider functions, URL constants)
- Test: `src/prices/fetchQuote.test.ts`

**Interfaces:**
- Consumes: `normalizeSymbol`, `classifySymbol`, `toYahooTicker`, `parseYahooQuote` from Task 1.
- Produces:
  - `export type FetchQuoteOptions = { timeoutMs?: number; fetchImpl?: Fetcher }` (the `Fetcher` type already exists).
  - `export async function yahooQuote(ticker: string, opts?: FetchQuoteOptions): Promise<number>`
  - `export async function frankfurterQuote(pair: string, opts?: FetchQuoteOptions): Promise<number>`
  - `export async function erApiQuote(pair: string, opts?: FetchQuoteOptions): Promise<number>`
  - `export async function goldApiQuote(metal: 'XAU' | 'XAG', opts?: FetchQuoteOptions): Promise<number>`
  - `export async function binanceQuote(ticker: string, opts?: FetchQuoteOptions): Promise<number>`
  - `export async function fetchLivePrice(symbol: string, opts?: FetchQuoteOptions): Promise<number>` (chain version)

- [ ] **Step 1: Add the failing tests**

Append to `src/prices/fetchQuote.test.ts` (merge `import` additions into the existing top-level import):

```ts
import {
  classifySymbol,
  normalizeSymbol,
  yahooQuote,
  frankfurterQuote,
  erApiQuote,
  goldApiQuote,
  binanceQuote,
  fetchLivePrice,
} from './fetchQuote';
import type { FetchQuoteOptions } from './fetchQuote';

function okJson(body: unknown) {
  return async () => ({ ok: true, status: 200, json: async () => body });
}

function fail() {
  return async () => ({ ok: false, status: 503, json: async () => ({}) });
}

describe('provider parsers', () => {
  it('goldApiQuote reads the spot price', async () => {
    const opts: FetchQuoteOptions = { fetchImpl: okJson({ symbol: 'XAU', price: 4377.6 }) };
    await expect(goldApiQuote('XAU', opts)).resolves.toBe(4377.6);
  });
  it('goldApiQuote throws when the price is missing', async () => {
    const opts: FetchQuoteOptions = { fetchImpl: okJson({}) };
    await expect(goldApiQuote('XAU', opts)).rejects.toThrow();
  });
  it('binanceQuote parses the string price', async () => {
    const opts: FetchQuoteOptions = { fetchImpl: okJson({ symbol: 'BTCUSDT', price: '63100.56' }) };
    await expect(binanceQuote('BTCUSDT', opts)).resolves.toBe(63100.56);
  });
  it('binanceQuote throws on a missing price', async () => {
    const opts: FetchQuoteOptions = { fetchImpl: okJson({}) };
    await expect(binanceQuote('BTCUSDT', opts)).rejects.toThrow();
  });
  it('frankfurterQuote reads the target rate', async () => {
    const opts: FetchQuoteOptions = { fetchImpl: okJson({ rates: { JPY: 159.01 } }) };
    await expect(frankfurterQuote('USDJPY', opts)).resolves.toBe(159.01);
  });
  it('frankfurterQuote throws when the rate is missing', async () => {
    const opts: FetchQuoteOptions = { fetchImpl: okJson({ rates: {} }) };
    await expect(frankfurterQuote('USDJPY', opts)).rejects.toThrow();
  });
  it('erApiQuote reads a successful rate', async () => {
    const opts: FetchQuoteOptions = { fetchImpl: okJson({ result: 'success', rates: { USD: 1.1566 } }) };
    await expect(erApiQuote('EURUSD', opts)).resolves.toBe(1.1566);
  });
  it('erApiQuote throws when the API reports failure', async () => {
    const opts: FetchQuoteOptions = { fetchImpl: okJson({ result: 'error', rates: {} }) };
    await expect(erApiQuote('EURUSD', opts)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — provider functions not exported yet.

- [ ] **Step 3: Implement the helper and providers**

In `src/prices/fetchQuote.ts`:

1. Add the URL constants after `YAHOO_CHART_URL`:

```ts
export const FRANKFURTER_URL = 'https://api.frankfurter.app/latest';
export const ER_API_URL = 'https://open.er-api.com/v6/latest';
export const GOLD_API_URL = 'https://api.gold-api.com/price';
export const BINANCE_URL = 'https://api.binance.com/api/v3/ticker/price';
```

2. Replace the existing `type Fetcher` block and the whole current `fetchLivePrice` (from `type Fetcher` through the end of file) with:

```ts
type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type FetchQuoteOptions = { timeoutMs?: number; fetchImpl?: Fetcher };

// GETs a URL and parses the JSON body with a hard timeout so a hanging request
// never blocks the refresh cycle.
async function fetchJson(url: string, opts: FetchQuoteOptions = {}): Promise<unknown> {
  const fetcher: Fetcher = (opts.fetchImpl ?? fetch) as Fetcher;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetcher(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Runs providers in order, returning the first successful quote; throws when
// every provider fails so callers degrade to the stored-price fallback.
async function runChain(providers: Array<() => Promise<number>>): Promise<number> {
  let lastError: unknown = new Error('All price providers failed');
  for (const provider of providers) {
    try {
      return await provider();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All price providers failed');
}

export async function yahooQuote(ticker: string, opts?: FetchQuoteOptions): Promise<number> {
  const data = await fetchJson(`${YAHOO_CHART_URL}${encodeURIComponent(ticker)}?interval=1d&range=1d`, opts);
  return parseYahooQuote(data);
}

// Frankfurter mirrors official ECB reference rates and quotes any supported
// fiat pair directly (from=BASE&to=QUOTE); no key required.
export async function frankfurterQuote(pair: string, opts?: FetchQuoteOptions): Promise<number> {
  const base = pair.slice(0, 3);
  const quote = pair.slice(3, 6);
  const data = await fetchJson(`${FRANKFURTER_URL}?from=${base}&to=${quote}`, opts);
  const rate = (data as { rates?: Record<string, number> })?.rates?.[quote];
  if (typeof rate !== 'number' || !Number.isFinite(rate)) {
    throw new Error('Quote not found in Frankfurter response');
  }
  return rate;
}

// ExchangeRate API — free tier is quota-limited, so it is a last resort only.
export async function erApiQuote(pair: string, opts?: FetchQuoteOptions): Promise<number> {
  const base = pair.slice(0, 3);
  const quote = pair.slice(3, 6);
  const data = await fetchJson(`${ER_API_URL}/${base}`, opts);
  const body = data as { result?: string; rates?: Record<string, number> };
  if (body.result !== 'success') throw new Error('ExchangeRate API reported failure');
  const rate = body.rates?.[quote];
  if (typeof rate !== 'number' || !Number.isFinite(rate)) {
    throw new Error('Quote not found in ExchangeRate API response');
  }
  return rate;
}

// gold-api.com quotes spot metals (XAU, XAG) without a key.
export async function goldApiQuote(metal: 'XAU' | 'XAG', opts?: FetchQuoteOptions): Promise<number> {
  const data = await fetchJson(`${GOLD_API_URL}/${metal}`, opts);
  const price = (data as { price?: number })?.price;
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    throw new Error('Quote not found in gold-api response');
  }
  return price;
}

// Binance public ticker; the price arrives as a string.
export async function binanceQuote(ticker: string, opts?: FetchQuoteOptions): Promise<number> {
  const data = await fetchJson(`${BINANCE_URL}?symbol=${ticker}`, opts);
  const price = parseFloat((data as { price?: string })?.price ?? '');
  if (!Number.isFinite(price)) throw new Error('Quote not found in Binance response');
  return price;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

---

### Task 3: Wire the provider chain into `fetchLivePrice`

**Files:**
- Modify: `src/prices/fetchQuote.ts` (append the new `fetchLivePrice`)
- Test: `src/prices/fetchQuote.test.ts`

**Interfaces:**
- Consumes: all Task 2 providers plus `normalizeSymbol`, `classifySymbol`, `toYahooTicker`.
- Produces: `fetchLivePrice(symbol: string, opts?: FetchQuoteOptions): Promise<number>` — chain version used by `src/hooks/PricesContext.tsx` unchanged.

- [ ] **Step 1: Add the failing tests**

Append to `src/prices/fetchQuote.test.ts` (reuse the `okJson` / `fail` helpers already defined in Task 2):

```ts
describe('fetchLivePrice', () => {
  it('falls back to the next provider when the first fails', async () => {
    const fetchImpl = async (url: string) => {
      if (url.includes('gold-api')) return fail();
      if (url.includes('binance')) return okJson({ price: '4376.7' });
      return okJson({ chart: { result: [{ meta: { regularMarketPrice: 4437.3 } }] } });
    };
    await expect(fetchLivePrice('XAUUSD', { fetchImpl })).resolves.toBe(4376.7);
  });

  it('tries the whole gold chain before failing', async () => {
    const fetchImpl = async () => fail();
    await expect(fetchLivePrice('XAUUSD', { fetchImpl })).rejects.toThrow();
  });

  it('chains forex through Yahoo then Frankfurter then ExchangeRate', async () => {
    const fetchImpl = async (url: string) => {
      if (url.includes('query1')) return fail();
      if (url.includes('frankfurter')) return okJson({ rates: { USD: 1.1573 } });
      return okJson({ result: 'success', rates: { USD: 1.1575 } });
    };
    await expect(fetchLivePrice('EURUSD', { fetchImpl })).resolves.toBe(1.1573);
  });

  it('chains crypto through Yahoo then Binance', async () => {
    const fetchImpl = async (url: string) => {
      if (url.includes('query1')) return fail();
      return okJson({ price: '63100.56' });
    };
    await expect(fetchLivePrice('BTCUSD', { fetchImpl })).resolves.toBe(63100.56);
  });

  it('quotes equities straight from Yahoo', async () => {
    const fetchImpl = okJson({ chart: { result: [{ meta: { regularMarketPrice: 42.5 } }] } });
    await expect(fetchLivePrice('AAPL', { fetchImpl })).resolves.toBe(42.5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `fetchLivePrice` currently takes one provider, so the URL-aware stub returns the wrong value or the chain never reaches the second provider.

- [ ] **Step 3: Implement the chain**

Append to `src/prices/fetchQuote.ts`:

```ts
// Fetches the live price for a symbol by trying its provider chain in order.
// Throws only when every provider fails, so callers degrade to stored prices.
export async function fetchLivePrice(symbol: string, opts?: FetchQuoteOptions): Promise<number> {
  const s = normalizeSymbol(symbol);
  switch (classifySymbol(s)) {
    case 'forex':
      return runChain([
        () => yahooQuote(toYahooTicker(s), opts),
        () => frankfurterQuote(s, opts),
        () => erApiQuote(s, opts),
      ]);
    case 'metal':
      if (s.startsWith('XAU')) {
        return runChain([
          () => goldApiQuote('XAU', opts),
          () => binanceQuote('PAXGUSDT', opts),
          () => yahooQuote('GC=F', opts),
        ]);
      }
      return runChain([
        () => goldApiQuote('XAG', opts),
        () => yahooQuote('SI=F', opts),
      ]);
    case 'crypto':
      return runChain([
        () => yahooQuote(toYahooTicker(s), opts),
        () => binanceQuote(`${s.slice(0, 3)}USDT`, opts),
      ]);
    default:
      return yahooQuote(toYahooTicker(s), opts);
  }
}
```

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all of `src/prices/fetchQuote.test.ts` and the rest of the suite (105+ tests) green.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Remove now-stale metal tests**

In `src/prices/fetchQuote.test.ts`, delete the `it('maps USD-quoted metals to the =X spot quote', ...)` block under `describe('toYahooTicker', ...)`. Metals no longer route through `toYahooTicker`; `classifySymbol` covers them. Do **not** delete the cent-suffix test that asserts `toYahooTicker('XAUUSDc')` — update its expectation to a non-metal symbol, e.g. `expect(toYahooTicker('EURUSDc')).toBe('EURUSD=X')`.

Run: `pnpm test`
Expected: PASS.

---

### Task 4: One-line warning banners

**Files:**
- Modify: `src/ui/PriceStatusBanner.tsx:31-67` (the two warning blocks)

**Interfaces:**
- Consumes: existing props unchanged (`openSymbols`, `sources`, `missingSymbols`, `lastUpdatedAt`, `onRetry`).
- Produces: no new exports; `src/ui/index.ts` and `app/(tabs)/index.tsx` untouched.

- [ ] **Step 1: Edit the red "no price" block**

Replace the body of the `missingSymbols.length > 0` return with a single-row layout:

```tsx
  if (missingSymbols.length > 0) {
    return (
      <Animated.View entering={FadeInDown.duration(400)}>
        <View className="bg-[rgba(255,77,106,0.15)] border border-[rgba(255,77,106,0.3)] rounded-2xl px-4 py-2.5 mb-6 flex-row items-center">
          <Ionicons name="cloud-offline" size={18} color="#FF4D6A" />
          <Text className="ml-2 flex-1 text-[#FF4D6A] text-xs font-bold" numberOfLines={1}>
            No price for {missingSymbols.join(', ')}
          </Text>
          <RetryButton onPress={onRetry} />
        </View>
      </Animated.View>
    );
  }
```

- [ ] **Step 2: Edit the amber "using stored" block**

Replace the body of the `storedSymbols.length > 0` return with a single-row layout:

```tsx
  if (storedSymbols.length > 0) {
    return (
      <Animated.View entering={FadeInDown.duration(400)}>
        <View className="bg-[rgba(245,158,11,0.15)] border border-[rgba(245,158,11,0.3)] rounded-2xl px-4 py-2.5 mb-6 flex-row items-center">
          <Ionicons name="cloud-offline" size={18} color="#f59e0b" />
          <Text className="ml-2 flex-1 text-[#f59e0b] text-xs font-bold" numberOfLines={1}>
            Using stored prices
          </Text>
          <RetryButton onPress={onRetry} />
        </View>
      </Animated.View>
    );
  }
```

- [ ] **Step 3: Verify the banner reads cleanly**

Read `src/ui/PriceStatusBanner.tsx` top to bottom. Confirm: each warning is exactly one row (icon + one-line text with `numberOfLines={1}` + Retry), the live strip block is unchanged, `storedSymbols` computation still exists, and the `RetryButton` component is still defined at the bottom of the file.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Visual smoke test on a device**

Run: `pnpm start` (or `pnpm android`) and open the Dashboard tab. With open positions and the network blocked/unavailable, confirm: the amber "Using stored prices" warning renders as a single line with a Retry button; with no price at all for a symbol, the red single-line warning renders. Toggle the network on and press Retry to confirm a live refresh returns (verify "Live prices" strip appears for symbols Yahoo/other providers can quote).
