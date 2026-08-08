import React, { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Card, EmptyState, Fab, PnlText, SectionHeader, Segmented, TradeRow } from '../../src/ui';
import { useDashboard } from '../../src/hooks/useDashboard';
import { formatMoney, formatPnl } from '../../src/lib/format';

type Period = 'today' | 'week' | 'month';

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today's P&L",
  week: "This Week's P&L",
  month: "This Month's P&L",
};

// Sparkline is deliberately static (plan: purely decorative, no runtime data/animation).
const SPARK_HEIGHTS = [16, 28, 20, 36, 24, 32, 20, 40, 28, 24];
const SPARK_TINTS = ['bg-emerald-500/40', 'bg-emerald-500/70', 'bg-emerald-500'];

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour <= 11) return 'Good morning';
  if (hour >= 12 && hour <= 16) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { stats, recentTrades, weeklyGoal, loading, error } = useDashboard();
  const [period, setPeriod] = useState<Period>('today');

  const selectedPnl = period === 'today' ? stats.todayPnl : period === 'week' ? stats.weekPnl : stats.monthPnl;
  const goalProgress = weeklyGoal ? Math.min(Math.max(stats.weekPnl / weeklyGoal.amount, 0), 1) : 0;
  const dimSpark = stats.totalTrades === 0;

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <EmptyState icon="alert-circle-outline" title="Couldn't load dashboard." subtitle={error.message} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>

        <View className="flex-row justify-between items-center mb-6">
          <View>
            <Text className="text-sm text-slate-500 font-medium">{greetingForHour(new Date().getHours())}</Text>
            <Text className="text-2xl font-black text-slate-800">Dashboard</Text>
          </View>
          <View className="w-10 h-10 rounded-full bg-emerald-50 items-center justify-center">
            <Text className="text-sm font-black text-emerald-700">PN</Text>
          </View>
        </View>

        <Card className="p-6 items-center mb-6">
          <Text className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">{PERIOD_LABELS[period]}</Text>
          <PnlText value={selectedPnl} size="text-4xl" />
          <View className="w-4/5 mt-5">
            <Segmented
              options={[
                { key: 'today', label: 'Today' },
                { key: 'week', label: 'Week' },
                { key: 'month', label: 'Month' },
              ]}
              value={period}
              onChange={setPeriod}
            />
          </View>
          <View className="flex-row items-end gap-1 mt-5">
            {SPARK_HEIGHTS.map((h, i) => (
              <View
                key={i}
                className={`w-1.5 rounded-full ${dimSpark ? 'bg-slate-200' : SPARK_TINTS[i % SPARK_TINTS.length]}`}
                style={{ height: h }}
              />
            ))}
          </View>
        </Card>

        {weeklyGoal ? (
          <Card className="p-5 mb-6">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-bold text-slate-800">Weekly Goal</Text>
              <Text className="text-sm font-bold text-emerald-600">
                {formatPnl(stats.weekPnl)} / {formatMoney(weeklyGoal.amount)}
              </Text>
            </View>
            <View className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <View
                className="bg-emerald-500 h-full rounded-full"
                style={{ width: `${Math.round(goalProgress * 100)}%` }}
              />
            </View>
          </Card>
        ) : null}

        <View className="flex-row mb-6">
          <Card className="flex-1 mx-1 p-4 items-center">
            <Text className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">Win Rate</Text>
            <Text className="text-lg font-black text-slate-800">{stats.winRate.toFixed(0)}%</Text>
          </Card>
          <Card className="flex-1 mx-1 p-4 items-center">
            <Text className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">Trades</Text>
            <Text className="text-lg font-black text-slate-800">{String(stats.totalTrades)}</Text>
          </Card>
          <Card className="flex-1 mx-1 p-4 items-center">
            <Text className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">Prof. Factor</Text>
            <Text className="text-lg font-black text-slate-800">
              {isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'}
            </Text>
          </Card>
        </View>

        <SectionHeader
          title="Recent trades"
          actionLabel="See All"
          onAction={() => router.push('/(tabs)/trades')}
        />
        {recentTrades.length === 0 ? (
          <EmptyState icon="receipt-outline" title="No trades yet." subtitle="Tap + to log your first trade." />
        ) : (
          recentTrades.map((trade) => (
            <TradeRow key={trade.id} trade={trade} onPress={() => router.push(`/trade/${trade.id}`)} />
          ))
        )}

      </ScrollView>

      <View className="absolute bottom-8 right-6">
        <Fab onPress={() => router.push('/add-trade')} />
      </View>
    </View>
  );
}
