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
    fees: 0, followed_rules: null, notes: null, reflection: null,
    created_at: '2026-08-01T10:00:00', updated_at: '2026-08-01T11:00:00',
    symbol: 'TEST', instrument_name: null, quote_currency: 'USD',
    price_mode: 'standard', contract_size: 100, asset_class: 'equity',
    strategy_name: null, emotion_name: null,
    ...overrides,
  };
}

describe('computeStats', () => {
  it('scales all P&L down 100x on a cents account', () => {
    const trades = [makeTrade({ id: 1 }), makeTrade({ id: 2, size: 2 })];
    expect(computeStats(trades, 'standard').allTimePnl).toBeCloseTo(300, 6);
    expect(computeStats(trades, 'cents').allTimePnl).toBeCloseTo(3, 6);
  });

  it('derives totals, win rate and streak from recent results', () => {
    const trades = [
      makeTrade({ id: 1, entry_price: 100, exit_price: 101 }),
      makeTrade({ id: 2, entry_price: 100, exit_price: 99, exit_at: '2026-08-02T11:00:00' }),
      makeTrade({ id: 3, entry_price: 100, exit_price: 99, exit_at: '2026-08-03T11:00:00' }),
    ];
    const stats = computeStats(trades, 'standard');
    expect(stats.totalTrades).toBe(3);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(2);
    expect(stats.winRate).toBeCloseTo(33.33, 1);
    expect(stats.currentStreak).toBe(-2);
  });
});

describe('computeTradePnl', () => {
  it('converts JPY to USD even when the stored quote is the generic USD default (short USDJPY 0.01 lot, cents)', () => {
    // MT5: -0.16 JPY / 157.536 = -0.0010155 USD -> -0.10 USC
    const trade = makeTrade({
      symbol: 'USDJPY',
      quote_currency: 'USD',
      direction: 'short',
      entry_price: 157.536,
      exit_price: 157.552,
      size: 0.01,
      contract_size: 100000,
    });
    const pnl = computeTradePnl(trade, 'cents');
    expect(pnl).toBeCloseTo(-0.0010155, 6);
    expect(pnl * 100).toBeCloseTo(-0.10, 2);
  });

  it('respects an explicitly stored non-default quote currency', () => {
    const trade = makeTrade({
      symbol: 'USDJPY',
      quote_currency: 'JPY',
      direction: 'short',
      entry_price: 157.536,
      exit_price: 157.552,
      size: 0.01,
      contract_size: 100000,
    });
    expect(computeTradePnl(trade, 'cents')).toBeCloseTo(-0.0010155, 6);
  });

  it('toggling the account type converts every P&L display unit (USC <-> USD)', () => {
    // Same trade as it appears on the dashboard hero, trade card and detail screen.
    const trade = makeTrade({
      symbol: 'USDJPY',
      quote_currency: 'USD',
      direction: 'short',
      entry_price: 157.536,
      exit_price: 157.552,
      size: 0.01,
      contract_size: 100000,
    });

    const rowCents = computeTradePnl(trade, 'cents');
    const rowStandard = computeTradePnl(trade, 'standard');
    expect(formatPnl(rowCents, 'cents')).toBe('0.10 USC');
    expect(formatPnl(rowStandard, 'standard')).toBe('$0.10');

    // Dashboard hero shows the sum of visible trades; the sum must convert too.
    const heroCents = computeStats([trade], 'cents').allTimePnl;
    const heroStandard = computeStats([trade], 'standard').allTimePnl;
    expect(formatPnl(heroCents, 'cents')).toBe('0.10 USC');
    expect(formatPnl(heroStandard, 'standard')).toBe('$0.10');
  });
});
