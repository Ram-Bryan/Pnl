# Multi-Provider Live Pricing — Design

**Date:** 2026-08-15
**Status:** Approved
**Related:** `2026-08-15-open-orders-import-design.md` (open trades exist and need marking to market)

## Problem

Open positions are marked to market from a live quote feed so floating P&L is current. The single-source Yahoo feed is broken for some symbols and cannot be trusted as the only provider:

- Yahoo **delisted spot metals**: `XAUUSD=X` and `XAGUSD=X` return 404 ("No data found, symbol may be delisted"). `GC=F` (gold futures) still works but prices gold at ~1.4% above spot, which mis-marks an MT5 spot-CFD like `XAUUSD`.
- Yahoo spot forex (`EURUSD=X`, `USDJPY=X`, `GBPUSD=X`) and crypto (`BTC-USD`) still work.
- Any other provider being down should not take the whole feed down with it.

Verified against the user's real instruments (`EURUSDc`, `USDJPYc`, `GBPUSDc`, `XAUUSDc`, `BTCUSDc` — the `c` cent-account suffix is stripped by the existing mapper):

| Provider | Endpoint | Result |
|---|---|---|
| Yahoo chart | `…/chart/EURUSD=X` | ✓ 1.1573 |
| Yahoo chart | `…/chart/USDJPY=X` | ✓ 159.305 |
| Yahoo chart | `…/chart/GBPUSD=X` | ✓ 1.3536 |
| Yahoo chart | `…/chart/BTC-USD` | ✓ 63022.83 |
| Yahoo chart | `…/chart/GC=F` | ✓ 4437.3 (futures — not spot) |
| Yahoo chart | `…/chart/XAUUSD=X`, `XAGUSD=X` | ✗ 404 delisted |
| gold-api.com (no key) | `https://api.gold-api.com/price/XAU` | ✓ 4377.6 (spot) |
| gold-api.com (no key) | `https://api.gold-api.com/price/XAG` | ✓ 64.83 (spot) |
| Binance public | `https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT` | ✓ 4376.7 (tokenized gold, tracks spot) |
| Binance public | `…?symbol=BTCUSDT` | ✓ 63100.6 |
| Frankfurter (ECB, no key) | `https://api.frankfurter.app/latest?from=GBP&to=USD` | ✓ 1.3537 |
| Frankfurter (ECB, no key) | `https://api.frankfurter.app/latest?from=JPY&to=USD` | ✓ 0.00629 |
| ExchangeRate API (no key) | `https://open.er-api.com/v6/latest/EUR` | ✓ 1.1566 (free tier ≈1500 req/mo — too low for polling) |

## Design

### 1. Per-symbol provider chain — `src/prices/fetchQuote.ts`

`fetchLivePrice(symbol)` classifies the symbol and tries its provider chain **in order**; each attempt that fails (non-OK, timeout, malformed body) throws and the next provider is tried. Only when every provider fails does the call throw, so the caller keeps today's degrade-to-stored behavior.

Classification (reuses the existing cent-suffix strip, `CURRENCY_CODES`, `CRYPTO_BASES`):

| Kind | Rule | Chain |
|---|---|---|
| Forex | 6 chars, both halves in `CURRENCY_CODES` | Yahoo `=X` → Frankfurter `from=BASE&to=QUOTE` → ER-API `latest/BASE` (`.rates[QUOTE]`) |
| Metal (`XAUUSD`) | 6 chars ending `USD`, base `XAU` | gold-api `price/XAU` (`.price`) → Binance `PAXGUSDT` → Yahoo `GC=F` |
| Metal (`XAGUSD`) | 6 chars ending `USD`, base `XAG` | gold-api `price/XAG` (`.price`) → Yahoo `SI=F` |
| Crypto | base in `CRYPTO_BASES` | Yahoo `BASE-USD` → Binance `BASEUSDT` |
| Other | everything else (equities, indices, unlisted forex) | Yahoo passthrough only |

Provider implementations are pure functions of `(symbol, { fetchImpl })` returning a number or throwing, one per endpoint, so each is unit-testable in isolation. Per-attempt timeout stays `DEFAULT_FETCH_TIMEOUT_MS` (8s); a whole-chain failure of N providers is bounded by the caller's existing single-cycle guard.

ER-API is deliberately last for forex: its free quota (~1500 req/mo) cannot support 60s polling, so it only fires when Yahoo and Frankfurter both fail.

### 2. Persistence & fallback chain — `src/hooks/PricesContext.tsx` (unchanged behavior)

No changes to the context's contract. Resolution stays: live quote → persisted `last_live_price_<SYMBOL>` → most recent closed exit price → not priced. Multi-provider success just means "live" is true far more often.

### 3. One-line warning banner — `src/ui/PriceStatusBanner.tsx`

Both warning states collapse to a single compact row: icon + short text + Retry button. No stacked title/body block.

- **Amber (orange) "using stored"** — one line, e.g. `cloud-offline · Using stored prices · Retry`.
- **Red "no price"** — one line, e.g. `alert · No price for XAUUSD · Retry` (red stays reserved for this state).
- Live strip unchanged (already a single slim row).

### 4. Tests

- Per-provider parse: `parseYahooQuote`, gold-api `.price`, Binance `.price`, Frankfurter `.rates`, ER-API `.rates`.
- Classification: forex / metal / crypto / other, including the `c` suffix.
- Chain order: a stubbed `fetchImpl` that fails for provider 1 then succeeds for provider 2 returns the second price; all-fail rejects.
- Existing `fetchLivePrice` tests updated to the new signatures.

## Out of scope

- New rate-limiting/caching beyond the existing 60s poll + AppState-active refresh.
- Support for symbols outside the classified kinds beyond Yahoo passthrough.
- Any change to `PricesContext`'s public contract, `PriceStatusBanner` props, or the dashboard.
