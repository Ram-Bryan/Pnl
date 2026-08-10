import { describe, it, expect } from 'vitest';
import { formatPnl, formatMoney, formatPrice, capitalize } from './format';

describe('formatPnl', () => {
  it('formats standard values assuming input is Cents (divides by 100)', () => {
    // 140 cents -> $1.40
    expect(formatPnl(140)).toBe('$1.40');
    expect(formatPnl(-140)).toBe('$1.40');
  });
  it('abbreviates large standard values with k', () => {
    // 135,000 cents -> $1,350 -> $1.4k
    expect(formatPnl(135000)).toBe('$1.4k');
  });
  it('treats sub-cent standard as zero', () => {
    // 0.1 cents -> $0.00
    expect(formatPnl(-0.1)).toBe('$0.00');
  });
  it('displays native value in USC when Cents mode', () => {
    // 0.1015 base units -> 0.10 USC
    expect(formatPnl(-0.1015, 'cents')).toBe('0.10 USC');
  });
  it('abbreviates large USC values with k', () => {
    expect(formatPnl(1450, 'cents')).toBe('1.4k USC');
  });
  it('scales down by 100 for USD (standard) mode', () => {
    // 18,000 base units -> $180
    expect(formatPnl(18000, 'standard')).toBe('$180.00');
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
