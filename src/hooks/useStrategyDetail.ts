import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Strategy } from '../db/schema';
import { getStrategyById, getRuleAdherence, getAllTradesWithInstrument } from '../db/database';
import { TradeWithInstrument } from '../stats/computeStats';
import {
  RuleAdherence,
  StrategyStats,
  computeRuleAdherence,
  computeStrategyStats,
} from '../stats/strategyStats';

export function useStrategyDetail(strategyId: number) {
  const db = useSQLiteContext();
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [rules, setRules] = useState<RuleAdherence[]>([]);
  const [trades, setTrades] = useState<TradeWithInstrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const [strategyRow, adherenceRows, allTrades] = await Promise.all([
        getStrategyById(db, strategyId),
        getRuleAdherence(db, strategyId),
        getAllTradesWithInstrument(db),
      ]);
      setStrategy(strategyRow);
      setRules(computeRuleAdherence(adherenceRows));
      setTrades(allTrades);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db, strategyId]);

  useEffect(() => { fetch(); }, [fetch]);
  useFocusEffect(useCallback(() => { fetch({ silent: true }); }, [fetch]));

  const strategyTrades = useMemo(() => trades.filter((t) => t.strategy_id === strategyId), [trades, strategyId]);
  const stats: StrategyStats = useMemo(() => computeStrategyStats(strategyTrades), [strategyTrades]);
  const recentTrades = strategyTrades.slice(0, 10);

  return { strategy, stats, rules, recentTrades, loading, error, refetch: fetch };
}
