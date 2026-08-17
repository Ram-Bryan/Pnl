# Direction-Aware Mark Price for Floating P&L

## Problem

gold-api.com returns a **mid/spot** price for XAUUSD (~4377.6). MT5 brokers use the **ask price** (~4376.143) for short positions and **bid** (~4375.883) for longs when computing floating P&L. The ~1.5 point gap between gold-api's mid and the broker's execution price causes each 0.01-lot open position to show ~1.5 USC less profit (or more loss) than the broker.

The current chain (gold-api primary, Binance fallback) returns only a single mid price. Binance PAXGUSDT, however, provides a `bookTicker` endpoint with real bid/ask — closer to MT5's actual prices.

## Design

### Data flow

```
fetchQuote.ts:
  goldApiQuote('XAU')         → { price: 4377.6 }        (mid, unchanged)
  goldBinanceQuote('XAUUSD')  → { price: 4376.7 }        (last, unchanged)
  goldBinanceSpreadQuote()    → { bid, ask }               (NEW — bookTicker)
  fetchSpreadPrice(symbol)    → { bid, ask } | null        (NEW — resolves spread)

PricesContext.tsx:
  prices[symbol]        → number          (mid/display price, unchanged)
  spreadPrices[symbol]  → { bid, ask }    (NEW — direction-aware prices)

computeStats(trades, currentPrices, spreadPrices?):
  markPrice = direction === 'short'
    ? spreadPrices[symbol]?.ask ?? currentPrices[symbol]
    : spreadPrices[symbol]?.bid ?? currentPrices[symbol]
  computeUnrealizedPnl(trade, markPrice)   (signature unchanged)

pnlOf (dashboard, trades screen):
  Same resolve logic using spreadPrices.
```

### Provider chain for gold spread

1. **Binance PAXGUSDT bookTicker** (primary) — real bid/ask, ~24/7, no API key
2. **gold-api.com mid** (fallback) — used as both bid and ask when Binance unavailable

When both fail, `spreadPrices[symbol]` is undefined and the system falls back to the existing `prices[symbol]` mid (current behavior preserved).

### Files to change

| File | Change |
|---|---|
| `src/prices/fetchQuote.ts` | Add `PAXG_BOOK_TICKER_URL`, `goldBinanceSpreadQuote()`, `fetchSpreadPrice(symbol)` |
| `src/prices/fetchQuote.test.ts` | Unit tests for spread quote + fetchSpreadPrice chain |
| `src/hooks/PricesContext.tsx` | Add `spreadPrices` state, fetch during poll, export |
| `src/stats/computeStats.ts` | Add optional `spreadPrices` param to `computeStats`, direction-aware mark price |
| `src/stats/computeStats.test.ts` | Test: floating P&L uses ask for shorts, bid for longs when spread available |
| `app/(tabs)/index.tsx` | `pnlOf` resolves direction-correct price via spreadPrices |
| `app/(tabs)/trades.tsx` | Same pattern for floating P&L display |

### Edge cases

- **Binance unavailable (rate limit, network):** gold-api mid used; no regression from current behavior.
- **Symbol without spread data (forex, crypto):** `spreadPrices[symbol]` is undefined → falls back to mid.
- **Weekend/holiday:** Binance PAXGUSDT trades 24/7; gold-api freezes at last spot. Binance is preferred.
- **New metals (XAGUSD):** Can add `SILVER_BOOK_TICKER` later, not in scope now.

### Out of scope

- Changing the `prices` map type (backward-compat preserved via separate `spreadPrices`).
- Spread adjustment for forex/crypto (not reported as an issue; single-price mid is fine).
- Persisting spread data in the DB (always fetched live).
