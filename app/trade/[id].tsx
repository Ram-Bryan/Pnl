import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getTradeById, deleteTrade } from '../../src/db/database';
import { TradeWithInstrument, computeTradePnl } from '../../src/stats/computeStats';

function formatPnl(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function DetailRow({ label, value, valueClass = 'text-slate-800' }: { label: string; value: string; valueClass?: string }) {
  return (
    <View className="flex-row justify-between items-center py-3 border-b border-slate-100">
      <Text className="text-xs uppercase tracking-wider text-slate-500 font-bold">{label}</Text>
      <Text className={`font-semibold text-sm ${valueClass}`}>{value}</Text>
    </View>
  );
}

export default function TradeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();

  const [trade, setTrade] = useState<TradeWithInstrument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    db.getFirstAsync<TradeWithInstrument>(`
      SELECT t.*,
             i.symbol,
             i.name   AS instrument_name,
             i.price_mode,
             i.contract_size
      FROM   trades t
      JOIN   instruments i ON i.id = t.instrument_id
      WHERE  t.id = ?
    `, [parseInt(id, 10)])
      .then((row) => setTrade(row ?? null))
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function handleDelete() {
    Alert.alert('Delete Trade', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteTrade(db, parseInt(id!, 10));
          router.back();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  if (!trade) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <Ionicons name="alert-circle-outline" size={48} color="#f43f5e" />
        <Text className="text-slate-600 font-medium mt-3">Trade not found.</Text>
      </View>
    );
  }

  const pnl = computeTradePnl(trade);
  const pnlColor = pnl >= 0 ? 'text-emerald-600' : 'text-rose-500';

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingBottom: insets.bottom }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>

        {/* ── Hero ── */}
        <View className="bg-white rounded-3xl p-6 mb-6 shadow-sm border border-slate-100 items-center">
          <Text className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">{trade.symbol}</Text>
          <Text className={`text-4xl font-black mb-2 ${pnlColor}`}>
            {trade.status === 'open' ? 'Open' : formatPnl(pnl)}
          </Text>
          <View className="flex-row gap-x-3">
            <View className={`px-3 py-1 rounded-full ${trade.direction === 'long' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
              <Text className={`text-xs font-bold capitalize ${trade.direction === 'long' ? 'text-emerald-700' : 'text-rose-600'}`}>
                {trade.direction}
              </Text>
            </View>
            <View className="px-3 py-1 rounded-full bg-slate-100">
              <Text className="text-xs font-bold capitalize text-slate-600">{trade.status}</Text>
            </View>
          </View>
        </View>

        {/* ── Detail Rows ── */}
        <View className="bg-white rounded-2xl px-5 shadow-sm border border-slate-100 mb-6">
          <DetailRow label="Entry Price" value={`$${trade.entry_price.toFixed(4)}`} />
          {trade.exit_price != null && (
            <DetailRow label="Exit Price" value={`$${trade.exit_price.toFixed(4)}`} valueClass={pnlColor} />
          )}
          <DetailRow label="Size" value={String(trade.size)} />
          <DetailRow label="Fees" value={`$${trade.fees.toFixed(2)}`} />
          {trade.stop_loss != null && (
            <DetailRow label="Stop Loss" value={`$${trade.stop_loss.toFixed(4)}`} />
          )}
          {trade.take_profit != null && (
            <DetailRow label="Take Profit" value={`$${trade.take_profit.toFixed(4)}`} />
          )}
          <DetailRow label="Entry Date" value={trade.entry_at.slice(0, 16).replace('T', ' ')} />
          {trade.exit_at && (
            <DetailRow label="Exit Date" value={trade.exit_at.slice(0, 16).replace('T', ' ')} />
          )}
        </View>

        {/* ── Notes ── */}
        {trade.notes ? (
          <View className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-6">
            <Text className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Notes</Text>
            <Text className="text-slate-700 font-medium leading-5">{trade.notes}</Text>
          </View>
        ) : null}

        {/* ── Actions ── */}
        <TouchableOpacity
          className="flex-row items-center justify-center bg-rose-50 border border-rose-200 py-4 rounded-2xl"
          activeOpacity={0.7}
          onPress={handleDelete}
        >
          <Ionicons name="trash-outline" size={20} color="#f43f5e" />
          <Text className="text-rose-500 font-bold ml-2">Delete Trade</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}
