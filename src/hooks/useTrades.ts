import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { TradeWithInstrument } from '../stats/computeStats';
import { getAllTradesWithInstrument, deleteTrades } from '../db/database';

export function useTrades() {
  const db = useSQLiteContext();
  const [trades, setTrades] = useState<TradeWithInstrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const rows = await getAllTradesWithInstrument(db);
      setTrades(rows);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(useCallback(() => { fetch({ silent: true }); }, [fetch]));

  const removeTrades = useCallback(async (ids: number[]) => {
    await deleteTrades(db, ids);
    await fetch({ silent: true });
  }, [db, fetch]);

  return { trades, loading, error, refetch: fetch, removeTrades };
}
