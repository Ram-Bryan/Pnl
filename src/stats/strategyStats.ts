import { TradeWithInstrument, computeTradePnl } from './computeStats';

export type StrategyStats = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  currentStreak: number;
};

export type RuleAdherenceInput = { ruleId: number; rule_text: string; checked: number; unchecked: number };
export type RuleAdherence = { ruleId: number; ruleText: string; checked: number; unchecked: number; adherence: number };

export function computeStrategyStats(trades: TradeWithInstrument[]): StrategyStats {
  const closed = trades.filter((t) => t.status === 'closed' && t.exit_price != null);
  const pnls = closed.map((t) => computeTradePnl(t));

  const wins = pnls.filter((p) => p > 0).length;
  const losses = pnls.filter((p) => p < 0).length;
  const grossProfit = pnls.filter((p) => p > 0).reduce((s, p) => s + p, 0);
  const grossLoss = pnls.filter((p) => p < 0).reduce((s, p) => s - p, 0);
  const netPnl = pnls.reduce((s, p) => s + p, 0);
  const totalTrades = closed.length;

  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;
  const expectancy = totalTrades > 0 ? netPnl / totalTrades : 0;
  const avgWin = wins > 0 ? grossProfit / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;
  const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
  const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;

  let streak = 0;
  if (closed.length > 0) {
    const sorted = [...closed].sort((a, b) => (b.exit_at ?? b.entry_at).localeCompare(a.exit_at ?? a.entry_at));
    const firstPnl = computeTradePnl(sorted[0]);
    const sign = firstPnl >= 0 ? 1 : -1;
    for (const t of sorted) {
      const pnl = computeTradePnl(t);
      if ((pnl >= 0 ? 1 : -1) !== sign) break;
      streak += sign;
    }
  }

  return {
    totalTrades, wins, losses, winRate, netPnl, grossProfit, grossLoss,
    profitFactor, expectancy, avgWin, avgLoss, bestTrade, worstTrade, currentStreak: streak,
  };
}

export function computeRuleAdherence(rows: RuleAdherenceInput[]): RuleAdherence[] {
  return rows.map((r) => {
    const total = r.checked + r.unchecked;
    return {
      ruleId: r.ruleId,
      ruleText: r.rule_text,
      checked: r.checked,
      unchecked: r.unchecked,
      adherence: total > 0 ? (r.checked / total) * 100 : 0,
    };
  });
}
