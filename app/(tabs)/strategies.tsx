import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Pressable } from 'react-native';
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
                <Pressable
                  onPress={() => router.push(`/strategy/${s.id}`)}
                  className="mb-3 bg-dark-card rounded-2xl border border-dark-border p-4"
                  style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                >
<View className="flex-row items-center justify-between">
                      <View className="flex-1 pr-4">
                        <Text className="font-bold text-base text-white tracking-wide">{s.name}</Text>
                        {st.totalTrades > 0 ? (
                          <>
                            <Text className="text-2xl font-black text-white mt-1.5" style={{ fontVariant: ['tabular-nums'] }}>
                              {st.winRate.toFixed(0)}%
                            </Text>
                            <Text className="text-lg text-dark-text-secondary mt-0.5" style={{ fontVariant: ['tabular-nums'] }}>
                              {st.totalTrades} trades
                            </Text>
                          </>
                        ) : (
                          <Text className="text-2xl font-black text-dark-text-muted mt-1.5">—</Text>
                        )}
                      </View>
                    <Text
                      className="text-base font-black tracking-wide"
                      style={{ color: st.netPnl >= 0 ? '#00E68A' : '#FF4D6A', fontVariant: ['tabular-nums'] }}
                    >
                      {(st.netPnl >= 0 ? '+' : '−')}{formatPnl(st.netPnl, displayUnit)}
                    </Text>
                  </View>
                </Pressable>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      <StrategyFormSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onSubmit={addStrategy} />
    </View>
  );
}
