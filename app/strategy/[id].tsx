import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  Button, Card, SectionHeader, TradeRow, EmptyState, StrategyFormSheet, TextInputField, Sheet, WinRateDonut,
} from '../../src/ui';
import { formatPnl, DisplayUnit } from '../../src/lib/format';
import { RuleAdherence } from '../../src/stats/strategyStats';
import { useStrategies } from '../../src/hooks/useStrategies';
import { useStrategyDetail } from '../../src/hooks/useStrategyDetail';
import { useAccountSetting } from '../../src/hooks/SettingsContext';

function StatCell({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? '#00E68A' : tone === 'bad' ? '#FF4D6A' : '#F0F2F5';
  return (
    <View className="bg-[#13141a] rounded-2xl border border-[#1e1d2b] p-4">
      <Text className="text-[10px] uppercase tracking-wider text-[#6b6880] font-bold mb-1">{label}</Text>
      <Text className="text-lg font-black" style={{ color, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

function fmtSigned(v: number, displayUnit: DisplayUnit): string {
  return `${v >= 0 ? '+' : '−'}${formatPnl(v, displayUnit)}`;
}

export default function StrategyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const parsedId = parseInt(id, 10);
  const strategyId = Number.isNaN(parsedId) ? 0 : parsedId;

  const { strategy, stats, rules, recentTrades, loading, error, refetch } = useStrategyDetail(strategyId);
  const { addRule, updateRule, archiveRule, updateStrategy } = useStrategies();
  const { accountType, displayUnit } = useAccountSetting();

  const [editStrategyOpen, setEditStrategyOpen] = useState(false);
  const [ruleSheetOpen, setRuleSheetOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleAdherence | null>(null);
  const [ruleText, setRuleText] = useState('');

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><ActivityIndicator size="large" color="#00E68A" /></View>;
  }
  if (error) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><EmptyState icon="alert-circle-outline" title="Couldn't load this strategy." subtitle={error.message} /></View>;
  }
  if (!strategy) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><EmptyState icon="alert-circle-outline" title="Strategy not found." /></View>;
  }

  const openAddRule = () => { setEditingRule(null); setRuleText(''); setRuleSheetOpen(true); };
  const openEditRule = (rule: RuleAdherence) => { setEditingRule(rule); setRuleText(rule.ruleText); setRuleSheetOpen(true); };

  const saveRule = async () => {
    if (!ruleText.trim()) { Alert.alert('Validation', 'Rule text is required.'); return; }
    try {
      if (editingRule) await updateRule(editingRule.ruleId, ruleText.trim());
      else await addRule(strategy.id, ruleText.trim());
      await refetch();
      setRuleSheetOpen(false);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save rule.');
    }
  };

  const confirmArchiveRule = (rule: RuleAdherence) => {
    Alert.alert('Archive Rule', `Remove "${rule.ruleText}" from this strategy? Past trades keep it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: async () => { await archiveRule(rule.ruleId); await refetch(); } },
    ]);
  };

  return (
    <View className="flex-1 bg-dark-bg">
      <Stack.Screen options={{ title: 'Strategy' }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>

        <Animated.View entering={FadeIn.duration(400)}>
          <Card className="p-6 mb-5">
            <View className="flex-row items-start justify-between mb-3">
              <View className="flex-1 pr-4">
                <Text className="text-2xl font-black text-white mb-2">{strategy.name}</Text>
                {strategy.description ? <Text className="text-[#A8AEC1] leading-5 mb-4">{strategy.description}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => setEditStrategyOpen(true)} className="p-2 bg-[#1a1b24] rounded-xl border border-[#2b2d3a]">
                <Ionicons name="pencil" size={18} color="#8B92A5" />
              </TouchableOpacity>
            </View>
            <Button title="＋ New Trade" onPress={() => router.push(`/add-trade?strategyId=${strategy.id}`)} />
          </Card>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(400).delay(80)}>
          <Card className="p-6 mb-5">
            <SectionHeader title="Performance" />
            <View className="items-center mt-2 mb-4">
              <WinRateDonut winRate={stats.winRate} wins={stats.wins} losses={stats.losses} size={150} />
            </View>
            <View className="flex-row flex-wrap gap-3">
              <View className="flex-1 min-w-[45%]"><StatCell label="Net P&L" value={fmtSigned(stats.netPnl, displayUnit)} tone={stats.netPnl >= 0 ? 'good' : 'bad'} /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Trades" value={String(stats.totalTrades)} /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Avg Win" value={fmtSigned(stats.avgWin, displayUnit)} /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Avg Loss" value={fmtSigned(stats.avgLoss, displayUnit)} tone="bad" /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Best Trade" value={fmtSigned(stats.bestTrade, displayUnit)} tone="good" /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Worst Trade" value={fmtSigned(stats.worstTrade, displayUnit)} tone="bad" /></View>
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(400).delay(160)}>
          <Card className="p-6 mb-5">
            <View className="flex-row items-center justify-between mb-2">
              <SectionHeader title="Rules" />
              <TouchableOpacity onPress={openAddRule} className="flex-row items-center p-2">
                <Ionicons name="add-circle" size={18} color="#00E68A" />
                <Text className="text-[#00E68A] font-bold ml-1 text-sm">Add rule</Text>
              </TouchableOpacity>
            </View>
            {rules.length === 0 ? (
              <Text className="text-[#6b6880] text-sm py-3">No rules yet. Add the checklist you must follow for this strategy.</Text>
            ) : (
              rules.map((rule) => (
                <View key={rule.ruleId} className="flex-row items-center py-3 border-b border-dark-border">
                  <View className="flex-1">
                    <Text className="text-white text-sm font-semibold">{rule.ruleText}</Text>
                    <View className="mt-2 h-1.5 rounded-full bg-[#1e1d2b] overflow-hidden">
                      <View className="h-full rounded-full" style={{ width: `${rule.adherence}%`, backgroundColor: rule.adherence >= 70 ? '#00E68A' : rule.adherence >= 40 ? '#FFB547' : '#FF4D6A' }} />
                    </View>
                    <Text className="text-[11px] text-[#8B92A5] mt-1" style={{ fontVariant: ['tabular-nums'] }}>
                      {rule.checked}/{rule.checked + rule.unchecked} followed · {rule.adherence.toFixed(0)}%
                    </Text>
                  </View>
                  <View className="flex-row ml-3">
                    <TouchableOpacity onPress={() => openEditRule(rule)} className="p-2">
                      <Ionicons name="pencil" size={16} color="#8B92A5" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmArchiveRule(rule)} className="p-2">
                      <Ionicons name="trash-outline" size={16} color="#FF4D6A" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </Card>
        </Animated.View>

        {recentTrades.length > 0 && (
          <Animated.View entering={FadeIn.duration(400).delay(240)}>
            <Card className="p-6 mb-5">
              <SectionHeader title="Recent Trades" />
              <View className="mt-3">
                {recentTrades.map((trade, i) => (
                  <TradeRow key={trade.id} trade={trade} index={i} onPress={() => router.push(`/trade/${trade.id}`)} accountType={accountType} displayUnit={displayUnit} />
                ))}
              </View>
            </Card>
          </Animated.View>
        )}
      </ScrollView>

      <StrategyFormSheet
        visible={editStrategyOpen}
        onClose={() => setEditStrategyOpen(false)}
        initial={{ name: strategy.name, description: strategy.description }}
        onSubmit={async (input) => { await updateStrategy(strategy.id, input); await refetch(); }}
      />

      <Sheet visible={ruleSheetOpen} onClose={() => setRuleSheetOpen(false)} title={editingRule ? 'Edit Rule' : 'Add Rule'}>
        <View className="mt-4">
          <TextInputField value={ruleText} onChangeText={setRuleText} placeholder="e.g. Only trade after a liquidity sweep" multiline />
          <View className="pt-2 pb-4">
            <Button title="Save Rule" onPress={saveRule} />
          </View>
        </View>
      </Sheet>
    </View>
  );
}
