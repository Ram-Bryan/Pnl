import React from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, Alert, FlatList, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Button, Card, Chip, PnlText, SectionHeader, EmptyState } from '../../src/ui';
import { ASSET_CLASSES, TRADE_STYLES } from '../../src/lib/constants';
import { formatPrice } from '../../src/lib/format';
import { averageFillPrice, totalQuantity } from '../../src/lib/aggregateFills';
import { computeTradePnl } from '../../src/stats/computeStats';
import { deleteTrade } from '../../src/db/database';
import { useTradeDetail } from '../../src/hooks/useTradeDetail';
import { useAccountSetting } from '../../src/hooks/SettingsContext';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-center py-3.5 border-b border-dark-border">
      <Text className="text-[11px] uppercase tracking-widest text-dark-text-muted font-bold">{label}</Text>
      <Text className="font-bold text-sm text-dark-text">{value}</Text>
    </View>
  );
}

export default function TradeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();
  const parsedId = parseInt(id, 10);
  const { data, error, loading } = useTradeDetail(Number.isNaN(parsedId) ? 0 : parsedId);
  const { accountType } = useAccountSetting();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-dark-bg">
        <ActivityIndicator size="large" color="#00E68A" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-dark-bg">
        <EmptyState icon="alert-circle-outline" title="Couldn't load this trade." subtitle={error} />
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-dark-bg">
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
  const pnl = computeTradePnl(trade, accountType);

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
    <View className="flex-1 bg-dark-bg">
      <Stack.Screen options={{ title: trade.symbol }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>

        <Card className="p-8 items-center mb-6 border" delay={0}>
          <View className="w-16 h-16 rounded-2xl bg-dark-surface items-center justify-center mb-4 border border-dark-border shadow-sm">
            <Ionicons name={assetClass?.icon ?? 'help-circle'} size={32} color="#F0F2F5" />
          </View>
          <Text className="text-3xl font-black text-dark-text mb-3">{trade.symbol}</Text>
          <View className="flex-row gap-3 mb-6">
            <Chip label={assetClass?.label ?? trade.asset_class} selected onPress={() => {}} />
            {styleLabel ? <Chip label={styleLabel} selected onPress={() => {}} /> : null}
          </View>
          {isOpen ? (
            <Text className="text-4xl font-black text-neon-amber mb-5" style={{ textShadowColor: 'rgba(255,181,71,0.4)', textShadowRadius: 16 }}>Open</Text>
          ) : (
            <View className="mb-5">
              <PnlText value={pnl} size="text-5xl" glow accountType={accountType} />
            </View>
          )}
          <View className="flex-row gap-2">
            <View className="px-4 py-1.5 rounded-full" style={{ backgroundColor: trade.direction === 'long' ? 'rgba(0,230,138,0.15)' : 'rgba(255,77,106,0.15)', borderWidth: 1, borderColor: trade.direction === 'long' ? 'rgba(0,230,138,0.3)' : 'rgba(255,77,106,0.3)' }}>
              <Text className="text-sm font-bold capitalize" style={{ color: trade.direction === 'long' ? '#00E68A' : '#FF4D6A' }}>
                {trade.direction}
              </Text>
            </View>
            <View className="px-4 py-1.5 rounded-full" style={{ backgroundColor: isOpen ? 'rgba(255,181,71,0.15)' : '#242940', borderWidth: 1, borderColor: isOpen ? 'rgba(255,181,71,0.3)' : '#1F2437' }}>
              <Text className="text-sm font-bold capitalize" style={{ color: isOpen ? '#FFB547' : '#8B92A5' }}>
                {trade.status}
              </Text>
            </View>
          </View>
        </Card>

        <Animated.View entering={FadeIn.duration(400).delay(100)}>
          <Card className="p-6 mb-5">
            <SectionHeader title="Fills" />
            {entryFills.map((f) => (
              <View key={f.id} className="py-2.5 border-b border-dark-border">
                <Text className="text-dark-text font-semibold text-[15px]">
                  {formatPrice(f.price)} · {f.quantity}
                </Text>
                {f.note ? <Text className="text-dark-text-muted text-xs mt-1">{f.note}</Text> : null}
              </View>
            ))}
            <Text className="text-neon-green text-sm font-bold py-3" style={{ fontVariant: ['tabular-nums'] }}>
              Avg {formatPrice(averageFillPrice(entryFills))} · {totalQuantity(entryFills)} units
            </Text>
            {exitFills.length > 0 && (
              <>
                <View className="h-px bg-dark-border my-2" />
                <Text className="text-xs font-bold text-dark-text-muted uppercase tracking-widest mt-2 mb-1">Exit Targets</Text>
                {exitFills.map((f) => (
                  <View key={f.id} className="py-2.5 border-b border-dark-border">
                    <Text className="text-dark-text font-semibold text-[15px]">
                      {formatPrice(f.price)} · {f.quantity}
                    </Text>
                    {f.note ? <Text className="text-dark-text-muted text-xs mt-1">{f.note}</Text> : null}
                  </View>
                ))}
                <Text className="text-neon-red text-sm font-bold py-3" style={{ fontVariant: ['tabular-nums'] }}>
                  Avg {formatPrice(averageFillPrice(exitFills))} · {totalQuantity(exitFills)} units
                </Text>
              </>
            )}
          </Card>

          <Card className="p-6 mb-5">
            <SectionHeader title="Plan & Execution" />
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
        </Animated.View>

        <Animated.View entering={FadeIn.duration(400).delay(200)}>
          {trade.strategy_id != null && (
            <Card className="p-6 mb-5">
              <SectionHeader title="Strategy Execution" />
              <Text className="font-bold text-dark-text text-lg mb-3">{trade.strategy_name}</Text>
              {ruleChecks.map((rc) => (
                <View key={rc.ruleId} className="flex-row items-center py-2.5">
                  <Ionicons
                    name={rc.checked ? 'checkmark-circle' : 'close-circle'}
                    size={22}
                    color={rc.checked ? '#00E68A' : '#555B6E'}
                  />
                  <Text className="text-dark-text-secondary text-sm font-medium ml-3 flex-1 leading-5">{rc.rule_text}</Text>
                </View>
              ))}
            </Card>
          )}

          {trade.emotion_id != null && (
            <Card className="p-6 mb-5">
              <SectionHeader title="Psychology" />
              <View className="flex-row items-center pt-1">
                <View className="w-4 h-4 rounded-full mr-3 shadow-md" style={{ backgroundColor: emotion?.color ?? '#555B6E' }} />
                <Text className="text-dark-text font-bold text-base">{trade.emotion_name}</Text>
              </View>
            </Card>
          )}

          {tags.length > 0 && (
            <Card className="p-6 mb-5">
              <SectionHeader title="Tags / Mistakes" />
              <View className="flex-row flex-wrap gap-2 pt-1">
                {tags.map((t) => (
                  <Chip key={t.id} label={t.name} selected onPress={() => {}} />
                ))}
              </View>
            </Card>
          )}

          {trade.notes ? (
            <Card className="p-6 mb-5">
              <SectionHeader title="Entry Thesis" />
              <Text className="text-dark-text-secondary font-medium leading-6 text-[15px]">{trade.notes}</Text>
            </Card>
          ) : null}

          {trade.reflection ? (
            <Card className="p-6 mb-5">
              <SectionHeader title="Exit Reflection" />
              <Text className="text-dark-text-secondary font-medium leading-6 text-[15px]">{trade.reflection}</Text>
            </Card>
          ) : null}

          {screenshots.length > 0 && (
            <Card className="p-6 mb-6">
              <SectionHeader title="Charts" />
              <FlatList
                horizontal
                data={screenshots}
                keyExtractor={(uri) => uri}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Image source={{ uri: item }} className="w-48 h-32 rounded-xl bg-dark-surface mr-3 border border-dark-border" />
                )}
              />
            </Card>
          )}

          <Button title="Edit Trade" onPress={() => router.push(`/add-trade?id=${trade.id}`)} />
          <View className="h-4" />
          <Button title="Delete" variant="danger" onPress={handleDelete} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}
