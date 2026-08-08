import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDashboard } from '../../src/hooks/useDashboard';
import { TradeWithInstrument, computeTradePnl } from '../../src/stats/computeStats';

function formatPnl(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mx-1 items-center">
      <Text className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">{label}</Text>
      <Text className="text-lg font-black text-slate-800">{value}</Text>
    </View>
  );
}

function TradeRow({ trade }: { trade: TradeWithInstrument }) {
  const pnl = computeTradePnl(trade);
  const isWin = pnl >= 0;
  const router = useRouter();

  return (
    <TouchableOpacity
      className="bg-white p-4 rounded-2xl mb-3 shadow-sm border border-slate-100 flex-row justify-between items-center"
      activeOpacity={0.7}
      onPress={() => router.push(`/trade/${trade.id}`)}
    >
      <View className="flex-row items-center">
        <View className="w-11 h-11 rounded-xl bg-slate-50 items-center justify-center mr-3">
          <Ionicons
            name={trade.direction === 'long' ? 'trending-up' : 'trending-down'}
            size={22}
            color={trade.direction === 'long' ? '#059669' : '#f43f5e'}
          />
        </View>
        <View>
          <Text className="font-bold text-base text-slate-900">{trade.symbol}</Text>
          <Text className="text-slate-500 text-xs font-medium capitalize">{trade.direction} • {trade.size} units</Text>
        </View>
      </View>
      <View className={`px-3 py-1 rounded-lg ${isWin ? 'bg-emerald-50' : 'bg-rose-50'}`}>
        <Text className={`font-bold text-sm ${isWin ? 'text-emerald-700' : 'text-rose-500'}`}>
          {trade.status === 'open' ? 'Open' : formatPnl(pnl)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { stats, recentTrades, weeklyGoal, loading, refetch } = useDashboard();

  const todayColor = stats.todayPnl >= 0 ? 'text-emerald-600' : 'text-rose-500';
  const goalProgress = weeklyGoal ? Math.min(stats.weekPnl / weeklyGoal.amount, 1) : 0;

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>

        {/* ── Hero P&L ── */}
        <View className="items-center mb-8 mt-4">
          <Text className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">Today's P&L</Text>
          <Text className={`text-5xl font-black ${todayColor}`}>{formatPnl(stats.todayPnl)}</Text>
        </View>

        {/* ── Weekly Goal Progress ── */}
        {weeklyGoal ? (
          <View className="bg-white p-5 rounded-3xl mb-6 shadow-sm border border-slate-100">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-slate-800 font-bold text-lg">Weekly Goal</Text>
              <Text className="text-emerald-600 font-bold text-sm">
                {formatPnl(stats.weekPnl)} / ${weeklyGoal.amount.toFixed(0)}
              </Text>
            </View>
            <View className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <View
                className="bg-emerald-500 h-full rounded-full"
                style={{ width: `${Math.round(goalProgress * 100)}%` }}
              />
            </View>
          </View>
        ) : null}

        {/* ── Quick Stats Row ── */}
        <View className="flex-row mb-6">
          <StatCard label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} />
          <StatCard label="Trades" value={String(stats.totalTrades)} />
          <StatCard
            label="Prof. Factor"
            value={isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'}
          />
        </View>

        {/* ── Recent Trades ── */}
        <View className="flex-row justify-between items-center mb-4 px-1">
          <Text className="text-xl font-bold text-slate-800">Recent Trades</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/trades')}>
            <Text className="text-emerald-600 font-bold text-sm">See All</Text>
          </TouchableOpacity>
        </View>

        {recentTrades.length === 0 ? (
          <View className="items-center py-10">
            <Ionicons name="receipt-outline" size={48} color="#cbd5e1" />
            <Text className="text-slate-400 font-medium mt-3">No trades yet. Tap + to add your first.</Text>
          </View>
        ) : (
          recentTrades.map((trade) => <TradeRow key={trade.id} trade={trade} />)
        )}

      </ScrollView>

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
