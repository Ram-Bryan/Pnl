import { TradeDraft } from '../db/database';
import { AssetClass } from '../db/schema';

export type CsvTradeRow = {
  kind: 'open' | 'closed';
  ticket: string;
  opening_time_utc: string;
  closing_time_utc: string | null;
  type: 'buy' | 'sell';
  lots: number;
  symbol: string;
  opening_price: number;
  closing_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  commission: number;
  swap: number | null;
  close_reason: string | null;
};

export function parseCsvRows(csv: string): CsvTradeRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const sizeCol = headers.includes('lots') ? 'lots' : 'original_position_size';

  // Auto-detect which MT5 export this is: a history report has closing
  // columns; an open-positions report has only opening columns.
  const isClosed = headers.includes('closing_time_utc') && headers.includes('closing_price');
  const isOpen =
    !isClosed &&
    headers.includes('opening_time_utc') &&
    headers.includes('opening_price') &&
    headers.includes('type') &&
    headers.includes('symbol') &&
    headers.includes(sizeCol);
  if (!isClosed && !isOpen) {
    throw new Error('Missing required column');
  }
  const kind = isClosed ? 'closed' : 'open';

  const required = isClosed
    ? ['ticket', 'opening_time_utc', 'closing_time_utc', 'type', sizeCol,
       'symbol', 'opening_price', 'closing_price', 'commission', 'swap', 'close_reason']
    : ['ticket', 'opening_time_utc', 'type', sizeCol, 'symbol', 'opening_price', 'commission'];
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

    const type = get('type').toLowerCase();
    if (type !== 'buy' && type !== 'sell') continue;

    const closingPrice = isClosed ? parsePrice(get('closing_price')) : null;
    const closingTime = isClosed ? normalizeImportedDateTime(get('closing_time_utc')) : null;
    // A closed row must carry its exit data; otherwise it can't be priced and
    // would silently vanish from stats — skip it instead.
    if (isClosed && (closingPrice === null || !closingTime)) continue;

    rows.push({
      kind,
      ticket: get('ticket'),
      opening_time_utc: normalizeImportedDateTime(get('opening_time_utc')),
      closing_time_utc: closingTime,
      type,
      lots: getNum(sizeCol),
      symbol: get('symbol'),
      opening_price: parsePrice(get('opening_price')) ?? 0,
      closing_price: closingPrice,
      stop_loss: parsePrice(get('stop_loss')),
      take_profit: parsePrice(get('take_profit')),
      commission: getNum('commission'),
      swap: isClosed ? getNum('swap') : null,
      close_reason: isClosed ? get('close_reason') : null,
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

// ─── Instrument Resolution ────────────────────────────────────────────────────

export type InstrumentDraft = {
  symbol: string;
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

// MT5 contract sizes are per asset class (units per 1.0 lot) and are the same
// on cent accounts. Contract size drives P&L magnitude, so a wrong default here
// silently makes every imported trade's P&L wrong (e.g. forex at 1 instead of
// 100000).
export function defaultContractSizeFor(assetClass: AssetClass): number {
  if (assetClass === 'forex') return 100000;
  if (assetClass === 'gold') return 100;
  return 1;
}

function contractSizeFor(assetClass: AssetClass, upper: string): number {
  if (assetClass === 'gold' && upper.startsWith('XAG')) return 5000;
  return defaultContractSizeFor(assetClass);
}

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
    contract_size: contractSizeFor(assetClass, upper),
    tick_size: null,
  };
}

// MT5 history exports timestamps as "2024.08.14 09:19:24" (dot separators). The
// CSV is the source of truth: keep the wall-clock time exactly as exported
// (server/UTC), only normalizing the format to the app's naive ISO shape
// (YYYY-MM-DDTHH:mm:ss). No timezone conversion — the stored value must match the
// CSV, and day buckets are derived in UTC.
export function normalizeImportedDateTime(value: string): string {
  const v = value.trim();
  if (!v) return v;
  return v
    .replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3')
    .replace(' ', 'T');
}

// Prices round-trip to ≤6 decimals with trailing zeros trimmed; MT5 exports at
// most 6 significant decimals, so this never changes the CSV's value but keeps
// binary floats from leaking garbage like 1.3514599999999999.
const parsePrice = (raw: string): number | null => {
  const v = raw.trim();
  if (!v) return null;
  return Number(parseFloat(v).toFixed(6));
};

// ─── Trade Mapping ────────────────────────────────────────────────────────────

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
) {
  return {
    account_id: accountId,
    instrument_id: instrumentId,
    direction: (row.type === 'buy' ? 'long' : 'short') as 'long' | 'short',
    status: (row.kind === 'open' ? 'open' : 'closed') as 'open' | 'closed',
    entry_price: row.opening_price,
    exit_price: row.closing_price,
    size: row.lots,
    stop_loss: row.stop_loss,
    take_profit: row.take_profit,
    entry_at: row.opening_time_utc,
    exit_at: row.closing_time_utc,
    fees: row.commission + (row.swap ?? 0),
    exit_condition: row.close_reason || null,
    notes: null,
    ticket: row.ticket.trim() || null,
    strategy_id: null,
    emotion_id: null,
    trade_style: null,
    entry_condition: null,
    followed_rules: null,
    reflection: null,
  };
}

export function csvRowToFills(row: CsvTradeRow): FillRow[] {
  const fills: FillRow[] = [
    {
      side: 'entry',
      price: row.opening_price,
      quantity: row.lots,
      note: null,
      occurred_at: row.opening_time_utc,
    },
  ];
  // Open positions have no exit yet.
  if (row.kind === 'closed' && row.closing_price != null && row.closing_time_utc) {
    fills.push({
      side: 'exit',
      price: row.closing_price,
      quantity: row.lots,
      note: null,
      occurred_at: row.closing_time_utc,
    });
  }
  return fills;
}
