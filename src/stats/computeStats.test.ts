import { describe, it, expect } from 'vitest';
import { computeStats } from './computeStats';
import type { TradeWithInstrument } from './computeStats';

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
