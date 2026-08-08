import { useState, useEffect, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { TradeWithInstrument } from '../stats/computeStats';
import { TradeFill, Tag, Emotion } from '../db/schema';
import {
  RuleCheck,
  getTradeWithFills,
  getTradeTags,
  getTradeRuleChecks,
  getTradeScreenshots,
  getEmotions,
} from '../db/database';

type TradeDetailData = {
  trade: TradeWithInstrument;
  fills: TradeFill[];
  tags: Tag[];
  ruleChecks: RuleCheck[];
  screenshots: string[];
  emotion: Emotion | null;
};

export function useTradeDetail(id: number) {
  const db = useSQLiteContext();
  const [data, setData] = useState<TradeDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tradeData, tagRows, ruleRows, screenshotPaths, emotionRows] = await Promise.all([
        getTradeWithFills(db, id),
        getTradeTags(db, id),
        getTradeRuleChecks(db, id),
        getTradeScreenshots(db, id),
        getEmotions(db),
      ]);
      if (!tradeData) {
        setData(null);
        return;
      }
      setData({
        trade: tradeData.trade,
        fills: tradeData.fills,
        tags: tagRows,
        ruleChecks: ruleRows,
        screenshots: screenshotPaths,
        emotion: emotionRows.find((e) => e.id === tradeData.trade.emotion_id) ?? null,
      });
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [db, id]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, error, loading, refetch: fetch };
}
