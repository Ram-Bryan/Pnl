# CSV Trade Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CSV import feature to the trades screen that parses MT5 export CSVs, creates instruments if needed, and inserts trades + fills in a single transaction.

**Architecture:** Three layers: (1) a pure CSV parser + field mapper in `src/lib/csvParser.ts`, (2) a transactional DB import function in `src/db/database.ts`, (3) UI in `app/(tabs)/trades.tsx` with import button, summary modal, and progress state.

**Tech Stack:** expo-document-picker (file selection), expo-sqlite (transactional inserts), React Native Alert (error handling), existing UI kit (Modal, ActivityIndicator).

## Global Constraints

- Stack: Expo SDK 57 / React Native 0.86, TypeScript strict, NativeWind v4.2.6
- DB: expo-sqlite, all inserts in a single transaction
- No new dependencies beyond `expo-document-picker` (already available via Expo)
- P&L is always computed, never stored — imported `profit` column is ignored for DB storage
- Tests: Vitest for pure logic (`src/lib`), no component tests yet

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/csvParser.ts` | Create | Parse CSV string → typed rows, map to TradeDraft + fills |
| `src/lib/csvParser.test.ts` | Create | Unit tests for parser + mapper |
| `src/db/database.ts` | Modify | Add `importTradesFromCsv()` transactional function |
| `app/(tabs)/trades.tsx` | Modify | Import button, summary modal, progress state |

---

### Task 1: CSV Parser — Parse + Validate

**Files:**
- Create: `src/lib/csvParser.ts`
- Create: `src/lib/csvParser.test.ts`

**Interfaces:**
- Produces: `parseCsvRows(csvString: string): CsvTradeRow[]`

- [ ] **Step 1: Define types and write the parser function**

Create `src/lib/csvParser.ts`:

```typescript
export type CsvTradeRow = {
  ticket: string;
  opening_time_utc: string;
  closing_time_utc: string;
  type: 'buy' | 'sell';
  lots: number;
  symbol: string;
  opening_price: number;
  closing_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  commission: number;
  swap: number;
  close_reason: string;
};

export function parseCsvRows(csv: string): CsvTradeRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const required = [
    'ticket', 'opening_time_utc', 'closing_time_utc', 'type', 'lots',
    'symbol', 'opening_price', 'closing_price', 'commission', 'swap', 'close_reason',
  ];
  for (const col of required) {
    if (!headers.includes(col)) {
      throw new Error(`Missing required column: ${col}`);
    }
  }

  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const rows: CsvTradeRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = parseCsvLine(line);
    if (cells.length < headers.length) continue;

    const get = (key: string): string => (cells[idx[key]] ?? '').trim();
    const getNum = (key: string): number => {
      const v = get(key);
      return v ? parseFloat(v) : 0;
    };
    const getNumOrNull = (key: string): number | null => {
      const v = get(key);
      return v ? parseFloat(v) : null;
    };

    const type = get('type').toLowerCase();
    if (type !== 'buy' && type !== 'sell') continue;

    rows.push({
      ticket: get('ticket'),
      opening_time_utc: get('opening_time_utc'),
      closing_time_utc: get('closing_time_utc'),
      type,
      lots: getNum('lots'),
      symbol: get('symbol'),
      opening_price: getNum('opening_price'),
      closing_price: getNum('closing_price'),
      stop_loss: getNumOrNull('stop_loss'),
      take_profit: getNumOrNull('take_profit'),
      commission: getNum('commission'),
      swap: getNum('swap'),
      close_reason: get('close_reason'),
    });
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}
```

- [ ] **Step 2: Write tests for the parser**

Create `src/lib/csvParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseCsvRows } from './csvParser';

const SAMPLE_CSV = `ticket,opening_time_utc,closing_time_utc,type,lots,original_position_size,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,profit,equity,margin_level,close_reason
421790567,2026-08-14T09:19:24,2026-08-14T10:31:25,buy,0.01,0.01,XAUUSDc,4349.4,4349.896,4349.896,4361.814,,,0.5,,,sl
420110897,2026-08-13T14:17:46,2026-08-13T14:30:13,sell,0.01,0.01,XAUUSDc,4375.383,4362.796,4389.881,4362.796,,,12.6,,,tp`;

describe('parseCsvRows', () => {
  it('parses a valid CSV into rows', () => {
    const rows = parseCsvRows(SAMPLE_CSV);
    expect(rows).toHaveLength(2);
  });

  it('maps fields correctly', () => {
    const rows = parseCsvRows(SAMPLE_CSV);
    const r = rows[0];
    expect(r.ticket).toBe('421790567');
    expect(r.type).toBe('buy');
    expect(r.lots).toBe(0.01);
    expect(r.symbol).toBe('XAUUSDc');
    expect(r.opening_price).toBe(4349.4);
    expect(r.closing_price).toBe(4349.896);
    expect(r.commission).toBe(0);
    expect(r.swap).toBe(0);
    expect(r.close_reason).toBe('sl');
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseCsvRows('a,b,c\n')).toHaveLength(0);
  });

  it('throws on missing required column', () => {
    expect(() => parseCsvRows('ticket,symbol\n')).toThrow('Missing required column');
  });

  it('skips rows with invalid type', () => {
    const csv = 'ticket,type,lots,symbol,opening_price,closing_price,opening_time_utc,closing_time_utc,commission,swap,close_reason\n1,invalid,0.01,XAUUSD,100,101,2026-01-01T00:00:00,2026-01-01T01:00:00,0,0,tp';
    expect(parseCsvRows(csv)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All tests pass including new csvParser tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/csvParser.ts src/lib/csvParser.test.ts
git commit -m "feat: add CSV parser for trade import"
```

---

### Task 2: Instrument Resolution + TradeDraft Mapping

**Files:**
- Modify: `src/lib/csvParser.ts`
- Modify: `src/lib/csvParser.test.ts`

**Interfaces:**
- Produces: `resolveInstrument(symbol: string): InstrumentDraft`
- Produces: `csvRowToTradeDraft(row, accountId, instrumentId): TradeDraft`
- Produces: `csvRowToFills(row): FillRow[]`

- [ ] **Step 1: Add instrument resolution and trade mapping functions**

Append to `src/lib/csvParser.ts`:

```typescript
import { TradeDraft } from '../db/database';
import { AssetClass } from '../db/schema';

export type InstrumentDraft = {
  symbol: string;         // clean symbol (c suffix stripped)
  name: string | null;
  asset_class: AssetClass;
  quote_currency: string;
  price_mode: 'standard' | 'cents';
  contract_size: number;
  tick_size: number | null;
};

const FOREX_PREFIXES = ['EUR', 'GBP', 'USD', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD'];
const CRYPTO_PREFIXES = ['BTC', 'ETH', 'SOL', 'DOGE', 'ADA', 'XRP', 'BNB', 'DOT', 'AVAX', 'MATIC'];
const METAL_SYMBOLS = ['XAU', 'XAG', 'XPT', 'XPD'];

export function resolveInstrument(rawSymbol: string): InstrumentDraft {
  const isCents = rawSymbol.toLowerCase().endsWith('c');
  const clean = isCents ? rawSymbol.slice(0, -1) : rawSymbol;
  const upper = clean.toUpperCase();

  let assetClass: AssetClass = 'equity';
  if (METAL_SYMBOLS.some(m => upper.startsWith(m))) {
    assetClass = 'gold';
  } else if (FOREX_PREFIXES.some(p => upper.startsWith(p)) && upper.length >= 6) {
    assetClass = 'forex';
  } else if (CRYPTO_PREFIXES.some(p => upper.startsWith(p))) {
    assetClass = 'crypto';
  }

  let quoteCurrency = 'USD';
  if (assetClass === 'forex' && upper.length >= 6) {
    quoteCurrency = upper.slice(3, 6);
  }

  return {
    symbol: upper,
    name: null,
    asset_class: assetClass,
    quote_currency: quoteCurrency,
    price_mode: isCents ? 'cents' : 'standard',
    contract_size: 1,
    tick_size: null,
  };
}

export type FillRow = {
  side: 'entry' | 'exit';
  price: number;
  quantity: number;
  note: string | null;
  occurred_at: string;
};

export function csvRowToTradeDraft(
  row: CsvTradeRow,
  accountId: number,
  instrumentId: number,
): Omit<TradeDraft, 'strategy_id' | 'emotion_id' | 'trade_style' | 'entry_condition' | 'exit_condition' | 'followed_rules' | 'notes' | 'reflection'> & { exit_condition: string | null; notes: string | null } {
  return {
    account_id: accountId,
    instrument_id: instrumentId,
    direction: row.type === 'buy' ? 'long' : 'short',
    status: 'closed',
    entry_price: row.opening_price,
    exit_price: row.closing_price,
    size: row.lots,
    stop_loss: row.stop_loss,
    take_profit: row.take_profit,
    entry_at: row.opening_time_utc,
    exit_at: row.closing_time_utc,
    fees: row.commission + row.swap,
    exit_condition: row.close_reason || null,
    notes: `MT5 ticket: ${row.ticket}`,
  };
}

export function csvRowToFills(row: CsvTradeRow): FillRow[] {
  return [
    {
      side: 'entry',
      price: row.opening_price,
      quantity: row.lots,
      note: null,
      occurred_at: row.opening_time_utc,
    },
    {
      side: 'exit',
      price: row.closing_price,
      quantity: row.lots,
      note: null,
      occurred_at: row.closing_time_utc,
    },
  ];
}
```

- [ ] **Step 2: Add tests for instrument resolution and mapping**

Append to `src/lib/csvParser.test.ts`:

```typescript
import { resolveInstrument, csvRowToTradeDraft, csvRowToFills } from './csvParser';

describe('resolveInstrument', () => {
  it('resolves XAUUSDc as gold cents', () => {
    const inst = resolveInstrument('XAUUSDc');
    expect(inst.symbol).toBe('XAUUSD');
    expect(inst.asset_class).toBe('gold');
    expect(inst.price_mode).toBe('cents');
    expect(inst.quote_currency).toBe('USD');
  });

  it('resolves EURUSD as forex standard', () => {
    const inst = resolveInstrument('EURUSD');
    expect(inst.symbol).toBe('EURUSD');
    expect(inst.asset_class).toBe('forex');
    expect(inst.price_mode).toBe('standard');
    expect(inst.quote_currency).toBe('USD');
  });

  it('resolves BTCUSD as crypto', () => {
    const inst = resolveInstrument('BTCUSD');
    expect(inst.asset_class).toBe('crypto');
  });

  it('resolves AAPL as equity', () => {
    const inst = resolveInstrument('AAPL');
    expect(inst.asset_class).toBe('equity');
  });
});

describe('csvRowToFills', () => {
  it('creates entry and exit fills', () => {
    const rows = parseCsvRows(SAMPLE_CSV);
    const fills = csvRowToFills(rows[0]);
    expect(fills).toHaveLength(2);
    expect(fills[0].side).toBe('entry');
    expect(fills[0].price).toBe(4349.4);
    expect(fills[1].side).toBe('exit');
    expect(fills[1].price).toBe(4349.896);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/csvParser.ts src/lib/csvParser.test.ts
git commit -m "feat: add instrument resolution and trade mapping for CSV import"
```

---

### Task 3: Transactional DB Import Function

**Files:**
- Modify: `src/db/database.ts`

**Interfaces:**
- Consumes: `InstrumentDraft`, `CsvTradeRow` from `csvParser`
- Produces: `importTradesFromCsv(db, rows, accountId): Promise<{ imported: number; symbols: number }>`

- [ ] **Step 1: Add the transactional import function**

Append to `src/db/database.ts` (after existing instrument/trade helpers):

```typescript
import { InstrumentDraft, CsvTradeRow, resolveInstrument, csvRowToTradeDraft, csvRowToFills, FillRow } from '../lib/csvParser';

export async function importTradesFromCsv(
  db: SQLiteDatabase,
  rows: CsvTradeRow[],
  accountId: number,
): Promise<{ imported: number; symbols: number }> {
  let imported = 0;
  let symbols = 0;

  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const draft = resolveInstrument(row.symbol);

      // Find or create instrument
      let instrument = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM instruments WHERE symbol = ? AND asset_class = ?',
        [draft.symbol, draft.asset_class],
      );
      if (!instrument) {
        const result = await db.runAsync(
          `INSERT INTO instruments (symbol, name, asset_class, quote_currency, price_mode, contract_size, tick_size)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [draft.symbol, draft.name, draft.asset_class, draft.quote_currency, draft.price_mode, draft.contract_size, draft.tick_size],
        );
        instrument = { id: result.lastInsertRowId };
        symbols++;
      }

      // Insert trade
      const tradeDraft = csvRowToTradeDraft(row, accountId, instrument.id);
      const tradeResult = await db.runAsync(
        `INSERT INTO trades
          (account_id, instrument_id, strategy_id, emotion_id,
           trade_style, entry_condition, exit_condition,
           direction, status, entry_price, exit_price, size,
           stop_loss, take_profit, entry_at, exit_at,
           fees, followed_rules, notes, reflection)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tradeDraft.account_id,
          tradeDraft.instrument_id,
          null, // strategy_id
          null, // emotion_id
          null, // trade_style
          null, // entry_condition
          tradeDraft.exit_condition,
          tradeDraft.direction,
          tradeDraft.status,
          tradeDraft.entry_price,
          tradeDraft.exit_price,
          tradeDraft.size,
          tradeDraft.stop_loss,
          tradeDraft.take_profit,
          tradeDraft.entry_at,
          tradeDraft.exit_at,
          tradeDraft.fees,
          null, // followed_rules
          tradeDraft.notes,
          null, // reflection
        ],
      );
      const tradeId = tradeResult.lastInsertRowId;

      // Insert fills
      const fills = csvRowToFills(row);
      for (let i = 0; i < fills.length; i++) {
        const f = fills[i];
        await db.runAsync(
          `INSERT INTO trade_fills (trade_id, side, price, quantity, note, occurred_at, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [tradeId, f.side, f.price, f.quantity, f.note, f.occurred_at, i],
        );
      }

      imported++;
    }
  });

  return { imported, symbols };
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All existing tests pass (no new test for DB function — integration tested via UI).

- [ ] **Step 4: Commit**

```bash
git add src/db/database.ts
git commit -m "feat: add transactional CSV import function"
```

---

### Task 4: UI — Import Button + Summary Modal + Flow

**Files:**
- Modify: `app/(tabs)/trades.tsx`

**Interfaces:**
- Consumes: `importTradesFromCsv` from `database.ts`, `parseCsvRows` from `csvParser.ts`
- Consumes: `useTrades().refetch` for refreshing list after import

- [ ] **Step 1: Add imports and state to trades.tsx**

At the top of `app/(tabs)/trades.tsx`, add:

```typescript
import * as DocumentPicker from 'expo-document-picker';
import { parseCsvRows } from '../../src/lib/csvParser';
import { importTradesFromCsv } from '../../src/db/database';
import { getFirstAccount } from '../../src/db/database';
```

Inside the `TradesTab` component, add state (near existing state declarations around line 357):

```typescript
const [importing, setImporting] = useState(false);
const [importSummary, setImportSummary] = useState<{ count: number; symbols: string[] } | null>(null);
const [pendingCsv, setPendingCsv] = useState<string | null>(null);
```

- [ ] **Step 2: Add the import handler function**

Add inside the component, after state declarations:

```typescript
const handleImport = async () => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'text/csv',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const fileUri = result.assets[0].uri;
    const response = await fetch(fileUri);
    const csvText = await response.text();
    const rows = parseCsvRows(csvText);

    if (rows.length === 0) {
      Alert.alert('No Trades Found', 'The CSV file contains no valid trade rows.');
      return;
    }

    const uniqueSymbols = [...new Set(rows.map(r => r.symbol))];
    setPendingCsv(csvText);
    setImportSummary({ count: rows.length, symbols: uniqueSymbols });
  } catch (e) {
    Alert.alert('Parse Error', e instanceof Error ? e.message : 'Failed to parse CSV.');
  }
};

const confirmImport = async () => {
  if (!pendingCsv) return;
  setImporting(true);
  setImportSummary(null);
  try {
    const rows = parseCsvRows(pendingCsv);
    const account = await getFirstAccount(db);
    if (!account) throw new Error('No account found.');

    const result = await importTradesFromCsv(db, rows, account.id);
    setPendingCsv(null);
    await refetch();
    Alert.alert('Import Complete', `${result.imported} trades imported across ${result.symbols} new symbols.`);
  } catch (e) {
    Alert.alert('Import Failed', e instanceof Error ? e.message : 'An error occurred during import.');
  } finally {
    setImporting(false);
  }
};
```

- [ ] **Step 3: Add the import button to the header**

Find the header section (around line 485-510 in the current file) and add an import button. The header currently has the title "Trades". Add an icon button to the right:

```tsx
<View className="flex-row justify-between items-center px-4 pt-4 pb-2 bg-dark-bg">
  <Text className="text-2xl font-black text-dark-text">Trades</Text>
  <View className="flex-row items-center gap-x-3">
    {importing && <ActivityIndicator size="small" color="#00E68A" />}
    <Pressable
      onPress={handleImport}
      disabled={importing}
      className="w-10 h-10 rounded-xl bg-[#1a1b24] border border-[#2b2d3a] items-center justify-center"
    >
      <Ionicons name="cloud-upload-outline" size={20} color={importing ? '#3e3b4b' : '#6b6880'} />
    </Pressable>
  </View>
</View>
```

- [ ] **Step 4: Add the summary modal**

Add before the closing `</KeyboardAvoidingView>` tag:

```tsx
{importSummary && (
  <View className="absolute inset-0 bg-black/60 items-center justify-center z-50">
    <View className="bg-[#1a1b24] border border-[#2b2d3a] rounded-2xl p-6 mx-8 w-full">
      <View className="items-center mb-4">
        <View className="w-12 h-12 rounded-full bg-[#2d7df6]/10 items-center justify-center mb-3">
          <Ionicons name="cloud-upload" size={24} color="#2d7df6" />
        </View>
        <Text className="text-white font-bold text-lg text-center">Import Trades</Text>
      </View>
      <Text className="text-[#8B92A5] text-sm text-center mb-2">
        {importSummary.count} trades found
      </Text>
      <Text className="text-[#6b6880] text-xs text-center mb-5">
        Symbols: {importSummary.symbols.join(', ')}
      </Text>
      <View className="flex-row gap-x-3">
        <Pressable
          onPress={() => { setImportSummary(null); setPendingCsv(null); }}
          className="flex-1 py-3 rounded-xl bg-[#13141a] border border-[#2b2d3a] items-center"
        >
          <Text className="text-[#6b6880] font-bold">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={confirmImport}
          className="flex-1 py-3 rounded-xl bg-[#2d7df6] items-center"
        >
          <Text className="text-white font-bold">Import</Text>
        </Pressable>
      </View>
    </View>
  </View>
)}
```

- [ ] **Step 5: Add Alert import if not already present**

Check if `Alert` is imported from `react-native`. If not, add it to the existing import:

```typescript
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, Pressable, ScrollView, KeyboardAvoidingView, Platform, Keyboard, Alert,
} from 'react-native';
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 7: Run tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add "app/(tabs)/trades.tsx"
git commit -m "feat: add CSV import button and summary modal to trades screen"
```
