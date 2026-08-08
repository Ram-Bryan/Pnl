import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTrades } from '../../src/hooks/useTrades';
import { TradeWithInstrument, computeTradePnl } from '../../src/stats/computeStats';

type FilterKey = 'all' | 'open' | 'closed' | 'long' | 'short';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'long', label: 'Long' },
  { key: 'short', label: 'Short' },
];

function formatPnl(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function TradeItem({ trade, onPress }: { trade: TradeWithInstrument; onPress: () => void }) {
  const pnl = computeTradePnl(trade);
  const isWin = pnl >= 0;
  const entryDate = trade.entry_at.slice(0, 10);

  return (
    <TouchableOpacity
      className="bg-white mx-4 mb-3 p-4 rounded-2xl shadow-sm border border-slate-100 flex-row justify-between items-center"
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View className="flex-row items-center flex-1">
        <View className="w-11 h-11 rounded-xl bg-slate-50 items-center justify-center mr-3">
          <Ionicons
            name={trade.direction === 'long' ? 'trending-up' : 'trending-down'}
            size={22}
            color={trade.direction === 'long' ? '#059669' : '#f43f5e'}
          />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-x-2">
            <Text className="font-bold text-base text-slate-900">{trade.symbol}</Text>
            <View className={`px-2 py-0.5 rounded-md ${trade.status === 'open' ? 'bg-amber-50' : 'bg-slate-100'}`}>
              <Text className={`text-xs font-bold capitalize ${trade.status === 'open' ? 'text-amber-600' : 'text-slate-500'}`}>
                {trade.status}
              </Text>
            </View>
          </View>
          <Text className="text-slate-500 text-xs font-medium mt-0.5">{entryDate}</Text>
        </View>
      </View>
      <View className={`px-3 py-1 rounded-lg ${isWin ? 'bg-emerald-50' : 'bg-rose-50'}`}>
        <Text className={`font-bold text-sm ${isWin ? 'text-emerald-700' : 'text-rose-500'}`}>
          {trade.status === 'open' ? '–' : formatPnl(pnl)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function Trades() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { trades, loading, refetch } = useTrades();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const filtered = trades.filter((t) => {
    const matchSearch = t.symbol.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (activeFilter === 'open') return t.status === 'open';
    if (activeFilter === 'closed') return t.status === 'closed';
    if (activeFilter === 'long') return t.direction === 'long';
    if (activeFilter === 'short') return t.direction === 'short';
    return true;
  });

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>

      {/* ── Header ── */}
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-black text-slate-800 mb-3">Trade History</Text>

        {/* Search */}
        <View className="flex-row items-center bg-white rounded-xl border border-slate-100 shadow-sm px-3 mb-3">
          <Ionicons name="search" size={18} color="#94a3b8" />
          <TextInput
            className="flex-1 py-3 px-2 text-slate-800 font-medium"
            placeholder="Search symbol…"
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="characters"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Chips */}
        <View className="flex-row gap-x-2">
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setActiveFilter(f.key)}
              className={`px-3 py-1.5 rounded-full border ${
                activeFilter === f.key
                  ? 'bg-emerald-600 border-emerald-600'
                  : 'bg-white border-slate-200'
              }`}
            >
              <Text className={`text-xs font-bold ${activeFilter === f.key ? 'text-white' : 'text-slate-600'}`}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Trade List ── */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 120 }}
          onRefresh={refetch}
          refreshing={loading}
          renderItem={({ item }) => (
            <TradeItem trade={item} onPress={() => router.push(`/trade/${item.id}`)} />
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <Ionicons name="receipt-outline" size={52} color="#cbd5e1" />
              <Text className="text-slate-400 font-medium mt-3 text-center">
                {search ? 'No trades match your search.' : 'No trades yet.\nTap + to log your first trade.'}
              </Text>
            </View>
          }
        />
      )}

      {/* ── FAB ── */}
      <View className="absolute bottom-8 right-6">
        <TouchableOpacity
          className="bg-emerald-600 w-16 h-16 rounded-full items-center justify-center shadow-lg"
          activeOpacity={0.8}
          onPress={() => router.push('/add-trade')}
        >
          <Ionicons name="add" size={32} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
