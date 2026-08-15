import { describe, it, expect } from 'vitest';
import { parseCsvRows, resolveInstrument, csvRowToFills, csvRowToTradeDraft, normalizeImportedDateTime, defaultContractSizeFor } from './csvParser';

const SAMPLE_CSV = `ticket,opening_time_utc,closing_time_utc,type,lots,original_position_size,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,profit,equity,margin_level,close_reason
421790567,2026-08-14T09:19:24,2026-08-14T10:31:25,buy,0.01,0.01,XAUUSDc,4349.4,4349.896,4349.896,4361.814,,,0.5,,,sl
420110897,2026-08-13T14:17:46,2026-08-13T14:30:13,sell,0.01,0.01,XAUUSDc,4375.383,4362.796,4389.881,4362.796,,,12.6,,,tp`;

const OPEN_SAMPLE = `ticket,opening_time_utc,type,original_position_size,symbol,opening_price,commission
422398499,2026-08-14T15:00:34,sell,0.01,XAUUSDc,4383.649,
422399028,2026-08-14T14:53:09,sell,0.01,XAUUSDc,4382.318,`;

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
    expect(r.profit).toBe(0.5);
  });

  it('parses profit as null when the column is empty or absent', () => {
    const rows = parseCsvRows(`ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price,commission,swap,close_reason,profit
1,2026-08-14T09:19:24,2026-08-14T10:31:25,buy,0.01,XAUUSDc,4349.4,4349.896,0,0,tp,`);
    expect(rows[0].profit).toBeNull();
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseCsvRows('a,b,c\n')).toHaveLength(0);
  });

  it('throws on missing required column', () => {
    expect(() => parseCsvRows('ticket,symbol\n1,AAPL')).toThrow('Missing required column');
  });

  it('skips rows with invalid type', () => {
    const csv = 'ticket,type,lots,symbol,opening_price,closing_price,opening_time_utc,closing_time_utc,commission,swap,close_reason\n1,invalid,0.01,XAUUSD,100,101,2026-01-01T00:00:00,2026-01-01T01:00:00,0,0,tp';
    expect(parseCsvRows(csv)).toHaveLength(0);
  });
});

describe('resolveInstrument', () => {
  it('resolves XAUUSDc as gold cents', () => {
    const inst = resolveInstrument('XAUUSDc');
    expect(inst.symbol).toBe('XAUUSD');
    expect(inst.asset_class).toBe('gold');
    expect(inst.price_mode).toBe('cents');
    expect(inst.quote_currency).toBe('USD');
  });

  it('sets MT5 contract sizes per asset class', () => {
    expect(resolveInstrument('EURUSD').contract_size).toBe(100000);
    expect(resolveInstrument('USDJPY').contract_size).toBe(100000);
    expect(resolveInstrument('XAUUSD').contract_size).toBe(100);
    expect(resolveInstrument('XAGUSD').contract_size).toBe(5000);
    expect(resolveInstrument('BTCUSD').contract_size).toBe(1);
    expect(resolveInstrument('AAPL').contract_size).toBe(1);
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

describe('defaultContractSizeFor', () => {
  it('returns per-asset-class MT5 defaults (shared with the quick-add symbol form)', () => {
    expect(defaultContractSizeFor('forex')).toBe(100000);
    expect(defaultContractSizeFor('gold')).toBe(100);
    expect(defaultContractSizeFor('equity')).toBe(1);
    expect(defaultContractSizeFor('crypto')).toBe(1);
  });
});

describe('normalizeImportedDateTime', () => {
  it('converts MT5 dot format to ISO date/time', () => {
    const out = normalizeImportedDateTime('2024.08.14 09:19:24');
    expect(out).toBe('2024-08-14T09:19:24');
  });

  it('returns the CSV wall-clock time verbatim (no UTC→local conversion)', () => {
    // The CSV is the source of truth: the stored value must match the export,
    // not the device's local wall time.
    expect(normalizeImportedDateTime('2026-08-14T09:19:24')).toBe('2026-08-14T09:19:24');
    expect(normalizeImportedDateTime('2024.08.14 09:19:24')).toBe('2024-08-14T09:19:24');
  });

  it('normalizes parsed rows to ISO day buckets', () => {
    const rows = parseCsvRows(`ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price,commission,swap,close_reason
1,2024.08.14 09:19:24,2024.08.14 10:31:25,buy,0.01,XAUUSD,100,101,0,0,tp`);
    expect(rows[0].opening_time_utc.slice(0, 10)).toBe('2024-08-14');
    expect(rows[0].opening_time_utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('leaves unparseable values untouched', () => {
    expect(normalizeImportedDateTime('not-a-date')).toBe('not-a-date');
  });
});

describe('price precision', () => {
  it('parses prices to at most 6 decimals, trimming binary float noise', () => {
    const rows = parseCsvRows(`ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price,commission,swap,close_reason
1,2026-08-14T09:19:24,2026-08-14T10:31:25,buy,0.01,XAUUSD,1.3514599999999999,1.3514599999999999,0,0,tp`);
    expect(rows[0].opening_price).toBe(1.35146);
    expect(rows[0].closing_price).toBe(1.35146);
  });

  it('keeps a full 6-decimal price intact', () => {
    const rows = parseCsvRows(`ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,close_reason
1,2026-08-14T09:19:24,2026-08-14T10:31:25,buy,0.01,XAUUSDc,4349.4,4349.896,4349.896,4361.814,,,sl`);
    expect(rows[0].opening_price).toBe(4349.4);
    expect(rows[0].closing_price).toBe(4349.896);
    expect(rows[0].stop_loss).toBe(4349.896);
    expect(rows[0].take_profit).toBe(4361.814);
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

describe('open-positions format', () => {
  it('parses an open-positions export as open trades', () => {
    const rows = parseCsvRows(OPEN_SAMPLE);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe('open');
    expect(rows[0].lots).toBe(0.01); // sized by original_position_size
    expect(rows[0].symbol).toBe('XAUUSDc');
    expect(rows[0].closing_price).toBeNull();
    expect(rows[0].closing_time_utc).toBeNull();
    expect(rows[0].swap).toBeNull();
    expect(rows[0].close_reason).toBeNull();
    expect(rows[0].commission).toBe(0);
  });

  it('maps an open row to an open trade draft', () => {
    const draft = csvRowToTradeDraft(parseCsvRows(OPEN_SAMPLE)[0], 1, 9);
    expect(draft.status).toBe('open');
    expect(draft.direction).toBe('short');
    expect(draft.entry_price).toBe(4383.649);
    expect(draft.exit_price).toBeNull();
    expect(draft.exit_at).toBeNull();
    expect(draft.fees).toBe(0);
    expect(draft.notes).toBeNull();
    expect(draft.ticket).toBe('422398499');
  });

  it('creates a single entry fill for an open trade', () => {
    const fills = csvRowToFills(parseCsvRows(OPEN_SAMPLE)[0]);
    expect(fills).toHaveLength(1);
    expect(fills[0].side).toBe('entry');
    expect(fills[0].price).toBe(4383.649);
  });

  it('still marks the history export as closed', () => {
    expect(parseCsvRows(SAMPLE_CSV)[0].kind).toBe('closed');
  });

  it('throws for an unrecognized header set', () => {
    expect(() => parseCsvRows('foo,bar\n1,2')).toThrow('Missing required column');
  });
});
