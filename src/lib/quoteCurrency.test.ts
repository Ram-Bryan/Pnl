import { describe, it, expect } from 'vitest';
import { inferQuoteCurrency } from './quoteCurrency';

describe('inferQuoteCurrency', () => {
  it('infers the quote leg of a 6-letter currency pair', () => {
    expect(inferQuoteCurrency('USDJPY')).toBe('JPY');
    expect(inferQuoteCurrency('EURUSD')).toBe('USD');
    expect(inferQuoteCurrency('GBPUSD')).toBe('USD');
    expect(inferQuoteCurrency('EURGBP')).toBe('GBP');
  });
  it('is case- and whitespace-insensitive', () => {
    expect(inferQuoteCurrency('usdjpy')).toBe('JPY');
    expect(inferQuoteCurrency('  EURUSD  ')).toBe('USD');
  });
  it('returns null for non-6-letter symbols', () => {
    expect(inferQuoteCurrency('AAPL')).toBeNull();
    expect(inferQuoteCurrency('')).toBeNull();
  });
  it('recognises USD quotes on 6-letter commodity/crypto symbols', () => {
    expect(inferQuoteCurrency('BTCUSD')).toBe('USD');
    expect(inferQuoteCurrency('XAUUSD')).toBe('USD');
  });
  it('returns null when the suffix is not a known currency', () => {
    expect(inferQuoteCurrency('ABCXYZ')).toBeNull();
  });
});
