import { describe, it, expect } from 'vitest';
import { formatPnl, formatMoney, formatPrice, capitalize } from './format';

describe('formatPnl', () => {
  it('formats positive with plus sign', () => {
    expect(formatPnl(1284.5)).toBe('+$1,284.50');
  });
  it('formats negative with minus sign', () => {
    expect(formatPnl(-140)).toBe('-$140.00');
  });
  it('treats sub-cent as zero, displayed positive', () => {
    expect(formatPnl(-0.001)).toBe('+$0.00');
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
