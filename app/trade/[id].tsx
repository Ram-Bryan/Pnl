import React, { useState } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, Alert, FlatList, Image, Modal, TouchableOpacity, Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Button, Card, Chip, PnlText, SectionHeader, EmptyState } from '../../src/ui';
import { ASSET_CLASSES, TRADE_STYLES } from '../../src/lib/constants';
import { formatPrice } from '../../src/lib/format';
import { computeTradePnl } from '../../src/stats/computeStats';
import { computeInvestedUsd } from '../../src/stats/tradeMath';
import { deleteTrade } from '../../src/db/database';
import { useTradeDetail } from '../../src/hooks/useTradeDetail';
import { useAccountSetting } from '../../src/hooks/SettingsContext';

function computeRR(entry: number, sl: number | null, tp: number | null, dir: 'long' | 'short'): string | null {
  if (sl == null || tp == null || sl <= 0 || tp <= 0) return null;
  const risk = dir === 'long' ? entry - sl : sl - entry;
  const reward = dir === 'long' ? tp - entry : entry - tp;
  if (risk <= 0 || reward <= 0) return null;
  return (reward / risk).toFixed(1);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-center py-4 border-b border-dark-border">
      <Text className="text-[12px] uppercase tracking-widest text-dark-text-muted font-bold">{label}</Text>
      <Text className="font-bold text-[15px] text-dark-text">{value}</Text>
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
  const { accountType, displayUnit } = useAccountSetting();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

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

  const { trade, tags, ruleChecks, screenshots, emotion } = data;
  const isOpen = trade.status === 'open';
  const assetClass = ASSET_CLASSES.find((c) => c.key === trade.asset_class);
  const pnl = computeTradePnl(trade);

  const investedUsd = computeInvestedUsd({
    entryPrice: trade.entry_price,
    lots: trade.size,
    contractSize: trade.contract_size || 1,
    quoteCurrency: trade.quote_currency || 'USD',
    accountType,
  });

  const returnPct = investedUsd > 0 ? (pnl / investedUsd) * 100 : 0;
  const rr = computeRR(trade.entry_price, trade.stop_loss, trade.take_profit, trade.direction);

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

  const pnlColor = pnl >= 0 ? '#00E68A' : '#FF4D6A';
  const pnlBg = pnl >= 0 ? 'rgba(0,230,138,0.1)' : 'rgba(255,77,106,0.1)';

  return (
    <View className="flex-1 bg-dark-bg">
      <Stack.Screen options={{ title: trade.symbol }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 32, paddingBottom: 120 + insets.bottom }}>

        <Card className="p-8 items-center mb-8 border" delay={0}>
          <View className="flex-row justify-between w-full items-center mb-4">
            <View className="px-3 py-1.5 rounded border flex-row items-center gap-2" style={{ backgroundColor: trade.direction === 'long' ? 'rgba(0,230,138,0.1)' : 'rgba(255,77,106,0.1)', borderColor: trade.direction === 'long' ? 'rgba(0,230,138,0.2)' : 'rgba(255,77,106,0.2)' }}>
              <Ionicons name={trade.direction === 'long' ? 'arrow-up' : 'arrow-down'} size={14} color={trade.direction === 'long' ? '#00E68A' : '#FF4D6A'} />
              <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: trade.direction === 'long' ? '#00E68A' : '#FF4D6A' }}>
                {trade.direction}
              </Text>
            </View>
            <Text className="text-dark-text-muted text-xs font-bold tracking-widest uppercase">
              {assetClass?.label ?? trade.asset_class}
            </Text>
          </View>

          {isOpen ? (
            <Text className="text-4xl font-black text-neon-amber mb-6" style={{ textShadowColor: 'rgba(255,181,71,0.4)', textShadowRadius: 16 }}>Open</Text>
          ) : (
            <View className=" items-center">
              <PnlText value={pnl} size="text-5xl" glow displayUnit={displayUnit} />
              <View className="px-3 py-1.5 rounded mt-4" style={{ backgroundColor: pnlBg }}>
                <Text style={{ color: pnlColor }} className="text-sm font-bold">
                  {returnPct > 0 ? '+' : ''}{returnPct.toFixed(3)}% Return
                </Text>
              </View>
            </View>
          )}

          {isOpen && (
            <View className="px-4 py-1.5 rounded-full mt-2" style={{ backgroundColor: 'rgba(255,181,71,0.15)', borderWidth: 1, borderColor: 'rgba(255,181,71,0.3)' }}>
              <Text className="text-sm font-bold capitalize text-[#FFB547]">
                Open
              </Text>
            </View>
          )}
        </Card>

        <Animated.View entering={FadeIn.duration(400).delay(100)}>
          <Card className="p-6 mb-6">
            <SectionHeader title="Entry Details" />
            <View className="pt-2">
              <DetailRow label="Price" value={formatPrice(trade.entry_price)} />
              <DetailRow label="Date" value={trade.entry_at.slice(0, 16).replace('T', ' ')} />
              <DetailRow label="Quantity" value={trade.size.toString()} />
              <DetailRow label="Stop Loss" value={trade.stop_loss != null ? formatPrice(trade.stop_loss) : '—'} />
              <DetailRow label="Take Profit" value={trade.take_profit != null ? formatPrice(trade.take_profit) : '—'} />
              {rr && <DetailRow label="Risk / Reward" value={`1:${rr}`} />}
              {trade.fees ? (
                <DetailRow
                  label="Fees"
                  value={
                    displayUnit === 'usc'
                      ? `${(trade.fees * (accountType === 'cents' ? 1 : 100)).toFixed(2)} USC`
                      : `$${(trade.fees * (accountType === 'cents' ? 0.01 : 1)).toFixed(2)}`
                  }
                />
              ) : null}
              <DetailRow label="Entry Condition" value={trade.entry_condition ?? '—'} />
            </View>
          </Card>

          {!isOpen && trade.exit_price != null && (
            <Card className="p-6 mb-6">
              <SectionHeader title="Exit Details" />
              <View className="pt-2">
                <DetailRow label="Price" value={formatPrice(trade.exit_price)} />
                <DetailRow label="Date" value={trade.exit_at ? trade.exit_at.slice(0, 16).replace('T', ' ') : '—'} />
                <DetailRow label="Exit Condition" value={trade.exit_condition ?? '—'} />
              </View>
            </Card>
          )}
        </Animated.View>

        <Animated.View entering={FadeIn.duration(400).delay(200)}>
          {trade.strategy_id != null && (
            <Card className="p-6 mb-6">
              <SectionHeader title="Strategy Execution" />
              <View className="pt-2 mb-4">
                <Text className="font-bold text-dark-text text-lg">{trade.strategy_name}</Text>
              </View>
              {ruleChecks.map((rc) => (
                <View key={rc.ruleId} className="flex-row items-start py-3 border-b border-dark-border">
                  <View className="pt-0.5">
                    <Ionicons
                      name={rc.checked ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={rc.checked ? '#00E68A' : '#555B6E'}
                    />
                  </View>
                  <Text className="text-dark-text-secondary text-[15px] font-medium ml-3 flex-1 leading-6">
                    {rc.rule_text}
                  </Text>
                </View>
              ))}
            </Card>
          )}

          {(trade.emotion_id != null || tags.length > 0) && (
            <Card className="p-6 mb-6">
              <SectionHeader title="Psychology & Tags" />
              <View className="pt-2">
                {trade.emotion_id != null && (
                  <View className="flex-row items-center mb-4">
                    <View className="w-5 h-5 rounded-full mr-3 shadow-md border border-[#2b2d3a]" style={{ backgroundColor: emotion?.color ?? '#555B6E' }} />
                    <Text className="text-dark-text font-bold text-base">{trade.emotion_name}</Text>
                  </View>
                )}
                {tags.length > 0 && (
                  <View className="flex-row flex-wrap gap-2">
                    {tags.map((t) => (
                      <Chip key={t.id} label={t.name} selected onPress={() => { }} />
                    ))}
                  </View>
                )}
              </View>
            </Card>
          )}

          {trade.notes ? (
            <Card className="p-6 mb-6">
              <SectionHeader title="Notes" />
              <View className="pt-2">
                <Text className="text-dark-text-secondary font-medium leading-relaxed text-[15px]">{trade.notes}</Text>
              </View>
            </Card>
          ) : null}

          {trade.reflection ? (
            <Card className="p-6 mb-6">
              <SectionHeader title="Exit Reflection" />
              <View className="pt-2">
                <Text className="text-dark-text-secondary font-medium leading-relaxed text-[15px]">{trade.reflection}</Text>
              </View>
            </Card>
          ) : null}

          {screenshots.length > 0 && (
            <Card className="p-6 mb-6">
              <SectionHeader title="Charts" />
              <View className="pt-2">
                <FlatList
                  horizontal
                  data={screenshots}
                  keyExtractor={(uri) => uri}
                  showsHorizontalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity onPress={() => setSelectedImage(item)} activeOpacity={0.8}>
                      <Image source={{ uri: item }} className="w-56 h-36 rounded-xl bg-dark-surface mr-3 border border-dark-border" />
                    </TouchableOpacity>
                  )}
                />
              </View>
            </Card>
          )}
        </Animated.View>
      </ScrollView>

      {/* Floating Action Buttons */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pt-4 border-t border-[#1e1d2b] flex-row gap-4" style={{ paddingBottom: Math.max(insets.bottom, 16), backgroundColor: 'rgba(19, 20, 26, 0.95)' }}>
        <View className="flex-1">
          <Button title="Edit" variant="blue-outline" onPress={() => router.push(`/add-trade?id=${trade.id}`)} />
        </View>
        <View className="flex-1">
          <Button title="Delete" variant="danger" onPress={handleDelete} />
        </View>
      </View>

      {/* Image Modal for zooming */}
      <Modal visible={!!selectedImage} transparent animationType="fade" onRequestClose={() => setSelectedImage(null)}>
        <View className="flex-1 bg-[#0a0e1a]/95 justify-center items-center">
          <TouchableOpacity
            className="absolute top-0 bottom-0 left-0 right-0"
            onPress={() => setSelectedImage(null)}
            activeOpacity={1}
          />
          {selectedImage && (
            <Image
              source={{ uri: selectedImage }}
              style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.7 }}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity
            className="absolute top-12 right-6 w-12 h-12 bg-[#1a1b24] rounded-full items-center justify-center border border-[#2b2d3a]"
            onPress={() => setSelectedImage(null)}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}
