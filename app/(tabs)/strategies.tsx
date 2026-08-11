import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { EmptyState, StrategyFormSheet } from '../../src/ui';
import { formatPnl } from '../../src/lib/format';
import { useStrategies } from '../../src/hooks/useStrategies';
import { useAccountSetting } from '../../src/hooks/SettingsContext';

export default function StrategiesTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { strategies, statsByStrategy, loading, addStrategy } = useStrategies();
  const { displayUnit } = useAccountSetting();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><ActivityIndicator size="large" color="#00E68A" /></View>;
  }

  return (
    <View className="flex-1 bg-dark-bg" style={{ paddingTop: insets.top }}>
      <Animated.View entering={FadeIn.duration(400)} className="flex-row justify-between items-center px-4 pt-4 pb-2 bg-dark-bg">
        <Text className="text-2xl font-black text-dark-text">Strategies</Text>
        <TouchableOpacity onPress={() => setSheetOpen(true)} className="bg-[#1a1b24] p-3 rounded-2xl border border-[#2b2d3a]">
          <Ionicons name="add" size={20} color="#00E68A" />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 }}>
        {strategies.length === 0 ? (
          <EmptyState icon="bulb-outline" title="No strategies yet." subtitle="Tap the + button to create your first strategy." />
        ) : (
          strategies.map((s, i) => {
            const st = statsByStrategy[s.id];
            return (
              <Animated.View key={s.id} entering={FadeInDown.duration(400).delay(Math.min(i * 60, 600)).springify().damping(18)}>
                <TouchableOpacity
                  onPress={() => router.push(`/strategy/${s.id}`)}
                  activeOpacity={0.7}
                  className="bg-[#13141a] rounded-2xl p-4 mb-3 border border-[#1e1d2b]"
                >
                  <View className="flex-row items-center mb-2.5">
                    <View className="w-10 h-10 rounded-xl bg-[#1a1b24] border border-[#2b2d3a] items-center justify-center mr-3">
                      <Ionicons name="bulb" size={18} color="#00E68A" />
                    </View>
                    <View className="flex-1 pr-2">
                      <Text className="text-white text-lg font-black">{s.name}</Text>
                      {s.description ? <Text className="text-[#8B92A5] text-xs mt-0.5" numberOfLines={1}>{s.description}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#555B6E" />
                  </View>
                  <View className="flex-row items-center gap-4 px-1">
                    <View className="flex-1">
                      <Text className="text-[10px] uppercase tracking-wider text-[#6b6880] font-bold">Closed</Text>
                      <Text className="text-white font-bold" style={{ fontVariant: ['tabular-nums'] }}>{st.totalTrades}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-[10px] uppercase tracking-wider text-[#6b6880] font-bold">Win rate</Text>
                      <Text className="text-white font-bold" style={{ fontVariant: ['tabular-nums'] }}>
                        {st.totalTrades > 0 ? `${st.winRate.toFixed(0)}%` : '—'}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-[10px] uppercase tracking-wider text-[#6b6880] font-bold">Net</Text>
                      <Text className="font-black" style={{ color: st.netPnl >= 0 ? '#00E68A' : '#FF4D6A', fontVariant: ['tabular-nums'] }}>
                        {(st.netPnl >= 0 ? '+' : '−')}{formatPnl(st.netPnl, displayUnit)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      <StrategyFormSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onSubmit={addStrategy} />
    </View>
  );
}
