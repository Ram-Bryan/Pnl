import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Goal } from '../db/schema';
import { getAllTradesWithInstrument } from '../db/database';
import { TradeWithInstrument, StatsResult, computeStats } from '../stats/computeStats';
import { DisplayUnit } from '../lib/format';
import { useAccountSetting } from './SettingsContext';

type DashboardData = {
  stats: StatsResult;
  trades: TradeWithInstrument[];
  weeklyGoal: Goal | null;
  dailyLossLimit: Goal | null;
  displayUnit: DisplayUnit;
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
  const { displayUnit, currentPrices } = useAccountSetting();
  const [trades, setTrades] = useState<TradeWithInstrument[]>([]);
  const [weeklyGoal, setWeeklyGoal] = useState<Goal | null>(null);
  const [dailyLossLimit, setDailyLossLimit] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const [tradesList, goal, lossLimit] = await Promise.all([
        getAllTradesWithInstrument(db),
        db.getFirstAsync<Goal>(`
          SELECT * FROM goals
          WHERE kind = 'profit_goal'
            AND period = 'weekly'
            AND effective_to IS NULL
          ORDER BY effective_from DESC
          LIMIT 1
        `),
        db.getFirstAsync<Goal>(`
          SELECT * FROM goals
          WHERE kind = 'loss_limit'
            AND period = 'daily'
            AND effective_to IS NULL
          ORDER BY effective_from DESC
          LIMIT 1
        `),
      ]);
      setTrades(tradesList);
      setWeeklyGoal(goal ?? null);
      setDailyLossLimit(lossLimit ?? null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(useCallback(() => { fetch({ silent: true }); }, [fetch]));

  // Stats are recomputed reactively so the dashboard converts immediately when
  // the display unit is toggled in Settings, and floats open positions as mark
  // prices are entered/changed.
  const stats = useMemo(() => computeStats(trades, currentPrices), [trades, currentPrices]);

  return { stats, trades, weeklyGoal, dailyLossLimit, displayUnit, loading, error, refetch: fetch };
}
