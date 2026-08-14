import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, Pressable, ScrollView, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { EmptyState, AddTradeFab, ImportConfirmModal, TradeRow, Segmented, Pagination } from '../../src/ui';
import { Sheet } from '../../src/ui/Sheet';
import { useTrades } from '../../src/hooks/useTrades';
import { useAccountSetting } from '../../src/hooks/SettingsContext';
import { useCsvImport } from '../../src/hooks/useCsvImport';
import { computeTradePnl } from '../../src/stats/computeStats';
import { DisplayUnit } from '../../src/lib/format';
import { ASSET_CLASSES, TRADE_STYLES } from '../../src/lib/constants';

type DirectionFilter = 'all' | 'long' | 'short';
type StatusFilter   = 'all' | 'open' | 'closed';

interface FilterState {
  direction: DirectionFilter;
  status: StatusFilter;
  styles: string[]; // empty means all
  assets: string[]; // empty means all
  sizeMin: string;
  sizeMax: string;
  pnlMin: string;
  pnlMax: string;
  entryDateMin: string;
  entryDateMax: string;
  exitDateMin: string;
  exitDateMax: string;
  qtyMin: string;
  qtyMax: string;
}

const EMPTY_FILTERS: FilterState = {
  direction: 'all', status: 'all', styles: [], assets: [],
  sizeMin: '', sizeMax: '', pnlMin: '', pnlMax: '',
  entryDateMin: '', entryDateMax: '', exitDateMin: '', exitDateMax: '',
  qtyMin: '', qtyMax: '',
};

const PAGE_SIZE = 10;

// ─── Segmented Switcher ──────────────────────────────────────────────────────
function FilterSwitch<T extends string>({
  options, value, onChange, isStatusOrDir = false
}: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void, isStatusOrDir?: boolean }) {
  return (
    <View className="flex-row bg-[#13141a] rounded-2xl p-1 gap-x-1">
      {options.map(o => {
        const isSelected = value === o.key;
        let selectedColor = '#00E68A';
        if (isStatusOrDir && isSelected) {
          if (o.key === 'short' || o.key === 'closed') selectedColor = '#FF4D6A';
          if (o.key === 'long' || o.key === 'open') selectedColor = '#00E68A';
        }
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            className="flex-1 py-3 rounded-xl items-center"
            style={{ backgroundColor: isSelected ? selectedColor : 'transparent' }}
          >
            <Text
              className="font-bold text-sm"
              style={{ color: isSelected ? (isStatusOrDir && (o.key === 'open' || o.key === 'closed' || o.key === 'all' || o.key === 'long' || o.key === 'short') ? '#13141a' : '#fff') : '#6b6880' }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Range Input Pair ────────────────────────────────────────────────────────
function RangeInput({
  minVal, maxVal, onMinChange, onMaxChange, prefix = '',
}: { minVal: string; maxVal: string; onMinChange: (v: string) => void; onMaxChange: (v: string) => void; prefix?: string }) {
  return (
    <View className="flex-row gap-x-3">
      <View className="flex-1 bg-[#13141a] rounded-xl px-3 h-[52px] border border-[#1e1d2b] flex-row items-center">
        {prefix ? <Text className="text-[#6b6880] text-xs mr-1">{prefix}</Text> : null}
        <TextInput
          className="flex-1 text-white text-sm"
          placeholder="Min"
          placeholderTextColor="#3e3b4b"
          keyboardType="numeric"
          value={minVal}
          onChangeText={onMinChange}
        />
      </View>
      <View className="flex-1 bg-[#13141a] rounded-xl px-3 h-[52px] border border-[#1e1d2b] flex-row items-center">
        {prefix ? <Text className="text-[#6b6880] text-xs mr-1">{prefix}</Text> : null}
        <TextInput
          className="flex-1 text-white text-sm"
          placeholder="Max"
          placeholderTextColor="#3e3b4b"
          keyboardType="numeric"
          value={maxVal}
          onChangeText={onMaxChange}
        />
      </View>
    </View>
  );
}

// ─── Date Range Input Pair ───────────────────────────────────────────────────
function DatePickerField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const dateObj = value ? new Date(value) : new Date();

  const formatted = value 
    ? `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`
    : '';

  return (
    <View className="flex-1">
      <TouchableOpacity
        onPress={() => setShowDate(true)}
        className="bg-[#13141a] rounded-xl px-3 h-[52px] border border-[#1e1d2b] flex-row items-center justify-between"
      >
        <Text className="text-sm font-medium pt-0.5" style={{ color: value ? '#fff' : '#3e3b4b' }}>
          {formatted || placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={16} color="#8B92A5" />
      </TouchableOpacity>
      {showDate && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(ev, sel) => {
            setShowDate(false);
            if (sel) {
              const merged = new Date(dateObj);
              merged.setFullYear(sel.getFullYear(), sel.getMonth(), sel.getDate());
              const toIso = (d: Date) => {
                const p = (n: number) => String(n).padStart(2, '0');
                return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
              };
              onChange(toIso(merged));
              setTimeout(() => setShowTime(true), 300);
            }
          }}
          themeVariant="dark"
        />
      )}
      {showTime && (
        <DateTimePicker
          value={dateObj}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(ev, sel) => {
            setShowTime(false);
            if (sel) {
              const merged = new Date(dateObj);
              merged.setHours(sel.getHours(), sel.getMinutes(), sel.getSeconds());
              const toIso = (d: Date) => {
                const p = (n: number) => String(n).padStart(2, '0');
                return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
              };
              onChange(toIso(merged));
            }
          }}
          themeVariant="dark"
        />
      )}
    </View>
  );
}

function DateRangeInput({
  minVal, maxVal, onMinChange, onMaxChange,
}: { minVal: string; maxVal: string; onMinChange: (v: string) => void; onMaxChange: (v: string) => void }) {
  return (
    <View className="flex-row gap-x-3">
      <DatePickerField value={minVal} onChange={onMinChange} placeholder="From Date" />
      <DatePickerField value={maxVal} onChange={onMaxChange} placeholder="To Date" />
    </View>
  );
}

// ─── Filter Section Label ────────────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return <Text className="text-xl font-black text-white mb-4 uppercase tracking-wide">{label}</Text>;
}

// ─── Filter Sheet ────────────────────────────────────────────────────────────
function FilterSheet({
  visible, onClose, draft, setDraft, onApply, onClear, displayUnit,
}: {
  visible: boolean;
  onClose: () => void;
  draft: FilterState;
  setDraft: (f: FilterState) => void;
  onApply: () => void;
  onClear: () => void;
  displayUnit: DisplayUnit;
}) {
  const set = useCallback(<K extends keyof FilterState>(key: K, val: FilterState[K]) => {
    setDraft({ ...draft, [key]: val });
  }, [draft, setDraft]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Filters">
      {/* Clear All */}
      <Pressable onPress={onClear} className="self-end mb-6 mt-2">
        <Text className="text-[#00E68A] text-sm font-black">Clear All</Text>
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1 mt-2">

        {/* Direction */}
        <View className="mb-8 mt-2">
          <SectionLabel label="Direction" />
          <Segmented
            options={[{ key: 'all', label: 'All' }, { key: 'long', label: 'Long' }, { key: 'short', label: 'Short' }]}
            value={draft.direction}
            onChange={(v) => set('direction', v as DirectionFilter)}
            dangerKeys={['short']}
          />
        </View>

        {/* Status */}
        <View className="mb-8">
          <SectionLabel label="Status" />
          <Segmented
            options={[{ key: 'all', label: 'All' }, { key: 'open', label: 'Open' }, { key: 'closed', label: 'Closed' }]}
            value={draft.status}
            onChange={(v) => set('status', v as StatusFilter)}
            dangerKeys={['closed']}
          />
        </View>

        {/* Style */}
        <View className="mb-8">
          <SectionLabel label="Style" />
          <View className="flex-row flex-wrap">
            {TRADE_STYLES.map(s => {
              const selected = draft.styles.includes(s.key);
              return (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => {
                    const newArr = selected ? draft.styles.filter(x => x !== s.key) : [...draft.styles, s.key];
                    set('styles', newArr);
                  }}
                  className="w-1/2 flex-row items-center py-2.5 pr-2"
                  activeOpacity={0.7}
                >
                  <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={22} color={selected ? '#00E68A' : '#555B6E'} />
                  <Text className="text-white text-sm font-medium ml-3 flex-1">{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Asset Class */}
        <View className="mb-8">
          <SectionLabel label="Asset Class" />
          <View className="flex-row flex-wrap">
            {ASSET_CLASSES.map(a => {
              const selected = draft.assets.includes(a.key);
              return (
                <TouchableOpacity
                  key={a.key}
                  onPress={() => {
                    const newArr = selected ? draft.assets.filter(x => x !== a.key) : [...draft.assets, a.key];
                    set('assets', newArr);
                  }}
                  className="w-1/2 flex-row items-center py-2.5 pr-2"
                  activeOpacity={0.7}
                >
                  <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={22} color={selected ? '#00E68A' : '#555B6E'} />
                  <Text className="text-white text-sm font-medium ml-3 flex-1">{a.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Investment (size) */}
        <View className="mb-8">
          <SectionLabel label="Investment (Size)" />
          <RangeInput
            minVal={draft.sizeMin} maxVal={draft.sizeMax}
            onMinChange={v => set('sizeMin', v)} onMaxChange={v => set('sizeMax', v)}
            prefix="$"
          />
        </View>

        {/* PnL */}
        <View className="mb-8">
          <SectionLabel label={displayUnit === 'usc' ? 'Profit & Loss (USC)' : 'Profit & Loss'} />
          <RangeInput
            minVal={draft.pnlMin} maxVal={draft.pnlMax}
            onMinChange={v => set('pnlMin', v)} onMaxChange={v => set('pnlMax', v)}
            prefix={displayUnit === 'usc' ? '' : '$'}
          />
        </View>

        {/* Entry Date */}
        <View className="mb-8">
          <SectionLabel label="Entry Date" />
          <DateRangeInput
            minVal={draft.entryDateMin} maxVal={draft.entryDateMax}
            onMinChange={v => set('entryDateMin', v)} onMaxChange={v => set('entryDateMax', v)}
          />
        </View>

        {/* Exit Date */}
        <View className="mb-8">
          <SectionLabel label="Exit Date" />
          <DateRangeInput
            minVal={draft.exitDateMin} maxVal={draft.exitDateMax}
            onMinChange={v => set('exitDateMin', v)} onMaxChange={v => set('exitDateMax', v)}
          />
        </View>

        {/* Quantity */}
        <View className="mb-8">
          <SectionLabel label="Quantity" />
          <RangeInput
            minVal={draft.qtyMin} maxVal={draft.qtyMax}
            onMinChange={v => set('qtyMin', v)} onMaxChange={v => set('qtyMax', v)}
          />
        </View>

        <View className="h-10" />
      </ScrollView>

      {/* Apply */}
      <View className="pt-2">
        <Pressable
          onPress={onApply}
          className="bg-[#2d7df6] rounded-2xl py-4 items-center"
        >
          <Text className="text-white font-black tracking-wide">Apply Filters</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function Trades() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { trades, loading, refetch } = useTrades();
  const { accountType, displayUnit } = useAccountSetting();
  const { importing, summary, pickFile, confirmImport, cancelImport } = useCsvImport({
    onImported: () => refetch(),
  });

  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);

  const [page, setPage] = useState(1);

  // All distinct symbols from loaded trades (for autocomplete)
  const allSymbols = useMemo(() => {
    const seen = new Set<string>();
    trades.forEach(t => seen.add(t.symbol));
    return Array.from(seen).sort();
  }, [trades]);

  // Autocomplete suggestions: populate natively as the user types
  const suggestions = useMemo(() => {
    if (!search) return [];
    const q = search.toUpperCase();
    return allSymbols.filter(s => s.startsWith(q));
  }, [search, allSymbols]);

  // Count active filters for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (applied.direction !== 'all') count++;
    if (applied.status !== 'all') count++;
    if (applied.styles.length > 0) count++;
    if (applied.assets.length > 0) count++;
    if (applied.sizeMin || applied.sizeMax) count++;
    if (applied.pnlMin || applied.pnlMax) count++;
    if (applied.entryDateMin || applied.entryDateMax) count++;
    if (applied.exitDateMin || applied.exitDateMax) count++;
    if (applied.qtyMin || applied.qtyMax) count++;
    return count;
  }, [applied]);

  // Filtering logic
  const filtered = useMemo(() => {
    return trades.filter(t => {
      // Symbol: exact match only
      if (search && t.symbol !== search.toUpperCase()) return false;

      if (applied.direction !== 'all' && t.direction !== applied.direction) return false;
      if (applied.status !== 'all' && t.status !== applied.status) return false;
      if (applied.styles.length > 0 && (!t.trade_style || !applied.styles.includes(t.trade_style))) return false;
      if (applied.assets.length > 0 && !applied.assets.includes(t.asset_class)) return false;

      const size = t.entry_price * t.size;
      if (applied.sizeMin && size < parseFloat(applied.sizeMin)) return false;
      if (applied.sizeMax && size > parseFloat(applied.sizeMax)) return false;

      const pnl = computeTradePnl(t);
      const pnlUnit = displayUnit === 'usc' ? 0.01 : 1;
      if (applied.pnlMin && pnl < parseFloat(applied.pnlMin) * pnlUnit) return false;
      if (applied.pnlMax && pnl > parseFloat(applied.pnlMax) * pnlUnit) return false;

      const entryDate = t.entry_at;
      if (applied.entryDateMin && entryDate < applied.entryDateMin) return false;
      if (applied.entryDateMax && entryDate > applied.entryDateMax) return false;

      if (t.exit_at) {
        const exitDate = t.exit_at;
        if (applied.exitDateMin && exitDate < applied.exitDateMin) return false;
        if (applied.exitDateMax && exitDate > applied.exitDateMax) return false;
      }

      if (applied.qtyMin && t.size < parseFloat(applied.qtyMin)) return false;
      if (applied.qtyMax && t.size > parseFloat(applied.qtyMax)) return false;

      return true;
    });
  }, [trades, search, applied, displayUnit]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const handleApply = () => {
    setApplied(draft);
    setPage(1);
    setFilterOpen(false);
  };

  const handleClear = () => {
    setDraft(EMPTY_FILTERS);
  };

  const handleSearch = (text: string) => {
    setSearch(text);
    setShowDropdown(text.length > 0);
    setPage(1);
  };

  const selectSymbol = (sym: string) => {
    setSearch(sym);
    setShowDropdown(false);
    setPage(1);
  };

  const handleAddManual = () => {
    router.push('/add-trade');
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-dark-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ paddingTop: insets.top }}
    >
      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        draft={draft}
        setDraft={setDraft}
        onApply={handleApply}
        onClear={handleClear}
        displayUnit={displayUnit}
      />

      <Animated.View entering={FadeIn.duration(400)} className="px-4 pt-4 pb-2" style={{ zIndex: 50 }}>
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-2xl font-black text-dark-text">Trade History</Text>
        </View>

        {/* Search bar */}
        <View className="relative z-20">
          <View
            className="flex-row items-center bg-dark-card rounded-2xl px-3 border"
            style={{ borderColor: searchFocused ? '#00E68A' : '#1F2437' }}
          >
            <Ionicons name="search" size={18} color={searchFocused ? '#00E68A' : '#555B6E'} />
            <TextInput
              className="flex-1 py-3 px-2 text-dark-text font-medium"
              placeholder="Search exact symbol…"
              placeholderTextColor="#555B6E"
              value={search}
              onChangeText={handleSearch}
              autoCapitalize="characters"
              autoCorrect={false}
              onFocus={() => { setSearchFocused(true); setShowDropdown(search.length > 0); }}
              onBlur={() => { setSearchFocused(false); setShowDropdown(false); }}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => { setSearch(''); setShowDropdown(false); setPage(1); }} className="mr-2">
                <Ionicons name="close-circle" size={18} color="#8B92A5" />
              </TouchableOpacity>
            )}
            {/* Filter button */}
            <Pressable
              onPress={() => { setDraft(applied); setFilterOpen(true); }}
              className="w-10 h-10 rounded-xl items-center justify-center ml-1"
            >
              <Ionicons name="options" size={20} color="#8B92A5" />
            </Pressable>
          </View>

          {/* Autocomplete dropdown */}
          {showDropdown && (suggestions.length > 0) && (
            <>
              <Pressable 
                onPress={() => { setShowDropdown(false); setSearchFocused(false); Keyboard.dismiss(); }} 
                style={{ position: 'absolute', top: 0, left: -100, right: -100, bottom: -1000, zIndex: 999 }}
              />
              <View
                className="absolute left-0 right-0 top-full mt-1 bg-[#1a1b24] rounded-2xl border border-[#2b2d3a] overflow-hidden"
                style={{ zIndex: 1000, elevation: 10, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}
              >
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 250 }}>
                  {suggestions.map(sym => (
                    <Pressable
                      key={sym}
                      onPress={() => selectSymbol(sym)}
                      className="px-5 py-4 border-b border-[#2b2d3a]"
                    >
                      <Text className="text-white font-bold text-base tracking-wide">{sym}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </>
          )}
        </View>
      </Animated.View>

      {/* Results count */}
      <View className="px-4 mt-2 mb-6 flex-row items-center justify-between">
        <Text className="text-dark-text-muted font-bold tracking-widest">
          {filtered.length} trade{filtered.length !== 1 ? 's' : ''}
        </Text>
        <Pressable onPress={() => { setApplied(EMPTY_FILTERS); setDraft(EMPTY_FILTERS); setPage(1); }}>
          <Text className="text-[12px] text-dark-text-muted font-black uppercase tracking-wider">Clear filters</Text>
        </Pressable>
      </View>

      {loading && trades.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#00E68A" />
        </View>
      ) : (
        <FlatList
          data={paginated}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, paddingTop: 10 }}
          onRefresh={refetch}
          refreshing={loading}
          renderItem={({ item, index }) => (
            <TradeRow
              trade={item}
              index={index}
              accountType={accountType}
              displayUnit={displayUnit}
              onPress={() => router.push(`/trade/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="receipt"
              title={activeFilterCount > 0 || search ? 'No trades match.' : 'No trades yet.'}
              subtitle="Tap + to log your first trade."
            />
          }
          ListFooterComponent={
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          }
        />
      )}

      <AddTradeFab onAddManual={handleAddManual} onImport={pickFile} />

      <ImportConfirmModal
        summary={summary}
        importing={importing}
        onCancel={cancelImport}
        onConfirm={confirmImport}
      />
    </KeyboardAvoidingView>
  );
}
