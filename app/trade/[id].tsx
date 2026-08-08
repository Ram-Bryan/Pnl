import React from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, Alert, FlatList, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, Card, Chip, PnlText, SectionHeader, EmptyState } from '../../src/ui';
import { ASSET_CLASSES, TRADE_STYLES } from '../../src/lib/constants';
import { formatPrice } from '../../src/lib/format';
import { averageFillPrice, totalQuantity } from '../../src/lib/aggregateFills';
import { computeTradePnl } from '../../src/stats/computeStats';
import { deleteTrade } from '../../src/db/database';
import { useTradeDetail } from '../../src/hooks/useTradeDetail';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-center py-3 border-b border-slate-100">
      <Text className="text-xs uppercase tracking-wider text-slate-500 font-bold">{label}</Text>
      <Text className="font-semibold text-sm text-slate-800">{value}</Text>
    </View>
  );
}

export default function TradeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();
  const parsedId = parseInt(id, 10);
  const { data, loading } = useTradeDetail(Number.isNaN(parsedId) ? 0 : parsedId);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <EmptyState icon="alert-circle-outline" title="Trade not found." />
      </View>
    );
  }

  const { trade, fills, tags, ruleChecks, screenshots, emotion } = data;
  const entryFills = fills.filter((f) => f.side === 'entry');
  const exitFills = fills.filter((f) => f.side === 'exit');
  const isOpen = trade.status === 'open';
  const assetClass = ASSET_CLASSES.find((c) => c.key === trade.asset_class);
  const styleLabel = TRADE_STYLES.find((s) => s.key === trade.trade_style)?.label;

  function handleDelete() {
    Alert.alert('Delete Trade', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTrade(db, trade.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <View className="flex-1 bg-slate-50">
      <Stack.Screen options={{ title: trade.symbol }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>

        <Card className="p-6 items-center mb-4">
          <View className="w-14 h-14 rounded-2xl bg-emerald-50 items-center justify-center mb-3">
            <Ionicons name={assetClass?.icon ?? 'help-circle'} size={26} color="#059669" />
          </View>
          <Text className="text-2xl font-black text-slate-900 mb-2">{trade.symbol}</Text>
          <View className="flex-row gap-2 mb-4">
            <Chip label={assetClass?.label ?? trade.asset_class} selected onPress={() => {}} />
            {styleLabel ? <Chip label={styleLabel} selected onPress={() => {}} /> : null}
          </View>
          {isOpen ? (
            <Text className="text-4xl font-black text-amber-500 mb-4">Open</Text>
          ) : (
            <PnlText value={computeTradePnl(trade)} size="text-4xl" />
          )}
          <View className="flex-row gap-2">
            <View className={`px-3 py-1 rounded-full ${trade.direction === 'long' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
              <Text className={`text-xs font-bold capitalize ${trade.direction === 'long' ? 'text-emerald-700' : 'text-rose-600'}`}>
                {trade.direction}
              </Text>
            </View>
            <View className={`px-3 py-1 rounded-full ${isOpen ? 'bg-amber-50' : 'bg-slate-100'}`}>
              <Text className={`text-xs font-bold capitalize ${isOpen ? 'text-amber-600' : 'text-slate-500'}`}>
                {trade.status}
              </Text>
            </View>
          </View>
        </Card>

        <Card className="p-5 mb-4">
          <SectionHeader title="Entry" />
          {entryFills.map((f) => (
            <View key={f.id} className="py-2 border-b border-slate-100">
              <Text className="text-slate-800 font-semibold text-sm">
                {formatPrice(f.price)} · {f.quantity}
              </Text>
              {f.note ? <Text className="text-slate-500 text-xs mt-0.5">{f.note}</Text> : null}
            </View>
          ))}
          <Text className="text-slate-500 text-sm font-semibold py-2" style={{ fontVariant: ['tabular-nums'] }}>
            Avg {formatPrice(averageFillPrice(entryFills))} · {totalQuantity(entryFills)} units
          </Text>
          {exitFills.length > 0 && (
            <>
              <View className="mt-4" />
              <SectionHeader title="Exit" />
              {exitFills.map((f) => (
                <View key={f.id} className="py-2 border-b border-slate-100">
                  <Text className="text-slate-800 font-semibold text-sm">
                    {formatPrice(f.price)} · {f.quantity}
                  </Text>
                  {f.note ? <Text className="text-slate-500 text-xs mt-0.5">{f.note}</Text> : null}
                </View>
              ))}
              <Text className="text-slate-500 text-sm font-semibold py-2" style={{ fontVariant: ['tabular-nums'] }}>
                Avg {formatPrice(averageFillPrice(exitFills))} · {totalQuantity(exitFills)} units
              </Text>
            </>
          )}
        </Card>

        <Card className="p-5 mb-4">
          <SectionHeader title="Plan" />
          <DetailRow label="Stop Loss" value={trade.stop_loss != null ? formatPrice(trade.stop_loss) : '—'} />
          {trade.take_profit != null && (
            <DetailRow label="Take Profit" value={formatPrice(trade.take_profit)} />
          )}
          <DetailRow label="Entry Condition" value={trade.entry_condition ?? '—'} />
          {trade.exit_condition != null && (
            <DetailRow label="Exit Condition" value={trade.exit_condition} />
          )}
          <DetailRow label="Entry Date" value={trade.entry_at.slice(0, 16).replace('T', ' ')} />
          {trade.exit_at != null && (
            <DetailRow label="Exit Date" value={trade.exit_at.slice(0, 16).replace('T', ' ')} />
          )}
        </Card>

        {trade.strategy_id != null && (
          <Card className="p-5 mb-4">
            <SectionHeader title="Strategy" />
            <Text className="font-bold text-slate-800 mb-2">{trade.strategy_name}</Text>
            {ruleChecks.map((rc) => (
              <View key={rc.ruleId} className="flex-row items-center py-2">
                <Ionicons
                  name={rc.checked ? 'checkmark-circle' : 'close-circle'}
                  size={20}
                  color={rc.checked ? '#059669' : '#94a3b8'}
                />
                <Text className="text-slate-700 text-sm font-medium ml-2 flex-1">{rc.rule_text}</Text>
              </View>
            ))}
          </Card>
        )}

        {trade.emotion_id != null && (
          <Card className="p-5 mb-4">
            <SectionHeader title="Emotion" />
            <View className="flex-row items-center">
              <View className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: emotion?.color ?? '#cbd5e1' }} />
              <Text className="text-slate-800 font-semibold">{trade.emotion_name}</Text>
            </View>
          </Card>
        )}

        {tags.length > 0 && (
          <Card className="p-5 mb-4">
            <SectionHeader title="Mistakes" />
            <View className="flex-row flex-wrap gap-2">
              {tags.map((t) => (
                <Chip key={t.id} label={t.name} selected onPress={() => {}} />
              ))}
            </View>
          </Card>
        )}

        {trade.notes ? (
          <Card className="p-5 mb-4">
            <SectionHeader title="Entry notes" />
            <Text className="text-slate-700 font-medium leading-5">{trade.notes}</Text>
          </Card>
        ) : null}

        {trade.reflection ? (
          <Card className="p-5 mb-4">
            <SectionHeader title="Exit notes" />
            <Text className="text-slate-700 font-medium leading-5">{trade.reflection}</Text>
          </Card>
        ) : null}

        {screenshots.length > 0 && (
          <Card className="p-5 mb-4">
            <SectionHeader title="Screenshots" />
            <FlatList
              horizontal
              data={screenshots}
              keyExtractor={(uri) => uri}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} className="w-40 h-28 rounded-xl bg-slate-100 mr-2" />
              )}
            />
          </Card>
        )}

        <Button title="Edit" onPress={() => router.push(`/add-trade?id=${trade.id}`)} />
        <View className="h-3" />
        <Button title="Delete" variant="danger" onPress={handleDelete} />

      </ScrollView>
    </View>
  );
}
