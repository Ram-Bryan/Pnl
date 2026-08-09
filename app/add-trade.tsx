import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform, Keyboard, Pressable,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown, Layout } from 'react-native-reanimated';
import {
  Button, Chip, Segmented, Field, TextInputField, NumericInput, Sheet,
} from '../src/ui';
import { formatPnl } from '../src/lib/format';
import { averageFillPrice, totalQuantity } from '../src/lib/aggregateFills';
import { useAddTrade } from '../src/hooks/useAddTrade';
import { useSettings } from '../src/hooks/useSettings';
import { ENTRY_CONDITIONS, EXIT_CONDITIONS } from '../src/lib/constants';

// ─── helpers ─────────────────────────────────────────────────────────────────

function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ─── NativeDatePicker ────────────────────────────────────────────────────────

function NativeDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const dateObj = useMemo(() => { try { return value ? new Date(value) : new Date(); } catch { return new Date(); } }, [value]);

  const onDateChange = (_: DateTimePickerEvent, sel?: Date) => {
    setShowDate(false);
    if (!sel) return;
    const m = new Date(dateObj);
    m.setFullYear(sel.getFullYear(), sel.getMonth(), sel.getDate());
    onChange(toIso(m));
    setTimeout(() => setShowTime(true), 300);
  };
  const onTimeChange = (_: DateTimePickerEvent, sel?: Date) => {
    setShowTime(false);
    if (!sel) return;
    const m = new Date(dateObj);
    m.setHours(sel.getHours(), sel.getMinutes(), 0);
    onChange(toIso(m));
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setShowDate(true)}
        className="bg-[#13141a] border border-[#1e1d2b] rounded-xl px-4 h-[52px] flex-row items-center justify-between"
        activeOpacity={0.7}
      >
        <Text className="text-white font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
          {dateObj.toLocaleDateString()} {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <Ionicons name="calendar-outline" size={18} color="#6b6880" />
      </TouchableOpacity>
      {showDate && <DateTimePicker value={dateObj} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={onDateChange} themeVariant="dark" />}
      {showTime && <DateTimePicker value={dateObj} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onTimeChange} themeVariant="dark" />}
    </>
  );
}

// ─── Validation helpers ────────────────────────────────────────────────────────

function validateSlTp(direction: 'long' | 'short', entryFills: { price: string; quantity: string }[], sl: string, tp: string): string | null {
  const ve = entryFills.filter(r => r.price && r.quantity);
  if (!ve.length) return null;
  const entryPrice = averageFillPrice(ve.map(r => ({ price: parseFloat(r.price), quantity: parseFloat(r.quantity) })));
  const slP = sl ? parseFloat(sl) : null;
  const tpP = tp ? parseFloat(tp) : null;

  if (slP !== null && tpP !== null) {
    if (direction === 'long' && slP >= tpP) return 'SL must be below TP for a long trade.';
    if (direction === 'short' && slP <= tpP) return 'SL must be above TP for a short trade.';
  }
  if (slP !== null && isFinite(entryPrice)) {
    if (direction === 'long' && slP >= entryPrice) return 'Stop Loss must be below entry price for a long trade.';
    if (direction === 'short' && slP <= entryPrice) return 'Stop Loss must be above entry price for a short trade.';
  }
  if (tpP !== null && isFinite(entryPrice)) {
    if (direction === 'long' && tpP <= entryPrice) return 'Take Profit must be above entry price for a long trade.';
    if (direction === 'short' && tpP >= entryPrice) return 'Take Profit must be below entry price for a short trade.';
  }
  return null;
}

function validateDates(entryAt: string, exitAt: string, status: 'open' | 'closed'): string | null {
  if (status !== 'closed') return null;
  const e = new Date(entryAt), x = new Date(exitAt);
  if (isNaN(e.getTime()) || isNaN(x.getTime())) return null;
  if (x < e) return 'Exit date cannot be before entry date.';
  return null;
}

// ─── PnL preview ─────────────────────────────────────────────────────────────

function computeFormPnl({ entryFills, exitFills, direction, status, accountType, contractSize, fees, quoteCurrency }: {
  entryFills: { price: string; quantity: string }[];
  exitFills: { price: string; quantity: string }[];
  direction: 'long' | 'short'; status: 'open' | 'closed';
  accountType: 'standard' | 'cents'; contractSize: number; fees: number;
  quoteCurrency: string;
}): number | null {
  if (status !== 'closed') return null;
  const ve = entryFills.filter(r => r.price && r.quantity).map(r => ({ price: parseFloat(r.price), quantity: parseFloat(r.quantity) }));
  const vx = exitFills.filter(r => r.price).map(r => ({ price: parseFloat(r.price), quantity: 1 }));
  if (!ve.length || !vx.length) return null;
  const avgE = averageFillPrice(ve), sz = totalQuantity(ve), avgX = averageFillPrice(vx);
  if (!isFinite(avgE) || !isFinite(avgX) || !isFinite(sz)) return null;
  const diff = direction === 'long' ? avgX - avgE : avgE - avgX;
  const rawSize = sz * contractSize;
  const adjustedSize = accountType === 'cents' ? rawSize * 0.01 : rawSize;
  let rawPnl = diff * adjustedSize;
  // Convert non-USD quote currency (e.g. JPY) back to USD by dividing by entry rate
  if (quoteCurrency && quoteCurrency !== 'USD' && avgE > 0) rawPnl /= avgE;
  return rawPnl - fees;
}

function PnlPreviewCard(p: Parameters<typeof computeFormPnl>[0]) {
  const pnl = computeFormPnl(p);
  if (pnl === null) return null;
  const win = pnl >= 0;
  const c = win ? '#00E68A' : '#FF4D6A';
  return (
    <Animated.View entering={FadeInDown.duration(400).springify()} layout={Layout.springify()}
      className="rounded-2xl px-5 py-4 flex-row items-center justify-between border mt-2 mb-2"
      style={{ backgroundColor: win ? 'rgba(0,230,138,0.08)' : 'rgba(255,77,106,0.08)', borderColor: win ? 'rgba(0,230,138,0.2)' : 'rgba(255,77,106,0.2)' }}
    >
      <View>
        <Text style={{ color: c }} className="text-xs font-bold uppercase tracking-wider mb-1">Estimated PnL</Text>
        <Text style={{ color: c, fontVariant: ['tabular-nums'] }} className="text-2xl font-black">
          {formatPnl(pnl, p.accountType)}
        </Text>
        {p.accountType === 'cents' && <Text className="text-[10px] text-[#6b6880] mt-0.5 uppercase">Cents Account</Text>}
      </View>
      <Ionicons name={win ? 'trending-up' : 'trending-down'} size={32} color={c} />
    </Animated.View>
  );
}

function computeRR(entryFills: { price: string; quantity: string }[], direction: 'long' | 'short', sl: string, tp: string): string | null {
  const ve = entryFills.filter(r => r.price && r.quantity);
  if (!ve.length) return null;
  const eP = averageFillPrice(ve.map(r => ({ price: parseFloat(r.price), quantity: parseFloat(r.quantity) })));
  const slP = parseFloat(sl), tpP = parseFloat(tp);
  if (!eP || !slP || !tpP) return null;
  const risk = direction === 'long' ? eP - slP : slP - eP;
  const reward = direction === 'long' ? tpP - eP : eP - tpP;
  if (risk <= 0 || reward <= 0) return null;
  return (reward / risk).toFixed(0);
}

// ─── Fill rows ────────────────────────────────────────────────────────────────

function EntryFillRow({ row, onRemove, setRow }: { row: { price: string; quantity: string; note: string }; onRemove: () => void; setRow: (p: Partial<{ price: string; quantity: string; note: string }>) => void }) {
  return (
    <Animated.View layout={Layout.springify()} className="mb-3 flex-row gap-2">
      <View className="flex-1"><NumericInput value={row.price} onChangeText={v => setRow({ price: v })} placeholder="Price" align="left" /></View>
      <View className="flex-1"><NumericInput value={row.quantity} onChangeText={v => setRow({ quantity: v })} placeholder="Qty / Lots" align="left" /></View>
      <TouchableOpacity onPress={onRemove} className="bg-[#13141a] rounded-xl h-[52px] w-[52px] items-center justify-center border border-[#2b2d3a]">
        <Ionicons name="trash" size={18} color="#FF4D6A" />
      </TouchableOpacity>
    </Animated.View>
  );
}

function ExitFillRow({ row, onRemove, setRow }: { row: { price: string; quantity: string; note: string }; onRemove: () => void; setRow: (p: Partial<{ price: string; quantity: string; note: string }>) => void }) {
  return (
    <Animated.View layout={Layout.springify()} className="mb-3 flex-row gap-2 items-center">
      <View className="flex-1"><NumericInput value={row.price} onChangeText={v => setRow({ price: v })} placeholder="Exit price" align="left" /></View>
      <TouchableOpacity onPress={onRemove} className="bg-[#13141a] rounded-xl h-[52px] w-[52px] items-center justify-center border border-[#2b2d3a]">
        <Ionicons name="trash" size={18} color="#FF4D6A" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Inline validation warning ────────────────────────────────────────────────

function ValidationWarning({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View className="flex-row items-center gap-2 bg-[#FF4D6A]/10 border border-[#FF4D6A]/20 rounded-xl px-3 py-2.5 mt-1 mb-3">
      <Ionicons name="warning" size={14} color="#FF4D6A" />
      <Text className="text-[#FF4D6A] text-xs font-semibold flex-1">{message}</Text>
    </View>
  );
}

// ─── Condition chips ───────────────────────────────────────────────────────────

function ConditionChips({ options, value, onChange }: { options: string[]; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map(o => <Chip key={o} label={o} selected={value === o} onPress={() => onChange(value === o ? null : o)} />)}
    </View>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function SectionCard({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <View className="bg-[#1a1b24] rounded-2xl border border-[#2b2d3a] px-4 pt-5 pb-4 mb-5">
      {title && <Text className="text-xl font-black text-white uppercase tracking-wide mb-5">{title}</Text>}
      {children}
    </View>
  );
}

// ─── Select row ───────────────────────────────────────────────────────────────

function SelectRow({ value, placeholder, onPress }: { value: string | null; placeholder: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} className="bg-[#13141a] border border-[#1e1d2b] rounded-xl px-4 h-[52px] flex-row items-center justify-between" activeOpacity={0.7}>
      <Text className={value ? 'text-white font-medium' : 'text-[#3e3b4b] font-medium'}>{value ?? placeholder}</Text>
      <Ionicons name="chevron-down" size={18} color="#8B92A5" />
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AddTrade() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const parsedId = id ? parseInt(id, 10) : undefined;
  const tradeId = parsedId != null && !Number.isNaN(parsedId) ? parsedId : undefined;

  const { fields, setters, pickers, errors, fillRows, addFill, removeFill, setFill, saving, save, editMode, loading: addTradeLoading, ruleChecks } = useAddTrade({ tradeId });
  const { settings, loading: settingsLoading } = useSettings();

  const [strategySheetOpen, setStrategySheetOpen] = useState(false);
  const [symbolQuery, setSymbolQuery] = useState('');
  const [symbolFocused, setSymbolFocused] = useState(false);

  useEffect(() => {
    if (fields.instrumentId && !symbolFocused) {
      const inst = pickers.instruments.find(i => i.id === fields.instrumentId);
      if (inst) setSymbolQuery(inst.symbol);
    }
  }, [fields.instrumentId, symbolFocused, pickers.instruments]);

  const selectedInstrument = pickers.instruments.find(i => i.id === fields.instrumentId);
  const quoteCurrency = selectedInstrument?.quote_currency ?? 'USD';
  const contractSize = selectedInstrument?.contract_size ?? 1;
  const selectedStrategyName = fields.strategyId != null ? (pickers.strategies.find(s => s.id === fields.strategyId)?.name ?? null) : null;
  const filteredInstruments = symbolQuery.trim().length > 0
    ? pickers.instruments.filter(i => i.symbol.toLowerCase().includes(symbolQuery.toLowerCase()))
    : pickers.instruments;

  const rrStr = computeRR(fillRows.entry, fields.direction, fields.stopLoss, fields.takeProfit);
  const slTpWarning = validateSlTp(fields.direction, fillRows.entry, fields.stopLoss, fields.takeProfit);
  const dateWarning = validateDates(fields.entryAt, fields.exitAt, fields.status);

  if (addTradeLoading || settingsLoading) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><ActivityIndicator size="large" color="#00E68A" /></View>;
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-dark-bg" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => { if (symbolFocused) { Keyboard.dismiss(); setSymbolFocused(false); } }}
      >

        {/* ── SECTION 1: Trade Details ─────────────────────────── */}
        <Animated.View entering={FadeIn.duration(400)}>
          <SectionCard title="Trade Details">

            <Field label="Symbol *">
              <View style={{ zIndex: 100 }}>
                <TextInputField
                  value={symbolQuery}
                  onChangeText={v => { setSymbolQuery(v.toUpperCase()); if (fields.instrumentId) setters.setInstrumentId(null); }}
                  placeholder="e.g. AAPL, BTCUSD"
                  onFocus={() => setSymbolFocused(true)}
                  onBlur={() => setTimeout(() => setSymbolFocused(false), 150)}
                />
                {/* Invisible overlay — tapping anywhere outside dismisses dropdown */}
                {symbolFocused && (
                  <Pressable
                    onPress={() => { Keyboard.dismiss(); setSymbolFocused(false); }}
                    style={{ position: 'absolute', top: -9999, left: -9999, right: -9999, bottom: -9999, zIndex: 9998 }}
                  />
                )}
                {symbolFocused && (
                  <View
                    style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 9999, elevation: 20 }}
                    className="bg-[#1a1b24] border border-[#2b2d3a] rounded-2xl overflow-hidden"
                  >
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>
                      {filteredInstruments.map(inst => (
                        <TouchableOpacity
                          key={inst.id}
                          onPress={() => { setters.setInstrumentId(inst.id); setSymbolQuery(inst.symbol); setSymbolFocused(false); }}
                          className="px-5 py-4 border-b border-[#2b2d3a] flex-row justify-between items-center"
                          activeOpacity={0.7}
                        >
                          <View>
                            <Text className="text-white font-bold text-base">{inst.symbol}</Text>
                            {inst.name ? <Text className="text-[#8B92A5] text-xs mt-0.5">{inst.name}</Text> : null}
                          </View>
                          <Text className="text-[#6b6880] text-[11px] font-bold uppercase">{inst.asset_class}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        onPress={() => { setSymbolFocused(false); router.push('/(tabs)/symbols'); }}
                        className="px-5 py-4 flex-row items-center bg-[#00E68A]/10"
                        activeOpacity={0.7}
                      >
                        <Ionicons name="add-circle" size={18} color="#00E68A" />
                        <Text className="text-[#00E68A] font-bold ml-2 text-sm">Add new symbol</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
                )}
              </View>
              {selectedInstrument && (
                <Animated.View entering={FadeInDown.duration(300)} className="flex-row items-center gap-2 mt-2 px-1">
                  <Ionicons name="checkmark-circle" size={14} color="#00E68A" />
                  <Text className="text-xs text-[#00E68A] font-semibold">
                    {selectedInstrument.asset_class.toUpperCase()} · {selectedInstrument.price_mode === 'cents' ? 'Cents mode' : 'Standard'}{contractSize !== 1 ? ` · x${contractSize}` : ''}
                  </Text>
                </Animated.View>
              )}
            </Field>

            <Field label="Direction">
              <Segmented options={[{ key: 'long', label: '▲  Long' }, { key: 'short', label: '▼  Short' }]} value={fields.direction} onChange={setters.setDirection} dangerKeys={['short']} />
            </Field>

            <Field label="Status">
              <Segmented options={[{ key: 'open', label: 'Open' }, { key: 'closed', label: 'Closed' }]} value={fields.status} onChange={setters.setStatus} dangerKeys={['closed']} />
            </Field>

          </SectionCard>
        </Animated.View>

        {/* ── SECTION 2: Entry ─────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(400).delay(80)}>
          <SectionCard title="Entry">

            <Field label="Entry Date & Time">
              <NativeDatePicker value={fields.entryAt} onChange={setters.setEntryAt} />
            </Field>

            {fillRows.entry.map((row, i) => (
              <EntryFillRow key={i} row={row} onRemove={() => removeFill('entry', i)} setRow={patch => setFill('entry', i, patch)} />
            ))}
            <View className="mb-4">
              <Button title="＋ Add entry fill" variant="ghost" onPress={() => addFill('entry')} />
            </View>

            <Field label="Entry Condition">
              <ConditionChips options={ENTRY_CONDITIONS} value={fields.entryCondition} onChange={setters.setEntryCondition} />
            </Field>

            <View className="flex-row gap-3 mt-2">
              <View className="flex-1">
                <Field label="Stop Loss">
                  <NumericInput value={fields.stopLoss} onChangeText={setters.setStopLoss} placeholder="Optional" />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Take Profit">
                  <NumericInput value={fields.takeProfit} onChangeText={setters.setTakeProfit} placeholder="Optional" />
                </Field>
              </View>
            </View>

            <ValidationWarning message={slTpWarning} />

            {rrStr && !slTpWarning && (
              <Text className="text-[#00E68A] text-sm font-black text-center mb-3">1:{rrStr} RR</Text>
            )}

            <View className="mt-2">
              <Field label="Fees & Commissions">
                <NumericInput value={fields.fees} onChangeText={setters.setFees} placeholder="0" />
              </Field>
            </View>

          </SectionCard>
        </Animated.View>

        {/* ── SECTION 3: Exit (only when closed) ───────────────── */}
        {fields.status === 'closed' && (
          <Animated.View entering={FadeInDown.duration(400).springify()}>
            <SectionCard title="Exit">

              <Field label="Exit Date & Time">
                <NativeDatePicker value={fields.exitAt} onChange={setters.setExitAt} />
              </Field>

              <ValidationWarning message={dateWarning} />

              {fillRows.exit.map((row, i) => (
                <ExitFillRow key={i} row={row} onRemove={() => removeFill('exit', i)} setRow={patch => setFill('exit', i, patch)} />
              ))}
              <View className="mb-4">
                <Button title="＋ Add exit fill" variant="ghost" onPress={() => addFill('exit')} />
              </View>

              <Field label="Exit Condition">
                <ConditionChips options={EXIT_CONDITIONS} value={fields.exitCondition} onChange={setters.setExitCondition} />
              </Field>

              <PnlPreviewCard
                entryFills={fillRows.entry} exitFills={fillRows.exit}
                direction={fields.direction} status={fields.status}
                accountType={settings.accountType} contractSize={contractSize}
                quoteCurrency={quoteCurrency}
                fees={parseFloat(fields.fees) || 0}
              />

            </SectionCard>
          </Animated.View>
        )}

        {/* ── SECTION 4: Strategy & Tags ───────────────────────── */}
        <Animated.View entering={FadeIn.duration(400).delay(160)}>
          <SectionCard title="Strategy & Tags">

            <Field label="Strategy">
              <SelectRow value={selectedStrategyName} placeholder="Select strategy" onPress={() => setStrategySheetOpen(true)} />
            </Field>

            {fields.strategyId != null && pickers.strategyRules.length > 0 && (
              <Animated.View entering={FadeInDown} className="bg-[#13141a] border border-[#1e1d2b] rounded-2xl px-4 py-4 mb-4">
                <Text className="text-[11px] uppercase tracking-wider text-[#8B92A5] font-bold mb-3">Rules checklist</Text>
                {pickers.strategyRules.map(rule => (
                  <TouchableOpacity key={rule.id} onPress={() => setters.toggleRuleCheck(rule.id)} className="flex-row items-center py-2.5" activeOpacity={0.7}>
                    <Ionicons name={ruleChecks[rule.id] ? 'checkbox' : 'square-outline'} size={22} color={ruleChecks[rule.id] ? '#00E68A' : '#3e3b4b'} />
                    <Text className="text-white text-sm font-medium ml-3 flex-1">{rule.rule_text}</Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            )}

            <Field label="Emotion (multi-select)">
              <View className="flex-row flex-wrap gap-2 mt-1">
                {pickers.emotions.map(e => (
                  <Chip key={e.id} label={e.name} selected={fields.emotionIds.includes(e.id)} onPress={() => setters.toggleEmotion(e.id)} />
                ))}
              </View>
            </Field>

            <Field label="Tags">
              <View className="flex-row flex-wrap gap-2 mt-1">
                {pickers.tags.map(t => <Chip key={t.id} label={t.name} selected={fields.tagIds.includes(t.id)} onPress={() => setters.toggleTag(t.id)} />)}
              </View>
            </Field>

            <Field label="Notes">
              <TextInputField
                value={fields.notes}
                onChangeText={setters.setNotes}
                placeholder="Thesis, observations, learnings..."
                multiline
                style={{ minHeight: 120 }}
              />
            </Field>

            <Field label="Screenshots">
              {fields.screenshots.length > 0 && (
                <View className="flex-row flex-wrap gap-2 mb-3 mt-1">
                  {fields.screenshots.map((uri, i) => (
                    <View key={uri}>
                      <Image source={{ uri }} className="w-20 h-20 rounded-xl bg-[#13141a]" />
                      <TouchableOpacity onPress={() => setters.removeScreenshot(i)} className="absolute -top-2 -right-2 bg-[#0d0e14] rounded-full">
                        <Ionicons name="close-circle" size={24} color="#FF4D6A" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              {fields.screenshots.length < 6 && (
                <Button title={`Add screenshot (${fields.screenshots.length}/6)`} variant="outline" onPress={setters.addScreenshots} />
              )}
            </Field>

          </SectionCard>
        </Animated.View>

        {/* ── Save ────────────────────────────────────────────────── */}
        <View className="mt-2 mb-6">
          {errors ? <Text className="text-[#FF4D6A] text-sm font-semibold mb-3 text-center">{errors}</Text> : null}
          <TouchableOpacity
            onPress={save}
            disabled={saving}
            activeOpacity={0.8}
            className="rounded-2xl h-[56px] items-center justify-center"
            style={{ backgroundColor: '#2563EB', opacity: saving ? 0.6 : 1 }}
          >
            <Text className="text-white font-black text-base tracking-wide">
              {saving ? 'Saving…' : (editMode ? 'Save Changes' : 'Save Trade')}
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ── Strategy Sheet ──────────────────────────────────────── */}
      <Sheet visible={strategySheetOpen} onClose={() => setStrategySheetOpen(false)} title="Strategy">
        <TouchableOpacity onPress={() => { setters.selectStrategy(null); setStrategySheetOpen(false); }} className="py-4 border-b border-[#2b2d3a] mt-4">
          <Text className="text-[#8B92A5] font-bold text-center">No strategy (Clear)</Text>
        </TouchableOpacity>
        {pickers.strategies.map(s => (
          <TouchableOpacity key={s.id} onPress={() => { setters.selectStrategy(s.id); setStrategySheetOpen(false); }} className="py-4 border-b border-[#2b2d3a] flex-row items-center justify-between" activeOpacity={0.7}>
            <View className="flex-1">
              <Text className="text-white font-bold text-base">{s.name}</Text>
              {s.description ? <Text className="text-[#8B92A5] text-sm mt-1">{s.description}</Text> : null}
            </View>
            {fields.strategyId === s.id ? <Ionicons name="checkmark-circle" size={22} color="#00E68A" /> : null}
          </TouchableOpacity>
        ))}
        <View className="h-6" />
      </Sheet>
    </KeyboardAvoidingView>
  );
}
