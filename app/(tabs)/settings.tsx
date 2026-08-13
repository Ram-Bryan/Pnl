import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Switch, ScrollView, ActivityIndicator, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Segmented, NumericInput, Field } from '../../src/ui';
import { useAccountSetting } from '../../src/hooks/SettingsContext';
import { AccountType } from '../../src/stats/tradeMath';
import { useSQLiteContext } from 'expo-sqlite';
import { upsertGoal, getSetting, setSetting } from '../../src/db/database';
import { Goal } from '../../src/db/schema';

// ─── Inline Day/Month/Year Picker ────────────────────────────────────────────
const ITEM_H = 44;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

const DatePickerColumn = ({
  items,
  selectedIndex,
  onSelect,
}: {
  items: (string | number)[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) => (
  <View style={{ flex: 1 }}>
    <View style={{ height: ITEM_H * 4, overflow: 'hidden' }}>
      <ScrollView showsVerticalScrollIndicator={false} snapToInterval={ITEM_H} decelerationRate="fast">
        {items.map((item, i) => {
          const selected = selectedIndex === i;
          return (
            <Pressable
              key={String(item)}
              onPress={() => onSelect(i)}
              style={{
                height: ITEM_H,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: selected ? 'rgba(45,125,246,0.15)' : 'transparent',
                borderRadius: 10,
                marginBottom: 2,
              }}
            >
              <Text
                style={{
                  color: selected ? '#ffffff' : '#6b6880',
                  fontWeight: selected ? '800' : '500',
                  fontSize: selected ? 16 : 14,
                }}
              >
                {item}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  </View>
);

const TradingStartDatePicker = ({
  value,
  onChange,
}: {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
}) => {
  const parsed = value && value.length === 10 ? new Date(value) : new Date();
  const [selDay, setSelDay] = useState(parsed.getUTCDate() - 1);
  const [selMonth, setSelMonth] = useState(parsed.getUTCMonth());
  const thisYear = new Date().getUTCFullYear();
  const years = Array.from({ length: 8 }, (_, i) => thisYear - 6 + i);
  const [selYearIdx, setSelYearIdx] = useState(years.indexOf(parsed.getUTCFullYear() !== 0 ? parsed.getUTCFullYear() : thisYear));

  const selYear = years[selYearIdx] ?? thisYear;
  const numDays = daysInMonth(selYear, selMonth);
  const days = Array.from({ length: numDays }, (_, i) => String(i + 1).padStart(2, '0'));

  // Clamp day when month/year changes
  const clampedDay = Math.min(selDay, numDays - 1);

  const emit = (d: number, m: number, yIdx: number) => {
    const y = years[yIdx] ?? thisYear;
    const nDays = daysInMonth(y, m);
    const clD = Math.min(d, nDays - 1);
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(clD + 1).padStart(2, '0')}`;
    onChange(dateStr);
  };

  const handleDay = (i: number) => { setSelDay(i); emit(i, selMonth, selYearIdx); };
  const handleMonth = (i: number) => { setSelMonth(i); emit(selDay, i, selYearIdx); };
  const handleYear = (i: number) => { setSelYearIdx(i); emit(selDay, selMonth, i); };

  return (
    <View className="bg-[#13141a] rounded-2xl border border-[#2b2d3a] p-3 mt-1">
      {/* Column headers */}
      <View className="flex-row mb-1">
        <View style={{ flex: 1 }}><Text className="text-[10px] text-center font-bold tracking-widest text-[#6b6880] uppercase">Day</Text></View>
        <View style={{ flex: 1 }}><Text className="text-[10px] text-center font-bold tracking-widest text-[#6b6880] uppercase">Month</Text></View>
        <View style={{ flex: 1 }}><Text className="text-[10px] text-center font-bold tracking-widest text-[#6b6880] uppercase">Year</Text></View>
      </View>
      <View className="flex-row gap-x-2">
        <DatePickerColumn items={days} selectedIndex={clampedDay} onSelect={handleDay} />
        <View className="w-px bg-[#2b2d3a] my-2" />
        <DatePickerColumn items={MONTHS_SHORT} selectedIndex={selMonth} onSelect={handleMonth} />
        <View className="w-px bg-[#2b2d3a] my-2" />
        <DatePickerColumn items={years} selectedIndex={selYearIdx < 0 ? 5 : selYearIdx} onSelect={handleYear} />
      </View>
      {/* Current selection label */}
      <View className="items-center mt-2 pt-2 border-t border-[#2b2d3a]">
        <Text className="text-[#2d7df6] text-sm font-bold tracking-wide">{value || '—'}</Text>
      </View>
    </View>
  );
};

// ─── Settings Screen ──────────────────────────────────────────────────────────
export default function SettingsTab() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const { accountType, displayUnit, setAccountType, setDisplayUnit, loading } = useAccountSetting();

  const [weeklyGoal, setWeeklyGoal] = useState<string>('');
  const [dailyLossLimit, setDailyLossLimit] = useState<string>('');
  const [tradingStartDate, setTradingStartDate] = useState<string>('');
  const [savingPlan, setSavingPlan] = useState(false);

  useEffect(() => {
    const loadGoals = async () => {
      try {
        const pGoal = await db.getFirstAsync<Goal>(
          `SELECT * FROM goals WHERE kind = 'profit_goal' AND period = 'weekly' AND effective_to IS NULL ORDER BY effective_from DESC LIMIT 1`
        );
        const lLimit = await db.getFirstAsync<Goal>(
          `SELECT * FROM goals WHERE kind = 'loss_limit' AND period = 'daily' AND effective_to IS NULL ORDER BY effective_from DESC LIMIT 1`
        );
        const startDate = await getSetting(db, 'trading_start_date');

        if (pGoal) setWeeklyGoal((displayUnit === 'usc' ? pGoal.amount * 100 : pGoal.amount).toString());
        if (lLimit) setDailyLossLimit((displayUnit === 'usc' ? lLimit.amount * 100 : lLimit.amount).toString());

        if (startDate) setTradingStartDate(startDate);
        else setTradingStartDate(new Date().toISOString().slice(0, 10));
      } catch (e) {
        console.error('Failed to load goals:', e);
      }
    };
    loadGoals();
  }, [db, displayUnit]);

  const handleSavePlan = async () => {
    setSavingPlan(true);
    try {
      const wgNum = parseFloat(weeklyGoal.replace(/,/g, ''));
      const dlNum = parseFloat(dailyLossLimit.replace(/,/g, ''));

      const wgBase = displayUnit === 'usc' ? wgNum / 100 : wgNum;
      const dlBase = displayUnit === 'usc' ? dlNum / 100 : dlNum;

      if (!isNaN(wgNum) && wgNum > 0) {
        await upsertGoal(db, 'profit_goal', 'weekly', wgBase);
      }
      if (!isNaN(dlNum) && dlNum > 0) {
        await upsertGoal(db, 'loss_limit', 'daily', dlBase);
      }

      if (tradingStartDate && tradingStartDate.length === 10) {
        await setSetting(db, 'trading_start_date', tradingStartDate);
      }
    } catch (e) {
      console.error('Failed to save plan:', e);
    } finally {
      setSavingPlan(false);
    }
  };

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><ActivityIndicator size="large" color="#00E68A" /></View>;
  }

  const toggleDisplayUnit = async (value: boolean) => {
    await setDisplayUnit(value ? 'usc' : 'usd');
  };

  return (
    <View className="flex-1 bg-dark-bg" style={{ paddingTop: insets.top }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Animated.View entering={FadeIn.duration(400)} className="flex-row justify-between items-center px-4 pt-4 pb-2 bg-dark-bg">
        <Text className="text-2xl font-black text-dark-text">Settings</Text>
      </Animated.View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 }}>

          <Animated.View entering={FadeInDown.duration(400).springify()}>
            <View className="bg-[#1a1b24] border border-[#2b2d3a] rounded-2xl p-4 mb-4">
              <Text className="text-white font-bold text-base mb-3">Account Type</Text>
              <Segmented<AccountType>
                options={[{ key: 'standard', label: 'Standard' }, { key: 'cents', label: 'Cents' }]}
                value={accountType}
                onChange={(v) => setAccountType(v)}
              />
              <View className="bg-[#13141a] rounded-xl p-3 border border-[#1e1d2b] mt-3">
                <Text className="text-[#6b6880] text-[11px] font-medium leading-4">
                  Account type sets position sizing: cents accounts map lots to 100× smaller positions (MT5 cent-account sizing). Prices and fees are still entered as real values.
                </Text>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(400).springify()}>
            <View className="bg-[#1a1b24] border border-[#2b2d3a] rounded-2xl p-4 mb-4">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-xl bg-[#00E68A]/10 border border-[#00E68A]/20 items-center justify-center">
                    <Ionicons name="eye" size={20} color="#00E68A" />
                  </View>
                  <View>
                    <Text className="text-white font-bold text-base">Display Unit</Text>
                    <Text className="text-[#8B92A5] text-xs">Show PnL in USC instead of USD</Text>
                  </View>
                </View>
                <Switch
                  trackColor={{ false: '#3e3b4b', true: '#00E68A' }}
                  thumbColor={displayUnit === 'usc' ? '#13141a' : '#f4f3f4'}
                  ios_backgroundColor="#3e3b4b"
                  onValueChange={toggleDisplayUnit}
                  value={displayUnit === 'usc'}
                />
              </View>
              <View className="bg-[#13141a] rounded-xl p-3 border border-[#1e1d2b] mt-2">
                <Text className="text-[#6b6880] text-[11px] font-medium leading-4">
                  The display unit only changes how P&L is shown (1 USD = 100 USC). It never changes how positions are sized — that is set by the account type above.
                </Text>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(400).delay(100).springify()}>
            <View className="bg-[#1a1b24] border border-[#2b2d3a] rounded-2xl p-4 mb-4">
              {/* Header */}
              <View className="flex-row items-center gap-x-2 mb-4">
                <View className="w-8 h-8 rounded-xl bg-[#2d7df6]/10 border border-[#2d7df6]/20 items-center justify-center">
                  <Ionicons name="flag" size={16} color="#2d7df6" />
                </View>
                <Text className="text-white font-bold text-base">Trading Plan</Text>
              </View>

              <Field label={`Weekly Profit Goal (${displayUnit.toUpperCase()})`}>
                <NumericInput
                  value={weeklyGoal}
                  onChangeText={setWeeklyGoal}
                  placeholder="0.00"
                  align="left"
                />
              </Field>

              <View className="mt-3" />

              <Field label={`Daily Loss Limit (${displayUnit.toUpperCase()})`}>
                <NumericInput
                  value={dailyLossLimit}
                  onChangeText={setDailyLossLimit}
                  placeholder="0.00"
                  align="left"
                />
              </Field>

              <View className="mt-5">
                <Text className="text-[11px] font-bold tracking-widest uppercase text-[#8B92A5] mb-2">Trading Start Date</Text>
                <TradingStartDatePicker value={tradingStartDate} onChange={setTradingStartDate} />
              </View>

              <Pressable
                onPress={handleSavePlan}
                disabled={savingPlan}
                className={`mt-5 rounded-xl py-3.5 items-center justify-center ${savingPlan ? 'bg-[#2d7df6]/50' : 'bg-[#2d7df6]'}`}
              >
                {savingPlan ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-white font-bold tracking-wide">Save Trading Plan</Text>
                )}
              </Pressable>
            </View>
          </Animated.View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
