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
  it('converts JPY P&L to USD at the exit rate, not the entry rate', () => {
    const atEntry = computeTradePnlInUsd({
      ...usdJpy,
      entryPrice: 157.552,
      exitPrice: 157.536,
      accountType: 'cents',
    });
    expect(atEntry).toBeCloseTo(-0.16 / 157.536, 6);
    const atExit = computeTradePnlInUsd({
      ...usdJpy,
      direction: 'short',
      entryPrice: 157.536,
      exitPrice: 157.552,
      accountType: 'cents',
    });
    expect(atExit).toBeCloseTo(-0.16 / 157.552, 6);
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

describe('MT5 history verification cases (cent account, USC display)', () => {
  const cases: { name: string; direction: 'long' | 'short'; entry: number; exit: number; lots: number; cents: number }[] = [
    { name: 'USDJPYc SELL 0.01', direction: 'short', entry: 157.536, exit: 157.552, lots: 0.01, cents: -0.10 },
    { name: 'EURUSDc BUY 0.01', direction: 'long', entry: 1.15517, exit: 1.15532, lots: 0.01, cents: 0.15 },
    { name: 'EURUSDc BUY 0.51', direction: 'long', entry: 1.15531, exit: 1.15547, lots: 0.51, cents: 8.16 },
    { name: 'USDJPYc SELL 0.30', direction: 'short', entry: 157.469, exit: 157.519, lots: 0.30, cents: -9.52 },
  ];

  cases.forEach(({ name, direction, entry, exit, lots, cents }) => {
    it(`matches MT5: ${name} -> ${cents} USC`, () => {
      const quoteCurrency = name.startsWith('USDJPYc') ? 'JPY' : 'USD';
      const usd = computeTradePnlInUsd({ direction, entryPrice: entry, exitPrice: exit, lots, contractSize: 100000, quoteCurrency, fees: 0, accountType: 'cents' });
      expect(usd * 100).toBeCloseTo(cents, 2);
    });
  });

  it('matches MT5: XAUUSDc BUY 0.01 -> 0.50 USC (gold contract = 100 oz/lot)', () => {
    // Report value for XAUUSDc 0.01 lot, +0.496 move: profit 0.50 USC.
    const usd = computeTradePnlInUsd({ direction: 'long', entryPrice: 4349.4, exitPrice: 4349.896, lots: 0.01, contractSize: 100, quoteCurrency: 'USD', fees: 0, accountType: 'cents' });
    expect(usd * 100).toBeCloseTo(0.50, 2);
  });
});
