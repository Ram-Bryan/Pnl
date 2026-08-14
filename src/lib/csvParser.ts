import { TradeDraft } from '../db/database';
import { AssetClass } from '../db/schema';

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
    status: 'closed' as const,
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
    strategy_id: null,
    emotion_id: null,
    trade_style: null,
    entry_condition: null,
    followed_rules: null,
    reflection: null,
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
