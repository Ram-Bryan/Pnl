import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { PnlText } from './PnlText';
import { ASSET_CLASSES, TRADE_STYLES } from '../lib/constants';
import { TradeWithInstrument, computeTradePnl } from '../stats/computeStats';

export function TradeRow({ trade, onPress }: { trade: TradeWithInstrument; onPress: () => void }) {
  const assetClass = ASSET_CLASSES.find((c) => c.key === trade.asset_class);
  const styleLabel = TRADE_STYLES.find((s) => s.key === trade.trade_style)?.label ?? '—';
  const entryDate = trade.entry_at.slice(0, 10);
  const isOpen = trade.status === 'open';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} className="mb-3">
      <Card className="p-4 flex-row items-center">
        <View className="w-11 h-11 rounded-xl bg-emerald-50 items-center justify-center mr-3">
          <Ionicons name={assetClass?.icon ?? 'help-circle'} size={22} color="#059669" />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-x-2">
            <Text className="font-bold text-base text-slate-900">{trade.symbol}</Text>
            <View className={`px-2 py-0.5 rounded-md ${isOpen ? 'bg-amber-50' : 'bg-slate-100'}`}>
              <Text className={`text-xs font-bold capitalize ${isOpen ? 'text-amber-600' : 'text-slate-500'}`}>
                {trade.status}
              </Text>
            </View>
          </View>
          <Text className="text-slate-500 text-xs font-medium mt-0.5">
            {styleLabel} · {trade.direction === 'long' ? 'Long' : 'Short'} · {entryDate}
          </Text>
        </View>
        {isOpen ? (
          <Text className="text-slate-400 font-bold">–</Text>
        ) : (
          <PnlText value={computeTradePnl(trade)} />
        )}
      </Card>
    </TouchableOpacity>
  );
}
