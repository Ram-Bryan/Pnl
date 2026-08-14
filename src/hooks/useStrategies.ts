import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Strategy } from '../db/schema';
import {
  getStrategies,
  getAllTradesWithInstrument,
  insertStrategy as insertStrategyDb,
  updateStrategy as updateStrategyDb,
  archiveStrategy as archiveStrategyDb,
  deleteStrategy as deleteStrategyDb,
  insertStrategyRule as insertStrategyRuleDb,
  updateStrategyRule as updateStrategyRuleDb,
  archiveStrategyRule as archiveStrategyRuleDb,
} from '../db/database';
import { TradeWithInstrument } from '../stats/computeStats';
import { StrategyStats, computeStrategyStats } from '../stats/strategyStats';

export type StrategyInput = { name: string; description: string | null };

export function useStrategies() {
  const db = useSQLiteContext();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [trades, setTrades] = useState<TradeWithInstrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const [strategyRows, tradeRows] = await Promise.all([
        getStrategies(db),
        getAllTradesWithInstrument(db),
      ]);
      setStrategies(strategyRows);
      setTrades(tradeRows);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(useCallback(() => { fetch({ silent: true }); }, [fetch]));

  const statsByStrategy = useMemo(() => {
    const map: Record<number, StrategyStats> = {};
    for (const s of strategies) map[s.id] = computeStrategyStats(trades.filter((t) => t.strategy_id === s.id));
    return map;
  }, [strategies, trades]);

  const addStrategy = useCallback(async (input: StrategyInput) => {
    await insertStrategyDb(db, input);
    await fetch({ silent: true });
  }, [db, fetch]);

  const updateStrategy = useCallback(async (id: number, input: StrategyInput) => {
    await updateStrategyDb(db, id, input);
    await fetch({ silent: true });
  }, [db, fetch]);

  const archiveStrategy = useCallback(async (id: number) => {
    await archiveStrategyDb(db, id);
    await fetch({ silent: true });
  }, [db, fetch]);

  const deleteStrategy = useCallback(async (id: number) => {
    await deleteStrategyDb(db, id);
    await fetch({ silent: true });
  }, [db, fetch]);

  const addRule = useCallback(async (strategyId: number, ruleText: string) => {
    await insertStrategyRuleDb(db, strategyId, ruleText);
    await fetch({ silent: true });
  }, [db, fetch]);

  const updateRule = useCallback(async (ruleId: number, ruleText: string) => {
    await updateStrategyRuleDb(db, ruleId, ruleText);
    await fetch({ silent: true });
  }, [db, fetch]);

  const archiveRule = useCallback(async (ruleId: number) => {
    await archiveStrategyRuleDb(db, ruleId);
    await fetch({ silent: true });
  }, [db, fetch]);

  return {
    strategies, statsByStrategy, loading, error,
    refetch: fetch,
    addStrategy, updateStrategy, archiveStrategy, deleteStrategy, addRule, updateRule, archiveRule,
  };
}
