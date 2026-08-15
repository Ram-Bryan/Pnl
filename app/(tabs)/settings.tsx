import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, KeyboardAvoidingView, Platform, TouchableOpacity, Alert } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Segmented, NumericInput, Field } from '../../src/ui';
import { useAccountSetting } from '../../src/hooks/SettingsContext';
import { AccountType } from '../../src/stats/tradeMath';
import { useSQLiteContext } from 'expo-sqlite';
import { upsertGoal, getSetting, setSetting } from '../../src/db/database';
import { Goal } from '../../src/db/schema';

// ─── Date Picker (calendar tap → DateTimePicker modal) ───────────────────────
function toYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const TradingStartDatePicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const dateObj = useMemo(() => {
    try { return value && value.length === 10 ? new Date(value + 'T12:00:00') : new Date(); }
    catch { return new Date(); }
  }, [value]);

  const onDateChange = (_: DateTimePickerEvent, sel?: Date) => {
    setShowPicker(false);
    if (sel) onChange(toYmd(sel));
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        className="bg-[#13141a] border border-[#1e1d2b] rounded-xl px-4 h-[52px] flex-row items-center justify-between"
        activeOpacity={0.7}
      >
        <Text className="text-white font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
          {dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
        </Text>
        <Ionicons name="calendar-outline" size={18} color="#6b6880" />
      </TouchableOpacity>
      {showPicker && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={onDateChange}
          themeVariant="dark"
        />
      )}
    </>
  );
};

// ─── Settings Screen ──────────────────────────────────────────────────────────
export default function SettingsTab() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const { accountType, displayUnit, setAccountType, setDisplayUnit, loading, currentPrices, setCurrentPrice } = useAccountSetting();

  const [weeklyGoal, setWeeklyGoal] = useState<string>('');
  const [dailyLossLimit, setDailyLossLimit] = useState<string>('');
  const [tradingStartDate, setTradingStartDate] = useState<string>('');
  const [savingPlan, setSavingPlan] = useState(false);

  const [openSymbols, setOpenSymbols] = useState<string[]>([]);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      (async () => {
        try {
          const rows = await db.getAllAsync<{ symbol: string }>(
            `SELECT DISTINCT i.symbol
             FROM trades t
             JOIN instruments i ON i.id = t.instrument_id
             WHERE t.status = 'open'
             ORDER BY i.symbol`
          );
          if (!active) return;
          const symbols = rows.map(r => r.symbol);
          setOpenSymbols(symbols);
          const drafts: Record<string, string> = {};
          for (const s of symbols) {
            const v = currentPrices[s];
            drafts[s] = v != null ? String(v) : '';
          }
          setPriceDrafts(drafts);
        } catch (e) {
          console.error('Failed to load open symbols:', e);
        }
      })();
      return () => { active = false; };
    }, [db, currentPrices]),
  );

  const handleSavePrices = async () => {
    setSavingPrices(true);
    try {
      for (const symbol of openSymbols) {
        const raw = priceDrafts[symbol] ?? '';
        const num = parseFloat(raw.replace(/,/g, ''));
        await setCurrentPrice(symbol, Number.isFinite(num) ? num : null);
      }
    } catch (e) {
      console.error('Failed to save current prices:', e);
      Alert.alert('Save Failed', e instanceof Error ? e.message : 'Failed to save current prices.');
    } finally {
      setSavingPrices(false);
    }
  };

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
      Alert.alert('Save Failed', e instanceof Error ? e.message : 'Failed to save your trading plan.');
    } finally {
      setSavingPlan(false);
    }
  };

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><ActivityIndicator size="large" color="#00E68A" /></View>;
  }

  const displayUnitSuffix = displayUnit === 'usc' ? 'USC' : '$';

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
                  Account type sets position sizing: cents accounts map lots to 100× smaller positions (MT5 cent-account sizing). Prices are entered as real values; fees are entered in the account's unit (USC on cents accounts).
                </Text>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(400).springify()}>
            <View className="bg-[#1a1b24] border border-[#2b2d3a] rounded-2xl p-4 mb-4">
              <View className="flex-row items-center gap-x-2 mb-3">
                <View className="w-8 h-8 rounded-xl bg-[#00E68A]/10 border border-[#00E68A]/20 items-center justify-center">
                  <Ionicons name="eye" size={16} color="#00E68A" />
                </View>
                <Text className="text-white font-bold text-base">Display Unit</Text>
              </View>
              <Segmented<'usd' | 'usc'>
                options={[{ key: 'usd', label: 'USD ($)' }, { key: 'usc', label: 'USC' }]}
                value={displayUnit}
                onChange={setDisplayUnit}
              />
              <View className="bg-[#13141a] rounded-xl p-3 border border-[#1e1d2b] mt-3">
                <Text className="text-[#6b6880] text-[11px] font-medium leading-4">
                  The display unit only changes how P&L is shown (1 USD = 100 USC). It never changes how positions are sized — that is set by the account type above.
                </Text>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(400).springify()}>
            <View className="bg-[#1a1b24] border border-[#2b2d3a] rounded-2xl p-4 mb-4">
              <View className="flex-row items-center gap-x-2 mb-4">
                <View className="w-8 h-8 rounded-xl bg-[#2d7df6]/10 border border-[#2d7df6]/20 items-center justify-center">
                  <Ionicons name="calendar" size={16} color="#2d7df6" />
                </View>
                <Text className="text-white font-bold text-base">Trading Start Date</Text>
              </View>
              <TradingStartDatePicker value={tradingStartDate} onChange={setTradingStartDate} />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(400).delay(50).springify()}>
            <View className="bg-[#1a1b24] border border-[#2b2d3a] rounded-2xl p-4 mb-4">
              <View className="flex-row items-center gap-x-2 mb-4">
                <View className="w-8 h-8 rounded-xl bg-[#00E68A]/10 border border-[#00E68A]/20 items-center justify-center">
                  <Ionicons name="cash-outline" size={16} color="#00E68A" />
                </View>
                <Text className="text-white font-bold text-base">Current Prices</Text>
              </View>
              <View className="bg-[#13141a] rounded-xl p-3 border border-[#1e1d2b] mb-3">
                <Text className="text-[#6b6880] text-[11px] font-medium leading-4">
                  Set a price for each open position so its floating P&L counts toward your totals. Leave a field empty and save to clear it.
                </Text>
              </View>
              {openSymbols.length === 0 ? (
                <Text className="text-[#6b6880] text-sm font-medium">No open positions.</Text>
              ) : (
                <>
                  {openSymbols.map(symbol => (
                    <View key={symbol} className="mb-3">
                      <Field label={symbol}>
                        <NumericInput
                          value={priceDrafts[symbol] ?? ''}
                          onChangeText={v => setPriceDrafts(prev => ({ ...prev, [symbol]: v }))}
                          placeholder="0.00"
                          align="left"
                        />
                      </Field>
                    </View>
                  ))}
                  <Pressable
                    onPress={handleSavePrices}
                    disabled={savingPrices}
                    className={`mt-1 rounded-xl py-3.5 items-center justify-center ${savingPrices ? 'bg-[#2d7df6]/50' : 'bg-[#2d7df6]'}`}
                  >
                    {savingPrices ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text className="text-white font-bold tracking-wide">Save Current Prices</Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(400).delay(100).springify()}>
            <View className="bg-[#1a1b24] border border-[#2b2d3a] rounded-2xl p-4 mb-4">
              <View className="flex-row items-center gap-x-2 mb-4">
                <View className="w-8 h-8 rounded-xl bg-[#2d7df6]/10 border border-[#2d7df6]/20 items-center justify-center">
                  <Ionicons name="flag" size={16} color="#2d7df6" />
                </View>
                <Text className="text-white font-bold text-base">Trading Plan</Text>
              </View>

              <Field label="Weekly Profit Goal">
                <NumericInput
                  value={weeklyGoal}
                  onChangeText={setWeeklyGoal}
                  placeholder="0.00"
                  align="left"
                  suffix={displayUnitSuffix}
                />
              </Field>

              <View className="mt-3" />

              <Field label="Daily Loss Limit">
                <NumericInput
                  value={dailyLossLimit}
                  onChangeText={setDailyLossLimit}
                  placeholder="0.00"
                  align="left"
                  suffix={displayUnitSuffix}
                />
              </Field>

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
