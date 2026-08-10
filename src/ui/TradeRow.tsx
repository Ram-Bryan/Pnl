import React from 'react';
import { Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { TradeWithInstrument, computeTradePnl } from '../stats/computeStats';
import { computeInvestedUsd } from '../stats/tradeMath';
import { formatPnl } from '../lib/format';

export function TradeRow({
  trade,
  onPress,
  index = 0,
  accountType = 'standard',
}: {
  trade: TradeWithInstrument;
  onPress: () => void;
  index?: number;
  accountType?: 'standard' | 'cents';
}) {
  const entryDate = new Date(trade.entry_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const isOpen = trade.status === 'open';
  const pnl = isOpen ? 0 : computeTradePnl(trade, accountType);
  const pnlColor = isOpen ? '#A8AEC1' : pnl >= 0 ? '#00E68A' : '#FF4D6A';
  const pnlFormatted = isOpen ? '–' : formatPnl(pnl, accountType);

  const directionColor = trade.direction === 'long' ? '#00E68A' : '#FF4D6A';
  const dirBg = trade.direction === 'long' ? 'rgba(0,230,138,0.1)' : 'rgba(255,77,106,0.1)';

  // Investment in USD, scaled for the account type (cent-account positions are 100x smaller)
  const invested = computeInvestedUsd({
    entryPrice: trade.entry_price,
    lots: trade.size,
    contractSize: trade.contract_size,
    quoteCurrency: trade.quote_currency,
    accountType,
  });

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 50).springify().damping(18)}>
      <Pressable
        onPress={onPress}
        className="mb-3 bg-dark-card rounded-2xl border border-dark-border p-4"
        style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
      >
        {/* ROW 1: Symbol & Direction | PnL */}
        <View className="flex-row items-center justify-between mb-2.5">
          <View className="flex-row items-center gap-x-3">
            <Text className="font-bold text-base text-white tracking-wide">{trade.symbol}</Text>
            <View
              className="px-2 py-0.5 rounded-md border"
              style={{ borderColor: directionColor, backgroundColor: dirBg }}
            >
              <Text style={{ color: directionColor }} className="text-[10px] font-bold uppercase tracking-widest">
                {trade.direction === 'long' ? 'LONG' : 'SHORT'}
              </Text>
            </View>
          </View>
          <Text style={{ color: pnlColor }} className="text-base font-black tracking-wide">
            {pnlFormatted}
          </Text>
        </View>

        {/* ROW 2: Investment */}
        <View className="flex-row items-center mb-2.5">
          <Ionicons name="wallet-outline" size={13} color="#6b6880" />
          <Text className="text-[12px] font-semibold ml-1.5" style={{ color: '#A8AEC1' }}>
            Inv: ${Math.round(invested)}
          </Text>
        </View>

        {/* ROW 3: Date · Status */}
        <View className="flex-row items-center gap-x-4">
          <View className="flex-row items-center gap-x-1">
            <Ionicons name="calendar-outline" size={12} color="#6b6880" />
            <Text className="text-[11px] font-medium" style={{ color: '#6b6880' }}>{entryDate}</Text>
          </View>
          <View
            className="px-2 py-0.5 rounded-md"
            style={{ backgroundColor: isOpen ? 'rgba(77,158,255,0.12)' : 'rgba(0,230,138,0.1)' }}
          >
            <Text
              className="text-[9px] font-bold uppercase tracking-widest"
              style={{ color: isOpen ? '#4D9EFF' : '#00E68A' }}
            >
              {isOpen ? 'Open' : 'Closed'}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
