import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as ImagePicker from 'expo-image-picker';
import { File, Directory, Paths } from 'expo-file-system';
import {
  AssetClass,
  PriceMode,
  TradeStyle,
  Emotion,
  Tag,
  Strategy,
  StrategyRule,
} from '../db/schema';
import {
  TradeDraft,
  getOrCreateInstrument,
  insertTradeWithFills,
  updateTradeWithFills,
  getTradeWithFills,
  getEmotions,
  getTags,
  getStrategies,
  getStrategyRules,
  saveTradeAssociations,
  saveTradeScreenshots,
  getTradeTags,
  getTradeRuleChecks,
  getTradeScreenshots,
} from '../db/database';
import { averageFillPrice, totalQuantity } from '../lib/aggregateFills';

export type FillSide = 'entry' | 'exit';

type FillRowState = { price: string; quantity: string; note: string };

type FormState = {
  symbol: string;
  assetClass: AssetClass;
  priceMode: PriceMode;
  style: TradeStyle;
  direction: 'long' | 'short';
  status: 'open' | 'closed';
  entryFills: FillRowState[];
  exitFills: FillRowState[];
  stopLoss: string;
  takeProfit: string;
  strategyId: number | null;
  emotionId: number | null;
  tagIds: number[];
  entryCondition: string | null;
  exitCondition: string | null;
  entryNotes: string;
  exitNotes: string;
  entryAt: string;
  fees: string;
  screenshots: string[];
};

const SCREENSHOT_LIMIT = 6;

function createDefaultForm(): FormState {
  return {
    symbol: '',
    assetClass: 'equity',
    priceMode: 'standard',
    style: 'intraday',
    direction: 'long',
    status: 'closed',
    entryFills: [{ price: '', quantity: '', note: '' }],
    exitFills: [],
    stopLoss: '',
    takeProfit: '',
    strategyId: null,
    emotionId: null,
    tagIds: [],
    entryCondition: null,
    exitCondition: null,
    entryNotes: '',
    exitNotes: '',
    entryAt: new Date().toISOString().slice(0, 16),
    fees: '0',
    screenshots: [],
  };
}

function validateForm(f: FormState): string | null {
  if (!f.symbol.trim()) return 'Symbol is required.';
  if (f.entryFills.length === 0 || f.entryFills.some((r) => !r.price.trim() || !r.quantity.trim()))
    return 'Add at least one entry fill with price and quantity.';
  if (f.status === 'closed' && (f.exitFills.length === 0 || f.exitFills.some((r) => !r.price.trim() || !r.quantity.trim())))
    return 'Closed trades need at least one exit fill.';
  if (parseFloat(f.fees) < 0) return 'Fees must be zero or positive.';
  return null;
}

async function persistScreenshots(uris: string[]): Promise<string[]> {
  const dir = new Directory(Paths.document, 'screenshots');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  const persisted: string[] = [];
  for (const uri of uris) {
    const dest = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
    await new File(uri).copy(dest);
    persisted.push(dest.uri);
  }
  return persisted;
}

export function useAddTrade({ tradeId }: { tradeId?: number }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const editMode = tradeId != null;

  const [fields, setFields] = useState<FormState>(createDefaultForm);
  const [ruleChecks, setRuleChecks] = useState<Record<number, boolean>>({});
  const [emotions, setEmotions] = useState<Emotion[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [strategyRules, setStrategyRules] = useState<StrategyRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editMode);
  const [errors, setErrors] = useState<string | null>(null);

  const strategyIdRef = useRef(fields.strategyId);
  useEffect(() => {
    strategyIdRef.current = fields.strategyId;
  }, [fields.strategyId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [emotionRows, tagRows, strategyRows] = await Promise.all([
          getEmotions(db),
          getTags(db),
          getStrategies(db),
        ]);
        if (!mounted) return;
        setEmotions(emotionRows);
        setTags(tagRows);
        setStrategies(strategyRows);

        if (!editMode || tradeId == null) return;

        const data = await getTradeWithFills(db, tradeId);
        if (!data) return;
        const { trade, fills } = data;
        const toRow = (price: number, quantity: number, note: string | null): FillRowState => ({
          price: String(price),
          quantity: String(quantity),
          note: note ?? '',
        });
        const entryFills = fills.filter((x) => x.side === 'entry').map((x) => toRow(x.price, x.quantity, x.note));
        const exitFills = fills.filter((x) => x.side === 'exit').map((x) => toRow(x.price, x.quantity, x.note));
        const [tradeTagRows, ruleRows, screenshotPaths] = await Promise.all([
          getTradeTags(db, tradeId),
          getTradeRuleChecks(db, tradeId),
          getTradeScreenshots(db, tradeId),
        ]);
        if (!mounted) return;

        const checks: Record<number, boolean> = {};
        for (const rc of ruleRows) checks[rc.ruleId] = rc.checked === 1;
        setRuleChecks(checks);

        setFields({
          symbol: trade.symbol,
          assetClass: trade.asset_class,
          priceMode: trade.price_mode,
          style: trade.trade_style ?? 'intraday',
          direction: trade.direction,
          status: trade.status,
          entryFills: entryFills.length > 0 ? entryFills : [{ price: '', quantity: '', note: '' }],
          exitFills,
          stopLoss: trade.stop_loss != null ? String(trade.stop_loss) : '',
          takeProfit: trade.take_profit != null ? String(trade.take_profit) : '',
          strategyId: trade.strategy_id,
          emotionId: trade.emotion_id,
          tagIds: tradeTagRows.map((t) => t.id),
          entryCondition: trade.entry_condition,
          exitCondition: trade.exit_condition,
          entryNotes: trade.notes ?? '',
          exitNotes: trade.reflection ?? '',
          entryAt: trade.entry_at.slice(0, 16),
          fees: String(trade.fees),
          screenshots: screenshotPaths,
        });
        if (trade.strategy_id != null) {
          setStrategyRules(await getStrategyRules(db, trade.strategy_id));
        }
      } catch {
        if (mounted) setErrors('Failed to load form data.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [db, editMode, tradeId]);

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
  }, []);

  const setAssetClass = useCallback((assetClass: AssetClass) => {
    setFields((f) => ({
      ...f,
      assetClass,
      priceMode: assetClass === 'fno' ? 'cents' : f.priceMode,
    }));
  }, []);

  const toggleTag = useCallback((id: number) => {
    setFields((f) => ({
      ...f,
      tagIds: f.tagIds.includes(id) ? f.tagIds.filter((t) => t !== id) : [...f.tagIds, id],
    }));
  }, []);

  const toggleEmotion = useCallback((id: number) => {
    setFields((f) => ({ ...f, emotionId: f.emotionId === id ? null : id }));
  }, []);

  const toggleRuleCheck = useCallback((ruleId: number) => {
    setRuleChecks((prev) => ({ ...prev, [ruleId]: !prev[ruleId] }));
  }, []);

  const selectStrategy = useCallback(async (id: number | null) => {
    if (strategyIdRef.current === id) return;
    strategyIdRef.current = id;
    setFields((f) => ({ ...f, strategyId: id }));
    if (id == null) {
      setStrategyRules([]);
      setRuleChecks({});
      return;
    }
    const rules = await getStrategyRules(db, id);
    setStrategyRules(rules);
    setRuleChecks({});
  }, [db]);

  const addFill = useCallback((side: FillSide) => {
    const key = side === 'entry' ? 'entryFills' : 'exitFills';
    setFields((f) => ({ ...f, [key]: [...f[key], { price: '', quantity: '', note: '' }] }));
  }, []);

  const removeFill = useCallback((side: FillSide, index: number) => {
    const key = side === 'entry' ? 'entryFills' : 'exitFills';
    setFields((f) => ({ ...f, [key]: f[key].filter((_, i) => i !== index) }));
  }, []);

  const setFill = useCallback((side: FillSide, index: number, patch: Partial<FillRowState>) => {
    const key = side === 'entry' ? 'entryFills' : 'exitFills';
    setFields((f) => ({
      ...f,
      [key]: f[key].map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }, []);

  const addScreenshots = useCallback(async () => {
    const remaining = SCREENSHOT_LIMIT - fields.screenshots.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
    });
    if (result.canceled) return;
    const uris = result.assets.slice(0, remaining).map((a) => a.uri);
    const persisted = await persistScreenshots(uris);
    setFields((f) => ({ ...f, screenshots: [...f.screenshots, ...persisted] }));
  }, [fields.screenshots.length]);

  const removeScreenshot = useCallback((index: number) => {
    setFields((f) => ({ ...f, screenshots: f.screenshots.filter((_, i) => i !== index) }));
  }, []);

  const save = useCallback(async () => {
    const validationError = validateForm(fields);
    if (validationError) {
      setErrors(validationError);
      Alert.alert('Validation', validationError);
      return;
    }
    setSaving(true);
    setErrors(null);
    try {
      const instrumentId = await getOrCreateInstrument(db, fields.symbol, fields.assetClass, fields.priceMode);
      const account = await db.getFirstAsync<{ id: number }>('SELECT id FROM accounts LIMIT 1');
      if (!account) throw new Error('No account found. Please restart the app.');

      const entryFills = fields.entryFills.map((r) => ({
        side: 'entry' as const,
        price: parseFloat(r.price),
        quantity: parseFloat(r.quantity),
        note: r.note.trim() || null,
        occurred_at: fields.entryAt,
      }));
      const exitFills = fields.status === 'closed'
        ? fields.exitFills.map((r) => ({
            side: 'exit' as const,
            price: parseFloat(r.price),
            quantity: parseFloat(r.quantity),
            note: r.note.trim() || null,
            occurred_at: new Date().toISOString(),
          }))
        : [];

      const entryPrice = averageFillPrice(entryFills);
      const size = totalQuantity(entryFills);
      const exitPrice = exitFills.length > 0 ? averageFillPrice(exitFills) : null;
      const exitAt = exitFills.length > 0 ? new Date().toISOString() : null;

      const draft: TradeDraft = {
        account_id: account.id,
        instrument_id: instrumentId,
        strategy_id: fields.strategyId,
        emotion_id: fields.emotionId,
        direction: fields.direction,
        status: fields.status,
        entry_price: entryPrice,
        exit_price: exitPrice,
        size,
        stop_loss: fields.stopLoss ? parseFloat(fields.stopLoss) : null,
        take_profit: fields.takeProfit ? parseFloat(fields.takeProfit) : null,
        entry_at: fields.entryAt,
        exit_at: exitAt,
        fees: parseFloat(fields.fees) || 0,
        followed_rules: null,
        notes: fields.entryNotes.trim() || null,
        reflection: fields.exitNotes.trim() || null,
        trade_style: fields.style,
        entry_condition: fields.entryCondition,
        exit_condition: fields.exitCondition,
      };

      const allFills = [...entryFills, ...exitFills];
      let tradeIdForSave: number;
      if (editMode && tradeId != null) {
        await updateTradeWithFills(db, tradeId, draft, allFills);
        tradeIdForSave = tradeId;
      } else {
        tradeIdForSave = await insertTradeWithFills(db, draft, allFills);
      }

      const ruleChecksForSave = Object.entries(ruleChecks).map(([ruleId, checked]) => ({
        ruleId: parseInt(ruleId, 10),
        checked: checked ? 1 : 0,
      }));

      await saveTradeAssociations(db, tradeIdForSave, {
        strategyId: fields.strategyId,
        emotionId: fields.emotionId,
        tagIds: fields.tagIds,
        ruleChecks: ruleChecksForSave,
      });

      if (editMode) {
        await db.runAsync('DELETE FROM trade_screenshots WHERE trade_id = ?', [tradeIdForSave]);
      }
      await saveTradeScreenshots(db, tradeIdForSave, fields.screenshots);

      router.back();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save trade.');
    } finally {
      setSaving(false);
    }
  }, [db, fields, ruleChecks, editMode, tradeId, router]);

  const fillRows = {
    entry: fields.entryFills,
    exit: fields.exitFills,
  };

  return {
    fields,
    setters: {
      setSymbol: (v: string) => setField('symbol', v),
      setAssetClass,
      setPriceMode: (v: PriceMode) => setField('priceMode', v),
      setStyle: (v: TradeStyle) => setField('style', v),
      setDirection: (v: 'long' | 'short') => setField('direction', v),
      setStatus: (v: 'open' | 'closed') => setField('status', v),
      setStopLoss: (v: string) => setField('stopLoss', v),
      setTakeProfit: (v: string) => setField('takeProfit', v),
      setEntryCondition: (v: string | null) => setField('entryCondition', v),
      setExitCondition: (v: string | null) => setField('exitCondition', v),
      setEntryNotes: (v: string) => setField('entryNotes', v),
      setExitNotes: (v: string) => setField('exitNotes', v),
      setEntryAt: (v: string) => setField('entryAt', v),
      setFees: (v: string) => setField('fees', v),
      toggleTag,
      toggleEmotion,
      selectStrategy,
      toggleRuleCheck,
      addScreenshots,
      removeScreenshot,
    },
    pickers: { emotions, tags, strategies, strategyRules },
    errors,
    fillRows,
    addFill,
    removeFill,
    setFill,
    saving,
    save,
    editMode,
    loading,
    ruleChecks,
  };
}
