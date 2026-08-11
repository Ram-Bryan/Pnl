import React from 'react';
import { View, Text, Switch, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Segmented } from '../../src/ui';
import { useAccountSetting } from '../../src/hooks/SettingsContext';
import { AccountType } from '../../src/stats/tradeMath';
import { DisplayUnit } from '../../src/lib/format';

export default function SettingsTab() {
  const insets = useSafeAreaInsets();
  const { accountType, displayUnit, setAccountType, setDisplayUnit, loading } = useAccountSetting();

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

      </ScrollView>
    </View>
  );
}
