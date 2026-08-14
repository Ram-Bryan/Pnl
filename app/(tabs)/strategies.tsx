import React, { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { EmptyState, StrategyFormSheet, Fab } from '../../src/ui';
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
      <View className="px-4 pt-2 pb-2 bg-dark-bg flex-row items-center">
        <Text className="text-2xl font-black text-dark-text">Strategies</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 }}>
        {strategies.length === 0 ? (
          <EmptyState icon="bulb-outline" title="No strategies yet." subtitle="Tap + to create your first strategy." />
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
                          <View className='flex-row items-center gap-x-2'>
                            <View
                              className="py-0.5 rounded-md mt-2"
                              style={{ backgroundColor: 'rgba(0,230,138,0.1)' }}
                            ><Text
                              className="text-[12px] font-bold uppercase tracking-widest"
                              style={{ color: '#00E68A' }}
                            >Win rate: {st.winRate.toFixed(0)}%</Text>
                            </View>
                          </View>
                          <View className="flex-row items-center mt-2">
                            <Ionicons name='arrow-up-outline' size={13} color="#6b6880" />
                            <Text className="text-[12px] font-semibold ml-1.5" style={{ color: '#A8AEC1' }}>
                              {st.totalTrades} trades
                            </Text>
                          </View>
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

      <View className="absolute bottom-6 right-6">
        <Fab onPress={() => setSheetOpen(true)} />
      </View>
      <StrategyFormSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onSubmit={addStrategy} />
    </View>
  );
}
