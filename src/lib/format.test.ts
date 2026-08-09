import { describe, it, expect } from 'vitest';
import { formatPnl, formatMoney, formatPrice, capitalize } from './format';

describe('formatPnl', () => {
  it('formats standard values absolutely (color signals direction, not sign)', () => {
    expect(formatPnl(140)).toBe('$140.00');
    expect(formatPnl(-140)).toBe('$140.00');
  });
  it('abbreviates large standard values with k', () => {
    expect(formatPnl(1284.5)).toBe('$1.3k');
  });
  it('treats sub-cent standard as zero', () => {
    expect(formatPnl(-0.001)).toBe('$0.00');
  });
  it('formats cents account correctly in USC', () => {
    // -0.001015 USD * 100 = 0.1015 USC → rounds to 0.10
    expect(formatPnl(-0.001015, 'cents')).toBe('0.10 USC');
  });
  it('abbreviates large USC values with k', () => {
    // 14.5 USD * 100 = 1450 USC → 1.4k
    expect(formatPnl(14.5, 'cents')).toBe('1.4k USC');
  });
});

describe('formatMoney', () => {
  it('formats without sign', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
  });
});

describe('formatPrice', () => {
  it('trims trailing zeros to at most 4 decimals', () => {
    expect(formatPrice(1234.5)).toBe('1234.5');
    expect(formatPrice(1.23456)).toBe('1.2346');
    expect(formatPrice(100)).toBe('100');
  });
});

describe('capitalize', () => {
  it('capitalizes first letter only', () => {
    expect(capitalize('intraday')).toBe('Intraday');
  });
});
