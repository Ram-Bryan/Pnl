import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Goal } from '../db/schema';
import { TradeWithInstrument, StatsResult, computeStats } from '../stats/computeStats';
import { AccountType } from '../stats/tradeMath';
import { useAccountSetting } from './SettingsContext';

type DashboardData = {
  stats: StatsResult;
  trades: TradeWithInstrument[];
  weeklyGoal: Goal | null;
  accountType: AccountType;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

const EMPTY_STATS: StatsResult = {
  todayPnl: 0, weekPnl: 0, monthPnl: 0, allTimePnl: 0,
  winRate: 0, totalTrades: 0, wins: 0, losses: 0,
  expectancy: 0, currentStreak: 0,
};

export function useDashboard(): DashboardData {
  const db = useSQLiteContext();
  const { accountType } = useAccountSetting();
  const [trades, setTrades] = useState<TradeWithInstrument[]>([]);
  const [weeklyGoal, setWeeklyGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const [tradesList, goal] = await Promise.all([
        db.getAllAsync<TradeWithInstrument>(`
          SELECT t.*,
                 i.symbol,
                 i.name   AS instrument_name,
                 i.quote_currency,
                 i.price_mode,
                 i.contract_size,
                 i.asset_class,
                 t.trade_style,
                 t.entry_condition,
                 t.exit_condition,
                 s.name   AS strategy_name,
                 e.name   AS emotion_name
          FROM   trades t
          JOIN   instruments i ON i.id = t.instrument_id
          LEFT JOIN strategies s ON s.id = t.strategy_id
          LEFT JOIN emotions e  ON e.id = t.emotion_id
          ORDER  BY t.entry_at DESC
        `),
        db.getFirstAsync<Goal>(`
          SELECT * FROM goals
          WHERE kind = 'profit_goal'
            AND period = 'weekly'
            AND effective_to IS NULL
          ORDER BY effective_from DESC
          LIMIT 1
        `),
      ]);
      setTrades(tradesList);
      setWeeklyGoal(goal ?? null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { fetch(); }, [fetch]);

  useFocusEffect(useCallback(() => { fetch({ silent: true }); }, [fetch]));

  // Stats are recomputed reactively so the dashboard converts immediately when
  // the account type is toggled in Settings.
  const stats = useMemo(() => computeStats(trades, accountType), [trades, accountType]);

  return { stats, trades, weeklyGoal, accountType, loading, error, refetch: fetch };
}
