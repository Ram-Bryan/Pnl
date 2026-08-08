import { describe, it, expect } from 'vitest';
import { averageFillPrice, totalQuantity } from './aggregateFills';

describe('averageFillPrice', () => {
  it('computes quantity-weighted average', () => {
    const fills = [
      { price: 100, quantity: 2 },
      { price: 110, quantity: 3 },
    ];
    expect(averageFillPrice(fills)).toBeCloseTo(106);
  });
  it('returns 0 for no fills', () => {
    expect(averageFillPrice([])).toBe(0);
  });
});

describe('totalQuantity', () => {
  it('sums quantities', () => {
    expect(totalQuantity([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
  });
});
