import { describe, expect, it } from 'vitest';
import { TradeWithInstrument } from './computeStats';
import { computeStrategyStats, computeRuleAdherence } from './strategyStats';

function makeTrade(p: Partial<TradeWithInstrument>): TradeWithInstrument {
  return {
    id: 1, account_id: 1, instrument_id: 1, strategy_id: 1, emotion_id: null,
    trade_style: null, entry_condition: null, exit_condition: null,
    direction: 'long', status: 'closed', entry_price: 100, exit_price: 110,
    size: 1, stop_loss: null, take_profit: null,
    entry_at: '2026-01-01T00:00:00', exit_at: '2026-01-01T00:00:00',
    fees: 0, followed_rules: null, notes: null, reflection: null,
    created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00',
    symbol: 'AAPL', instrument_name: null, quote_currency: 'USD',
    price_mode: 'standard', contract_size: 1, asset_class: 'equity',
    strategy_name: null, emotion_name: null,
    ...p,
  };
}

describe('computeStrategyStats', () => {
  it('returns all-zero stats for empty input', () => {
    expect(computeStrategyStats([])).toEqual({
      totalTrades: 0, wins: 0, losses: 0, winRate: 0, netPnl: 0,
      grossProfit: 0, grossLoss: 0, profitFactor: null, expectancy: 0,
      avgWin: 0, avgLoss: 0, bestTrade: 0, worstTrade: 0, currentStreak: 0,
    });
  });

  it('computes win rate, P&L buckets, profit factor and expectancy', () => {
    const s = computeStrategyStats([
      makeTrade({ id: 1, entry_price: 100, exit_price: 110 }), // +10
      makeTrade({ id: 2, entry_price: 100, exit_price: 120 }), // +20
      makeTrade({ id: 3, entry_price: 100, exit_price: 90 }),  // -10
      makeTrade({ id: 4, entry_price: 100, exit_price: 80 }),  // -20
    ]);
    expect(s.totalTrades).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(2);
    expect(s.winRate).toBe(50);
    expect(s.netPnl).toBe(0);
    expect(s.grossProfit).toBe(30);
    expect(s.grossLoss).toBe(30);
    expect(s.profitFactor).toBe(1);
    expect(s.expectancy).toBe(0);
    expect(s.avgWin).toBe(15);
    expect(s.avgLoss).toBe(15);
    expect(s.bestTrade).toBe(20);
    expect(s.worstTrade).toBe(-20);
  });

  it('profitFactor is null when there are no losses', () => {
    const s = computeStrategyStats([
      makeTrade({ id: 1, entry_price: 100, exit_price: 110 }),
    ]);
    expect(s.profitFactor).toBeNull();
    expect(s.losses).toBe(0);
    expect(s.avgLoss).toBe(0);
    expect(s.winRate).toBe(100);
  });

  it('ignores open trades', () => {
    const s = computeStrategyStats([
      makeTrade({ id: 1, entry_price: 100, exit_price: 110 }),
      makeTrade({ id: 2, entry_price: 100, exit_price: null, status: 'open' }),
    ]);
    expect(s.totalTrades).toBe(1);
    expect(s.netPnl).toBe(10);
  });

  it('computes the current streak from the most recent trade backwards', () => {
    const s = computeStrategyStats([
      makeTrade({ id: 1, entry_price: 100, exit_price: 110, entry_at: '2026-01-01T00:00:00', exit_at: '2026-01-01T00:00:00' }),
      makeTrade({ id: 2, entry_price: 100, exit_price: 120, entry_at: '2026-01-02T00:00:00', exit_at: '2026-01-02T00:00:00' }),
      makeTrade({ id: 3, entry_price: 100, exit_price: 90,  entry_at: '2026-01-03T00:00:00', exit_at: '2026-01-03T00:00:00' }),
      makeTrade({ id: 4, entry_price: 100, exit_price: 80,  entry_at: '2026-01-04T00:00:00', exit_at: '2026-01-04T00:00:00' }),
    ]);
    expect(s.currentStreak).toBe(-2);
  });
});

describe('computeRuleAdherence', () => {
  it('computes adherence percentages', () => {
    expect(computeRuleAdherence([
      { ruleId: 1, rule_text: 'Wait for retest', checked: 3, unchecked: 1 },
      { ruleId: 2, rule_text: 'Never move stop', checked: 4, unchecked: 0 },
      { ruleId: 3, rule_text: 'Half size on news', checked: 0, unchecked: 2 },
    ])).toEqual([
      { ruleId: 1, ruleText: 'Wait for retest', checked: 3, unchecked: 1, adherence: 75 },
      { ruleId: 2, ruleText: 'Never move stop', checked: 4, unchecked: 0, adherence: 100 },
      { ruleId: 3, ruleText: 'Half size on news', checked: 0, unchecked: 2, adherence: 0 },
    ]);
  });

  it('returns empty array for no rows', () => {
    expect(computeRuleAdherence([])).toEqual([]);
  });
});
