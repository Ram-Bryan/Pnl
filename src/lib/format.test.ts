import { describe, it, expect } from 'vitest';
import { formatPnl, formatMoney, formatPrice, capitalize } from './format';

describe('formatPnl', () => {
  it('formats standard values as real USD', () => {
    expect(formatPnl(1.4)).toBe('$1.40');
    expect(formatPnl(-1.4)).toBe('$1.40');
  });
  it('abbreviates large standard values with k', () => {
    expect(formatPnl(1350)).toBe('$1.4k');
  });
  it('shows sub-cent USD with 3 decimals', () => {
    expect(formatPnl(0.001)).toBe('$0.001');
    expect(formatPnl(-0.0010155)).toBe('$0.001');
  });
  it('shows sub-milli USD with 4 decimals', () => {
    expect(formatPnl(0.0005)).toBe('$0.0005');
  });
  it('displays USC as value times 100', () => {
    expect(formatPnl(-0.0010155, 'usc')).toBe('0.10 USC');
  });
  it('abbreviates large USC values with k', () => {
    expect(formatPnl(14.5, 'usc')).toBe('1.4k USC');
  });
  it('shows 2 decimals below 1000 USC', () => {
    expect(formatPnl(1.8, 'usc')).toBe('180.00 USC');
  });
});

describe('formatMoney', () => {
  it('formats without sign', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
  });
});

describe('formatPrice', () => {
  it('shows up to 6 decimals without padding or extra rounding', () => {
    expect(formatPrice(157.536)).toBe('157.536');
    expect(formatPrice(1.35146)).toBe('1.35146');
    expect(formatPrice(1.23456)).toBe('1.23456');
    expect(formatPrice(1234.5)).toBe('1234.5');
    expect(formatPrice(100)).toBe('100');
  });
});

describe('capitalize', () => {
  it('capitalizes first letter only', () => {
    expect(capitalize('intraday')).toBe('Intraday');
  });
});
