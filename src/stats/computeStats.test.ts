import { describe, it, expect } from 'vitest';
import { computeStats, computeTradePnl } from './computeStats';
import type { TradeWithInstrument } from './computeStats';
import { formatPnl } from '../lib/format';

function makeTrade(overrides: Partial<TradeWithInstrument>): TradeWithInstrument {
  return {
    id: 1, account_id: 1, instrument_id: 1, strategy_id: null, emotion_id: null,
    trade_style: null, entry_condition: null, exit_condition: null,
    direction: 'long', status: 'closed', entry_price: 100, exit_price: 101,
    size: 1, stop_loss: null, take_profit: null,
    entry_at: '2026-08-01T10:00:00', exit_at: '2026-08-01T11:00:00',
    fees: 0, followed_rules: null, notes: null, reflection: null, ticket: null,
    created_at: '2026-08-01T10:00:00', updated_at: '2026-08-01T11:00:00',
    symbol: 'TEST', instrument_name: null, quote_currency: 'USD',
    price_mode: 'standard', contract_size: 100, asset_class: 'equity',
    strategy_name: null, emotion_name: null,
    ...overrides,
  };
}

describe('computeStats', () => {
  it('sizes each trade by its own price_mode', () => {
    const standard = makeTrade({ id: 1, price_mode: 'standard' });
    const cents = makeTrade({ id: 2, size: 2, price_mode: 'cents' });
    // standard: 1 lot × 100 contract × 1 = 100; cents: 2 × 100 × 0.01 = 2
    expect(computeTradePnl(standard)).toBeCloseTo(100, 6);
    expect(computeTradePnl(cents)).toBeCloseTo(2, 6);
    expect(computeStats([standard, cents]).allTimePnl).toBeCloseTo(102, 6);
  });

  it('derives totals, win rate and streak from recent results', () => {
    const trades = [
      makeTrade({ id: 1, entry_price: 100, exit_price: 101 }),
      makeTrade({ id: 2, entry_price: 100, exit_price: 99, exit_at: '2026-08-02T11:00:00' }),
      makeTrade({ id: 3, entry_price: 100, exit_price: 99, exit_at: '2026-08-03T11:00:00' }),
    ];
    const stats = computeStats(trades);
    expect(stats.totalTrades).toBe(3);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(2);
    expect(stats.winRate).toBeCloseTo(33.33, 1);
    expect(stats.currentStreak).toBe(-2);
  });

  it('treats a zero-P&L trade as ending the current streak, not a win', () => {
    const trades = [
      makeTrade({ id: 1, entry_price: 100, exit_price: 101 }),
      makeTrade({ id: 2, entry_price: 100, exit_price: 101, exit_at: '2026-08-02T11:00:00' }),
      makeTrade({ id: 3, entry_price: 100, exit_price: 100, exit_at: '2026-08-03T11:00:00' }),
    ];
    const stats = computeStats(trades);
    expect(stats.currentStreak).toBe(0);
  });
});

describe('computeTradePnl', () => {
  it('converts JPY to USD even when the stored quote is the generic USD default (short USDJPY 0.01 lot, cents)', () => {
    // MT5: -0.16 JPY / 157.536 = -0.0010155 USD -> -0.10 USC
    const trade = makeTrade({
      symbol: 'USDJPY',
      quote_currency: 'USD',
      price_mode: 'cents',
      direction: 'short',
      entry_price: 157.536,
      exit_price: 157.552,
      size: 0.01,
      contract_size: 100000,
    });
    const pnl = computeTradePnl(trade);
    expect(pnl).toBe(-0.001);
    expect(pnl * 100).toBeCloseTo(-0.10, 2);
  });

  it('respects an explicitly stored non-default quote currency', () => {
    const trade = makeTrade({
      symbol: 'USDJPY',
      quote_currency: 'JPY',
      price_mode: 'cents',
      direction: 'short',
      entry_price: 157.536,
      exit_price: 157.552,
      size: 0.01,
      contract_size: 100000,
    });
    expect(computeTradePnl(trade)).toBe(-0.001);
  });

  it('rounds each trade to the account cent before summing (standard → 2 decimals)', () => {
    const trade = makeTrade({
      price_mode: 'standard',
      entry_price: 100,
      exit_price: 100.1234,
      size: 1,
      contract_size: 1,
    });
    expect(computeTradePnl(trade)).toBe(0.12);
  });

  it('rounds cents-account P&L to 4-decimal USD (the USC cent)', () => {
    const trade = makeTrade({
      price_mode: 'cents',
      entry_price: 100,
      exit_price: 100.12345,
      size: 1,
      contract_size: 100, // 1 lot × 100 contract × 0.01 cents scale = 1 unit
    });
    expect(computeTradePnl(trade)).toBe(0.1235);
  });

  it('a sub-cent P&L rounds to exactly 0 even when full precision is nonzero', () => {
    const trade = makeTrade({
      price_mode: 'cents',
      entry_price: 100,
      exit_price: 100.00003,
      size: 1,
      contract_size: 1,
    });
    expect(computeTradePnl(trade)).toBe(0);
    expect(computeStats([trade]).allTimePnl).toBe(0);
  });

  it('display unit converts the same canonical P&L (USC <-> USD) without recomputing', () => {
    // Same trade as it appears on the dashboard hero, trade card and detail screen.
    const trade = makeTrade({
      symbol: 'USDJPY',
      quote_currency: 'USD',
      price_mode: 'cents',
      direction: 'short',
      entry_price: 157.536,
      exit_price: 157.552,
      size: 0.01,
      contract_size: 100000,
    });

    const pnl = computeTradePnl(trade);
    expect(pnl).toBe(-0.001);
    expect(formatPnl(pnl, 'usc')).toBe('0.10 USC');
    expect(formatPnl(pnl, 'usd')).toBe('$0.001');

    // Dashboard hero shows the sum of visible trades; the sum must convert too.
    const hero = computeStats([trade]).allTimePnl;
    expect(hero).toBe(-0.001);
    expect(formatPnl(hero, 'usc')).toBe('0.10 USC');
    expect(formatPnl(hero, 'usd')).toBe('$0.001');
  });
});
