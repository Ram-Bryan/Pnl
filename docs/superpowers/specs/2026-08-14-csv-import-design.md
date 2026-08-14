# CSV Trade Import — Design Spec

## Overview

Import trades from a CSV file exported from MT5 into the trading journal. The import is transactional — either all trades are inserted or none are. Instruments (symbols) are created automatically if they don't exist yet.

## CSV Format

```
ticket,opening_time_utc,closing_time_utc,type,lots,original_position_size,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,profit,equity,margin_level,close_reason
```

## Flow

1. User taps the import icon in the trades screen header bar
2. `expo-document-picker` opens (CSV files only)
3. CSV is parsed client-side (simple custom parser, no library)
4. An import summary modal appears: "N trades found across M symbols"
5. User taps "Import" to confirm
6. All trades + instruments are inserted in a single SQLite transaction
7. On success: toast message, trades list refreshes
8. On failure: transaction rolls back, error alert shown

## Field Mapping (CSV → DB)

| CSV Column | DB Field | Transformation |
|---|---|---|
| `type` | `direction` | `buy` → `long`, `sell` → `short` |
| `lots` | `size` | Direct numeric |
| `opening_price` | `entry_price` | Direct numeric |
| `closing_price` | `exit_price` | Direct numeric |
| `opening_time_utc` | `entry_at` | ISO 8601 string |
| `closing_time_utc` | `exit_at` | ISO 8601 string |
| `stop_loss` | `stop_loss` | Nullable numeric |
| `take_profit` | `take_profit` | Nullable numeric |
| `commission` + `swap` | `fees` | Sum of both (default 0 if empty) |
| `close_reason` | `exit_condition` | String ("sl", "tp", etc.) |
| `ticket` | `notes` | Stored as reference string |
| — | `status` | Always `"closed"` |
| — | `account_id` | First account from DB |
| — | `instrument_id` | Looked up or created from `symbol` |

## Instrument Creation

When a symbol from the CSV doesn't exist in the `instruments` table:

1. Strip trailing `c` suffix (MT5 cent-account marker) → clean symbol
2. Infer asset class from symbol prefix:
   - `XAU`, `XAG` → `gold`
   - Known forex prefixes (`EUR`, `GBP`, `JPY`, `USD`, `CHF`, `AUD`, `NZD`, `CAD`) → `forex`
   - Crypto prefixes (`BTC`, `ETH`, `SOL`, `DOGE`, `ADA`, `XRP`) → `crypto`
   - Everything else → `equity`
3. Quote currency: extract from symbol (last 3 chars for forex), default `USD`
4. Price mode: original symbol ends with `c` → `cents`, else `standard`
5. Use `INSERT OR IGNORE` to handle race conditions gracefully

## Trade Fills

Each imported trade gets two fills in `trade_fills`:
- **Entry fill**: `side=entry`, `price=opening_price`, `quantity=lots`, `occurred_at=opening_time_utc`
- **Exit fill**: `side=exit`, `price=closing_price`, `quantity=lots`, `occurred_at=closing_time_utc`

## Transaction Safety

All database operations (instrument upserts + trade inserts + fill inserts) run inside a single `db.withTransactionAsync()` block. If any step fails, the entire import is rolled back and the user sees an error alert.

## UI

- **Import button**: `cloud-upload-outline` icon in the trades header bar (top-right, next to existing filter controls)
- **Progress**: `ActivityIndicator` overlay during import
- **Summary modal**: Shows trade count and symbol count before confirming
- **Success**: Brief text message replaces the empty state or appears at top of list
- **Error**: `Alert.alert` with error details

## Files to Create/Modify

- `src/lib/csvParser.ts` — CSV parsing + field mapping (new)
- `src/db/database.ts` — Add `importTradesFromCsv()` transactional function
- `app/(tabs)/trades.tsx` — Add import button + summary modal + flow orchestration
