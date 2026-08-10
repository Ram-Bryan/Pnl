import { describe, it, expect } from 'vitest';
import { tradeVolume, computeTradePnlInUsd, computeInvestedUsd } from './tradeMath';

describe('tradeVolume', () => {
  it('scales the position down 100x on a cents account', () => {
    expect(tradeVolume(0.01, 100000, 'cents')).toBe(10);
    expect(tradeVolume(0.01, 100000, 'standard')).toBe(1000);
  });
});

const usdJpy = {
  direction: 'long' as const,
  entryPrice: 157.552,
  exitPrice: 157.536,
  lots: 0.01,
  contractSize: 100000,
  quoteCurrency: 'JPY',
  fees: 0,
};

describe('computeTradePnlInUsd', () => {
  it('matches MT5: USDJPY 0.01 lot on a cents account is ~-0.0010155 USD', () => {
    expect(computeTradePnlInUsd({ ...usdJpy, accountType: 'cents' })).toBeCloseTo(-0.0010155, 6);
  });
  it('is 100x larger on a standard account', () => {
    expect(computeTradePnlInUsd({ ...usdJpy, accountType: 'standard' })).toBeCloseTo(-0.10155, 4);
  });
  it('does not convert when the quote currency is USD', () => {
    const pnl = computeTradePnlInUsd({
      direction: 'long', entryPrice: 1.08, exitPrice: 1.081, lots: 0.1,
      contractSize: 100000, quoteCurrency: 'USD', fees: 0, accountType: 'standard',
    });
    expect(pnl).toBeCloseTo(10, 6);
  });
  it('subtracts fees entered in the display unit (cents fees divided by 100)', () => {
    expect(computeTradePnlInUsd({ ...usdJpy, fees: 0.1, accountType: 'cents' })).toBeCloseTo(-0.0020155, 6);
  });
  it('counts a short as profit when price falls', () => {
    const pnl = computeTradePnlInUsd({
      direction: 'short', entryPrice: 1.1, exitPrice: 1.09, lots: 1,
      contractSize: 100000, quoteCurrency: 'USD', fees: 0, accountType: 'standard',
    });
    expect(pnl).toBeCloseTo(1000, 6);
  });
});

describe('computeInvestedUsd', () => {
  it('uses base volume for USD-based pairs (USDJPY)', () => {
    expect(computeInvestedUsd({ entryPrice: 157.552, lots: 0.01, contractSize: 100000, quoteCurrency: 'JPY', accountType: 'cents' })).toBe(10);
  });
  it('uses entry price x volume for USD-quoted pairs (EURUSD)', () => {
    expect(computeInvestedUsd({ entryPrice: 1.08, lots: 0.1, contractSize: 100000, quoteCurrency: 'USD', accountType: 'standard' })).toBeCloseTo(10800, 4);
  });
});
