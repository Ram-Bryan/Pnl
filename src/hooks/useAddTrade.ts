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
  Instrument,
} from '../db/schema';
import {
  TradeDraft,
  insertTradeWithFills,
  updateTradeWithFills,
  getTradeWithFills,
  getEmotions,
  getTags,
  getStrategies,
  getStrategyRules,
  insertStrategy,
  getStrategyRuleCounts,
  saveTradeAssociations,
  saveTradeScreenshots,
  getTradeTags,
  getTradeRuleChecks,
  getTradeScreenshots,
  getInstruments,
} from '../db/database';
import { averageFillPrice, totalQuantity } from '../lib/aggregateFills';

export type FillSide = 'entry' | 'exit';

type FillRowState = { price: string; quantity: string; note: string };

type FormState = {
  instrumentId: number | null;
  direction: 'long' | 'short';
  status: 'open' | 'closed';
  entryFills: FillRowState[];
  exitFills: FillRowState[];
  stopLoss: string;
  takeProfit: string;
  strategyId: number | null;
  tagIds: number[];
  emotionIds: number[];
  entryCondition: string | null;
  exitCondition: string | null;
  notes: string;
  entryAt: string;
  exitAt: string;
  fees: string;
  screenshots: string[];
};

const SCREENSHOT_LIMIT = 6;

function createDefaultForm(): FormState {
  const now = new Date();
  const formatIso = (d: Date) => d.toISOString().slice(0, 19); // YYYY-MM-DDTHH:mm:ss
  
  return {
    instrumentId: null,
    direction: 'long',
    status: 'closed',
    entryFills: [{ price: '', quantity: '', note: '' }],
    exitFills: [],
    stopLoss: '',
    takeProfit: '',
    strategyId: null,
    tagIds: [],
    emotionIds: [],
    entryCondition: null,
    exitCondition: null,
    notes: '',
    entryAt: formatIso(now),
    exitAt: formatIso(now),
    fees: '0',
    screenshots: [],
  };
}

function validateForm(f: FormState): string | null {
  if (f.instrumentId == null) return 'Symbol is required.';
  if (f.entryFills.length === 0 || f.entryFills.some((r) => !r.price.trim() || !r.quantity.trim()))
    return 'Add at least one entry fill with price and quantity.';
  if (f.status === 'closed' && (f.exitFills.length === 0 || f.exitFills.some((r) => !r.price.trim())))
    return 'Closed trades need at least one exit fill.';
  if (parseFloat(f.fees) < 0) return 'Fees must be zero or positive.';
  return null;
}

async function persistScreenshots(uris: string[]): Promise<string[]> {
  const dir = new Directory(Paths.document, 'screenshots');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  const persisted: string[] = [];
  for (const uri of uris) {
    // Keep the source extension (ImagePicker can return .heic/.png) so the
    // copied file is renderable on every platform.
    const ext = (uri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext) ? ext : 'jpg';
    const dest = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`);
    await new File(uri).copy(dest);
    persisted.push(dest.uri);
  }
  return persisted;
}

export function useAddTrade({ tradeId, strategyId }: { tradeId?: number; strategyId?: number }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const editMode = tradeId != null;

  const [fields, setFields] = useState<FormState>(createDefaultForm);
  const [ruleChecks, setRuleChecks] = useState<Record<number, boolean>>({});
  const [strategyRuleCounts, setStrategyRuleCounts] = useState<Record<number, number>>({});
  const [emotions, setEmotions] = useState<Emotion[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [strategyRules, setStrategyRules] = useState<StrategyRule[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string | null>(null);

  const strategyIdRef = useRef(fields.strategyId);
  useEffect(() => {
    strategyIdRef.current = fields.strategyId;
  }, [fields.strategyId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [emotionRows, tagRows, strategyRows, instRows, ruleCounts] = await Promise.all([
          getEmotions(db),
          getTags(db),
          getStrategies(db),
          getInstruments(db),
          getStrategyRuleCounts(db),
        ]);
        if (!mounted) return;
        setEmotions(emotionRows);
        setTags(tagRows);
        setStrategies(strategyRows);
        setInstruments(instRows);
        setStrategyRuleCounts(ruleCounts);

        if (!editMode && strategyId != null) {
          strategyIdRef.current = strategyId;
          setFields((f) => ({ ...f, strategyId }));
          const rules = await getStrategyRules(db, strategyId);
          if (mounted) setStrategyRules(rules);
        }

        if (!editMode || tradeId == null) {
          if (mounted) setLoading(false);
          return;
        }

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
        
        const padDate = (dateStr: string) => dateStr.slice(0, 19);
        const formatNow = () => new Date().toISOString().slice(0, 19);

        setFields({
          instrumentId: trade.instrument_id,
          direction: trade.direction,
          status: trade.status,
          entryFills: entryFills.length > 0 ? entryFills : [{ price: '', quantity: '', note: '' }],
          exitFills,
          stopLoss: trade.stop_loss != null ? String(trade.stop_loss) : '',
          takeProfit: trade.take_profit != null ? String(trade.take_profit) : '',
          strategyId: trade.strategy_id,
          tagIds: tradeTagRows.map((t) => t.id),
          emotionIds: trade.emotion_id != null ? [trade.emotion_id] : [],
          entryCondition: trade.entry_condition,
          exitCondition: trade.exit_condition,
          notes: trade.notes ?? '',
          entryAt: trade.entry_at ? padDate(trade.entry_at) : formatNow(),
          exitAt: trade.exit_at ? padDate(trade.exit_at) : formatNow(),
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
  }, [db, editMode, tradeId, strategyId]);

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
  }, []);

  const toggleTag = useCallback((id: number) => {
    setFields((f) => ({
      ...f,
      tagIds: f.tagIds.includes(id) ? f.tagIds.filter((t) => t !== id) : [...f.tagIds, id],
    }));
  }, []);

  const toggleEmotion = useCallback((id: number) => {
    setFields((f) => ({
      ...f,
      emotionIds: f.emotionIds.includes(id)
        ? f.emotionIds.filter((e) => e !== id)
        : [...f.emotionIds, id],
    }));
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
    if (strategyIdRef.current !== id) return;
    setStrategyRules(rules);
    setRuleChecks({});
  }, [db]);

  const createStrategy = useCallback(async (input: { name: string; description: string | null }) => {
    const id = await insertStrategy(db, input);
    const rows = await getStrategies(db);
    setStrategies(rows);
    setStrategyRuleCounts(await getStrategyRuleCounts(db));
    return id;
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
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
      });
      if (result.canceled) return;
      const uris = result.assets.slice(0, remaining).map((a) => a.uri);
      const persisted = await persistScreenshots(uris);
      setFields((f) => ({ ...f, screenshots: [...f.screenshots, ...persisted] }));
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add screenshots.');
    }
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
      if (!fields.instrumentId) throw new Error("Instrument ID is missing.");
      const account = await db.getFirstAsync<{ id: number }>('SELECT id FROM accounts LIMIT 1');
      if (!account) throw new Error('No account found. Please restart the app.');

      const entryFills = fields.entryFills.map((r) => ({
        side: 'entry' as const,
        price: parseFloat(r.price),
        quantity: parseFloat(r.quantity),
        note: r.note.trim() || null,
        occurred_at: fields.entryAt, // Fills sync to trade time for simplicity right now
      }));
      const entryPrice = averageFillPrice(entryFills);
      const size = totalQuantity(entryFills);

      const exitFills = fields.status === 'closed'
        ? fields.exitFills.map((r) => ({
            side: 'exit' as const,
            price: parseFloat(r.price),
            quantity: size,
            note: r.note.trim() || null,
            occurred_at: fields.exitAt,
          }))
        : [];

      const exitPrice = exitFills.length > 0 ? averageFillPrice(exitFills) : null;
      const exitAt = exitFills.length > 0 ? fields.exitAt : null;

      const draft: TradeDraft = {
        account_id: account.id,
        instrument_id: fields.instrumentId,
        strategy_id: fields.strategyId,
        emotion_id: fields.emotionIds.length > 0 ? fields.emotionIds[0] : null,
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
        notes: fields.notes.trim() || null,
        reflection: null,
        trade_style: null,
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
        checked: checked ? (1 as const) : (0 as const),
      }));

      await saveTradeAssociations(db, tradeIdForSave, {
        strategyId: fields.strategyId,
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
      setInstrumentId: (v: number | null) => setField('instrumentId', v),
      setDirection: (v: 'long' | 'short') => setField('direction', v),
      setStatus: (v: 'open' | 'closed') => setField('status', v),
      setStopLoss: (v: string) => setField('stopLoss', v),
      setTakeProfit: (v: string) => setField('takeProfit', v),
      setEntryCondition: (v: string | null) => setField('entryCondition', v),
      setExitCondition: (v: string | null) => setField('exitCondition', v),
      setNotes: (v: string) => setField('notes', v),
      setEntryAt: (v: string) => setField('entryAt', v),
      setExitAt: (v: string) => setField('exitAt', v),
      setFees: (v: string) => setField('fees', v),
      toggleTag,
      toggleEmotion,
      selectStrategy,
      toggleRuleCheck,
      addScreenshots,
      removeScreenshot,
    },
    pickers: { emotions, tags, strategies, strategyRules, instruments },
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
    strategyRuleCounts,
    createStrategy,
  };
}
