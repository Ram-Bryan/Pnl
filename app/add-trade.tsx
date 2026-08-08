import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getOrCreateInstrument, insertTrade } from '../src/db/database';

type Direction = 'long' | 'short';
type Status = 'open' | 'closed';

function FieldLabel({ text }: { text: string }) {
  return (
    <Text className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1 mt-4">
      {text}
    </Text>
  );
}

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (val: T) => void;
}) {
  return (
    <View className="flex-row bg-slate-100 rounded-xl p-1">
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.key}
          onPress={() => onChange(opt.key)}
          className={`flex-1 py-2.5 rounded-xl items-center shadow-none ${
            value === opt.key ? 'bg-white shadow-sm' : ''
          }`}
        >
          <Text
            className={`font-bold text-sm ${
              value === opt.key ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function StyledInput({
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  multiline?: boolean;
}) {
  return (
    <TextInput
      className={`bg-white border border-slate-200 rounded-xl px-4 text-slate-800 font-medium ${
        multiline ? 'py-3 min-h-[80px]' : 'py-3'
      }`}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      keyboardType={keyboardType}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
    />
  );
}

export default function AddTrade() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();

  const [symbol, setSymbol] = useState('');
  const [direction, setDirection] = useState<Direction>('long');
  const [status, setStatus] = useState<Status>('closed');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [size, setSize] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [entryAt, setEntryAt] = useState(() =>
    new Date().toISOString().slice(0, 16)
  );
  const [fees, setFees] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!symbol.trim()) return Alert.alert('Validation', 'Symbol is required.');
    if (!entryPrice.trim())
      return Alert.alert('Validation', 'Entry price is required.');
    if (!size.trim()) return Alert.alert('Validation', 'Size is required.');

    setSaving(true);
    try {
      const instrumentId = await getOrCreateInstrument(db, symbol.trim());
      const account = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM accounts LIMIT 1'
      );
      if (!account)
        throw new Error('No account found. Please restart the app.');

      await insertTrade(db, {
        account_id: account.id,
        instrument_id: instrumentId,
        strategy_id: null,
        emotion_id: null,
        direction,
        status,
        entry_price: parseFloat(entryPrice),
        exit_price: exitPrice ? parseFloat(exitPrice) : null,
        size: parseFloat(size),
        stop_loss: stopLoss ? parseFloat(stopLoss) : null,
        take_profit: takeProfit ? parseFloat(takeProfit) : null,
        entry_at: entryAt,
        exit_at: null,
        fees: parseFloat(fees) || 0,
        followed_rules: null,
        notes: notes || null,
        reflection: null,
      });

      router.back();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save trade.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 40 + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <FieldLabel text="Symbol *" />
        <StyledInput
          value={symbol}
          onChangeText={(v) => setSymbol(v.toUpperCase())}
          placeholder="e.g. AAPL, ETH, EUR/USD"
        />

        <FieldLabel text="Direction" />
        <ToggleGroup
          options={[
            { key: 'long' as Direction, label: '📈 Long' },
            { key: 'short' as Direction, label: '📉 Short' },
          ]}
          value={direction}
          onChange={setDirection}
        />

        <FieldLabel text="Status" />
        <ToggleGroup
          options={[
            { key: 'open' as Status, label: 'Open' },
            { key: 'closed' as Status, label: 'Closed' },
          ]}
          value={status}
          onChange={setStatus}
        />

        <FieldLabel text="Entry Price *" />
        <StyledInput
          value={entryPrice}
          onChangeText={setEntryPrice}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />

        <FieldLabel text="Exit Price" />
        <StyledInput
          value={exitPrice}
          onChangeText={setExitPrice}
          placeholder="0.00  (leave blank if open)"
          keyboardType="decimal-pad"
        />

        <FieldLabel text="Size / Quantity *" />
        <StyledInput
          value={size}
          onChangeText={setSize}
          placeholder="e.g. 100"
          keyboardType="decimal-pad"
        />

        <FieldLabel text="Stop Loss" />
        <StyledInput
          value={stopLoss}
          onChangeText={setStopLoss}
          placeholder="Optional"
          keyboardType="decimal-pad"
        />

        <FieldLabel text="Take Profit" />
        <StyledInput
          value={takeProfit}
          onChangeText={setTakeProfit}
          placeholder="Optional"
          keyboardType="decimal-pad"
        />

        <FieldLabel text="Entry Date & Time" />
        <StyledInput
          value={entryAt}
          onChangeText={setEntryAt}
          placeholder="2026-08-08T14:00"
        />

        <FieldLabel text="Fees / Commission" />
        <StyledInput
          value={fees}
          onChangeText={setFees}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />

        <FieldLabel text="Notes" />
        <StyledInput
          value={notes}
          onChangeText={setNotes}
          placeholder="What was your thesis?"
          multiline
        />

        <TouchableOpacity
          className="bg-emerald-600 py-4 rounded-2xl mt-8 items-center shadow-md"
          activeOpacity={0.8}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <Ionicons name="checkmark-circle" size={20} color="white" />
              <Text className="text-white font-black text-base">Save Trade</Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
