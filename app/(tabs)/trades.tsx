import React, { useState } from 'react';
import {
  View, Text, ScrollView, FlatList, TextInput, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Chip, EmptyState, Fab, TradeRow } from '../../src/ui';
import { useTrades } from '../../src/hooks/useTrades';
import { ASSET_CLASSES, TRADE_STYLES, AssetClassKey, TradeStyle } from '../../src/lib/constants';

type StatusFilter = 'all' | 'open' | 'closed';
type DirectionFilter = 'all' | 'long' | 'short';

export default function Trades() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { trades, loading, refetch } = useTrades();
  const [search, setSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState<StatusFilter>('all');
  const [activeDirection, setActiveDirection] = useState<DirectionFilter>('all');
  const [activeClass, setActiveClass] = useState<'all' | AssetClassKey>('all');
  const [activeStyle, setActiveStyle] = useState<'all' | TradeStyle>('all');

  const filtered = trades.filter((t) => {
    if (!t.symbol.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeStatus !== 'all') {
      if (activeStatus === 'open' && t.status !== 'open') return false;
      if (activeStatus === 'closed' && t.status !== 'closed') return false;
    }
    if (activeDirection !== 'all' && t.direction !== activeDirection) return false;
    if (activeClass !== 'all' && t.asset_class !== activeClass) return false;
    if (activeStyle !== 'all' && t.trade_style !== activeStyle) return false;
    return true;
  });

  const hasActiveFilters =
    search.length > 0 ||
    activeStatus !== 'all' ||
    activeDirection !== 'all' ||
    activeClass !== 'all' ||
    activeStyle !== 'all';

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-4">
        <Text className="text-2xl font-black text-slate-800 mb-3">Trade History</Text>

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
      </View>

      <View className="px-4 gap-y-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip
            label="All"
            selected={activeStatus === 'all' && activeDirection === 'all'}
            onPress={() => {
              setActiveStatus('all');
              setActiveDirection('all');
            }}
          />
          <Chip label="Open" selected={activeStatus === 'open'} onPress={() => setActiveStatus('open')} />
          <Chip label="Closed" selected={activeStatus === 'closed'} onPress={() => setActiveStatus('closed')} />
          <Chip label="Long" selected={activeDirection === 'long'} onPress={() => setActiveDirection('long')} />
          <Chip label="Short" selected={activeDirection === 'short'} onPress={() => setActiveDirection('short')} />
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All classes" selected={activeClass === 'all'} onPress={() => setActiveClass('all')} />
          {ASSET_CLASSES.map((ac) => (
            <Chip
              key={ac.key}
              label={ac.label}
              selected={activeClass === ac.key}
              onPress={() => setActiveClass(ac.key)}
            />
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All styles" selected={activeStyle === 'all'} onPress={() => setActiveStyle('all')} />
          {TRADE_STYLES.map((ts) => (
            <Chip
              key={ts.key}
              label={ts.label}
              selected={activeStyle === ts.key}
              onPress={() => setActiveStyle(ts.key)}
            />
          ))}
        </ScrollView>
      </View>

      {loading && trades.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 120 }}
          onRefresh={refetch}
          refreshing={loading}
          renderItem={({ item }) => (
            <TradeRow trade={item} onPress={() => router.push(`/trade/${item.id}`)} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title={hasActiveFilters ? 'No trades match your filters.' : 'No trades yet.'}
              subtitle="Tap + to log your first trade."
            />
          }
        />
      )}

      <View className="absolute bottom-8 right-6">
        <Fab onPress={() => router.push('/add-trade')} />
      </View>
    </View>
  );
}
