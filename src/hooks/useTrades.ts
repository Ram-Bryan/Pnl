import { useState, useEffect, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { TradeWithInstrument } from '../stats/computeStats';

export function useTrades() {
  const db = useSQLiteContext();
  const [trades, setTrades] = useState<TradeWithInstrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await db.getAllAsync<TradeWithInstrument>(`
        SELECT t.*,
               i.symbol,
               i.name   AS instrument_name,
               i.price_mode,
               i.contract_size
        FROM   trades t
        JOIN   instruments i ON i.id = t.instrument_id
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

  return { trades, loading, error, refetch: fetch };
}
