import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  Button, Chip, Segmented, Field, TextInputField, NumericInput, SectionHeader, Sheet,
} from '../src/ui';
import { ASSET_CLASSES, TRADE_STYLES, ENTRY_CONDITIONS, EXIT_CONDITIONS } from '../src/lib/constants';
import { formatPrice } from '../src/lib/format';
import { averageFillPrice, totalQuantity } from '../src/lib/aggregateFills';
import { useAddTrade } from '../src/hooks/useAddTrade';

function FillRowEditor({
  row,
  onRemove,
  setRow,
}: {
  row: { price: string; quantity: string; note: string };
  onRemove: () => void;
  setRow: (patch: Partial<{ price: string; quantity: string; note: string }>) => void;
}) {
  return (
    <View className="mb-4">
      <View className="flex-row gap-2">
        <View className="flex-1">
          <NumericInput value={row.price} onChangeText={(v) => setRow({ price: v })} placeholder="Price" />
        </View>
        <View className="flex-1">
          <NumericInput value={row.quantity} onChangeText={(v) => setRow({ quantity: v })} placeholder="Qty" />
        </View>
      </View>
      <View className="flex-row items-center gap-2 mt-2">
        <View className="flex-1">
          <TextInputField value={row.note} onChangeText={(v) => setRow({ note: v })} placeholder="Note (optional)" />
        </View>
        <TouchableOpacity onPress={onRemove} className="p-2">
          <Ionicons name="remove-circle" size={24} color="#f43f5e" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FillSummary({ rows }: { rows: { price: string; quantity: string }[] }) {
  const valid = rows
    .filter((r) => r.price.trim() && r.quantity.trim())
    .map((r) => ({ price: parseFloat(r.price), quantity: parseFloat(r.quantity) }));
  const avg = averageFillPrice(valid);
  const size = totalQuantity(valid);
  return (
    <Text
      className="text-slate-500 text-sm font-semibold mb-3 px-1"
      style={{ fontVariant: ['tabular-nums'] }}
    >
      Avg {formatPrice(avg)} · Size {size}
    </Text>
  );
}

function SelectRow({
  value,
  placeholder,
  onPress,
}: {
  value: string | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex-row items-center justify-between"
      activeOpacity={0.7}
    >
      <Text className={value ? 'text-slate-800 font-medium' : 'text-slate-400 font-medium'}>
        {value ?? placeholder}
      </Text>
      <Ionicons name="chevron-down" size={18} color="#94a3b8" />
    </TouchableOpacity>
  );
}

export default function AddTrade() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const parsedId = id ? parseInt(id, 10) : undefined;
  const tradeId = parsedId != null && !Number.isNaN(parsedId) ? parsedId : undefined;

  const {
    fields, setters, pickers, errors, fillRows,
    addFill, removeFill, setFill, saving, save, editMode, loading, ruleChecks,
  } = useAddTrade({ tradeId });

  const [strategySheetOpen, setStrategySheetOpen] = useState(false);
  const [entryConditionSheetOpen, setEntryConditionSheetOpen] = useState(false);
  const [exitConditionSheetOpen, setExitConditionSheetOpen] = useState(false);

  const selectedStrategyName = fields.strategyId != null
    ? pickers.strategies.find((s) => s.id === fields.strategyId)?.name ?? null
    : null;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ title: editMode ? 'Edit Trade' : 'Add Trade' }} />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 40 + insets.bottom,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Instrument */}
          <Field label="Instrument type">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
            >
              {ASSET_CLASSES.map((ac) => (
                <Chip
                  key={ac.key}
                  label={ac.label}
                  selected={fields.assetClass === ac.key}
                  onPress={() => setters.setAssetClass(ac.key)}
                />
              ))}
            </ScrollView>
          </Field>

          <Field label="Symbol *">
            <TextInputField
              value={fields.symbol}
              onChangeText={(v) => setters.setSymbol(v.toUpperCase())}
              placeholder="e.g. AAPL, ETH, EUR/USD"
            />
          </Field>

          <Field label="Price mode">
            <Segmented
              options={[
                { key: 'standard', label: 'Standard' },
                { key: 'cents', label: 'Cents' },
              ]}
              value={fields.priceMode}
              onChange={setters.setPriceMode}
            />
          </Field>

          {/* Trade style */}
          <Field label="Style">
            <Segmented options={TRADE_STYLES} value={fields.style} onChange={setters.setStyle} />
          </Field>

          {/* Direction */}
          <Field label="Direction">
            <Segmented
              options={[
                { key: 'long', label: '▲ Long' },
                { key: 'short', label: '▼ Short' },
              ]}
              value={fields.direction}
              onChange={setters.setDirection}
            />
          </Field>

          {/* Status */}
          <Field label="Status">
            <Segmented
              options={[
                { key: 'open', label: 'Open' },
                { key: 'closed', label: 'Closed' },
              ]}
              value={fields.status}
              onChange={setters.setStatus}
            />
          </Field>

          {/* Entry fills */}
          <SectionHeader title="Entry" />
          {fillRows.entry.map((row, i) => (
            <FillRowEditor
              key={i}
              row={row}
              onRemove={() => removeFill('entry', i)}
              setRow={(patch) => setFill('entry', i, patch)}
            />
          ))}
          <FillSummary rows={fillRows.entry} />
          <Button title="＋ Add entry fill" variant="ghost" onPress={() => addFill('entry')} />

          {/* Exit fills */}
          {fields.status === 'closed' && (
            <View className="mt-6">
              <SectionHeader title="Exit" />
              {fillRows.exit.map((row, i) => (
                <FillRowEditor
                  key={i}
                  row={row}
                  onRemove={() => removeFill('exit', i)}
                  setRow={(patch) => setFill('exit', i, patch)}
                />
              ))}
              <FillSummary rows={fillRows.exit} />
              <Button title="＋ Add exit fill" variant="ghost" onPress={() => addFill('exit')} />
            </View>
          )}

          {/* Stop loss / Take profit */}
          <View className="flex-row gap-2 mt-6">
            <View className="flex-1">
              <Field label="Stop loss">
                <NumericInput value={fields.stopLoss} onChangeText={setters.setStopLoss} placeholder="Optional" />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="Take profit">
                <NumericInput value={fields.takeProfit} onChangeText={setters.setTakeProfit} placeholder="Optional" />
              </Field>
            </View>
          </View>

          {/* Strategy */}
          <Field label="Strategy">
            <SelectRow
              value={selectedStrategyName}
              placeholder="Select strategy"
              onPress={() => setStrategySheetOpen(true)}
            />
          </Field>
          {fields.strategyId != null && pickers.strategyRules.length > 0 && (
            <View className="bg-white border border-slate-100 rounded-xl px-4 py-3 mb-4">
              <Text className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">Rules</Text>
              {pickers.strategyRules.map((rule) => (
                <TouchableOpacity
                  key={rule.id}
                  onPress={() => setters.toggleRuleCheck(rule.id)}
                  className="flex-row items-center py-2"
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={ruleChecks[rule.id] ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={ruleChecks[rule.id] ? '#059669' : '#94a3b8'}
                  />
                  <Text className="text-slate-700 text-sm font-medium ml-2 flex-1">{rule.rule_text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Emotion */}
          <Field label="Emotion">
            <View className="flex-row flex-wrap gap-2">
              {pickers.emotions.map((e) => (
                <Chip
                  key={e.id}
                  label={e.name}
                  selected={fields.emotionId === e.id}
                  onPress={() => setters.toggleEmotion(e.id)}
                />
              ))}
            </View>
          </Field>

          {/* Mistakes / Tags */}
          <Field label="Mistakes / Tags">
            <View className="flex-row flex-wrap gap-2">
              {pickers.tags.map((t) => (
                <Chip
                  key={t.id}
                  label={t.name}
                  selected={fields.tagIds.includes(t.id)}
                  onPress={() => setters.toggleTag(t.id)}
                />
              ))}
            </View>
          </Field>

          {/* Conditions */}
          <Field label="Entry condition">
            <SelectRow
              value={fields.entryCondition}
              placeholder="Select"
              onPress={() => setEntryConditionSheetOpen(true)}
            />
          </Field>
          <Field label="Exit condition">
            <SelectRow
              value={fields.exitCondition}
              placeholder="Select"
              onPress={() => setExitConditionSheetOpen(true)}
            />
          </Field>

          {/* Entry date & time */}
          <Field label="Entry date & time">
            <TextInputField
              value={fields.entryAt}
              onChangeText={setters.setEntryAt}
              placeholder="YYYY-MM-DDTHH:mm"
            />
          </Field>

          {/* Fees */}
          <Field label="Fees">
            <NumericInput value={fields.fees} onChangeText={setters.setFees} placeholder="0" />
          </Field>

          {/* Entry notes / Exit notes */}
          <Field label="Entry notes">
            <TextInputField
              value={fields.entryNotes}
              onChangeText={setters.setEntryNotes}
              placeholder="What was your thesis?"
              multiline
            />
          </Field>
          <Field label="Exit notes">
            <TextInputField
              value={fields.exitNotes}
              onChangeText={setters.setExitNotes}
              placeholder="What did you learn?"
              multiline
            />
          </Field>

          {/* Screenshots */}
          <Field label="Screenshots">
            {fields.screenshots.length > 0 && (
              <View className="flex-row flex-wrap gap-2 mb-3">
                {fields.screenshots.map((uri, i) => (
                  <View key={uri}>
                    <Image source={{ uri }} className="w-20 h-20 rounded-xl bg-slate-100" />
                    <TouchableOpacity
                      onPress={() => setters.removeScreenshot(i)}
                      className="absolute -top-2 -right-2 bg-white rounded-full"
                    >
                      <Ionicons name="close-circle" size={22} color="#f43f5e" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            {fields.screenshots.length < 6 && (
              <Button
                title={`Add screenshots (${fields.screenshots.length}/6)`}
                variant="outline"
                onPress={setters.addScreenshots}
              />
            )}
          </Field>

          {/* Save */}
          {errors ? (
            <Text className="text-rose-500 text-xs font-semibold mb-2 text-center">{errors}</Text>
          ) : null}
          <Button
            title={editMode ? 'Save Changes' : 'Save Trade'}
            loading={saving}
            onPress={save}
          />
        </ScrollView>
      )}

      <Sheet visible={strategySheetOpen} onClose={() => setStrategySheetOpen(false)} title="Strategy">
        <TouchableOpacity
          onPress={() => {
            setters.selectStrategy(null);
            setStrategySheetOpen(false);
          }}
          className="py-3 border-b border-slate-100"
        >
          <Text className="text-slate-400 font-medium">No strategy</Text>
        </TouchableOpacity>
        {pickers.strategies.map((s) => (
          <TouchableOpacity
            key={s.id}
            onPress={() => {
              setters.selectStrategy(s.id);
              setStrategySheetOpen(false);
            }}
            className="py-3 border-b border-slate-100 flex-row items-center justify-between"
            activeOpacity={0.7}
          >
            <View className="flex-1">
              <Text className="text-slate-800 font-bold text-sm">{s.name}</Text>
              {s.description ? <Text className="text-slate-400 text-xs mt-0.5">{s.description}</Text> : null}
            </View>
            {fields.strategyId === s.id ? (
              <Ionicons name="checkmark-circle" size={20} color="#059669" />
            ) : null}
          </TouchableOpacity>
        ))}
      </Sheet>

      <Sheet
        visible={entryConditionSheetOpen}
        onClose={() => setEntryConditionSheetOpen(false)}
        title="Entry condition"
      >
        <TouchableOpacity
          onPress={() => {
            setters.setEntryCondition(null);
            setEntryConditionSheetOpen(false);
          }}
          className="py-3 border-b border-slate-100"
        >
          <Text className="text-slate-400 font-medium">None</Text>
        </TouchableOpacity>
        {ENTRY_CONDITIONS.map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => {
              setters.setEntryCondition(c);
              setEntryConditionSheetOpen(false);
            }}
            className="py-3 border-b border-slate-100 flex-row items-center justify-between"
            activeOpacity={0.7}
          >
            <Text className="text-slate-800 font-medium">{c}</Text>
            {fields.entryCondition === c ? (
              <Ionicons name="checkmark-circle" size={20} color="#059669" />
            ) : null}
          </TouchableOpacity>
        ))}
      </Sheet>

      <Sheet
        visible={exitConditionSheetOpen}
        onClose={() => setExitConditionSheetOpen(false)}
        title="Exit condition"
      >
        <TouchableOpacity
          onPress={() => {
            setters.setExitCondition(null);
            setExitConditionSheetOpen(false);
          }}
          className="py-3 border-b border-slate-100"
        >
          <Text className="text-slate-400 font-medium">None</Text>
        </TouchableOpacity>
        {EXIT_CONDITIONS.map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => {
              setters.setExitCondition(c);
              setExitConditionSheetOpen(false);
            }}
            className="py-3 border-b border-slate-100 flex-row items-center justify-between"
            activeOpacity={0.7}
          >
            <Text className="text-slate-800 font-medium">{c}</Text>
            {fields.exitCondition === c ? (
              <Ionicons name="checkmark-circle" size={20} color="#059669" />
            ) : null}
          </TouchableOpacity>
        ))}
      </Sheet>
    </KeyboardAvoidingView>
  );
}
