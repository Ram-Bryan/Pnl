import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { TradeWithInstrument } from '../stats/computeStats';

export function useTrades() {
  const db = useSQLiteContext();
  const [trades, setTrades] = useState<TradeWithInstrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const rows = await db.getAllAsync<TradeWithInstrument>(`
        SELECT t.*,
               i.symbol,
               i.name   AS instrument_name,
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
      `);
      setTrades(rows);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { fetch(); }, [fetch]);

  useFocusEffect(useCallback(() => { fetch({ silent: true }); }, [fetch]));

  return { trades, loading, error, refetch: fetch };
}
