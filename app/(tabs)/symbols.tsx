import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { EmptyState, Fab, Sheet } from '../../src/ui';
import { Instrument, AssetClass, PriceMode } from '../../src/db/schema';
import { getInstruments, insertInstrument, deleteInstrument, updateInstrument } from '../../src/db/database';
import { ASSET_CLASSES } from '../../src/lib/constants';
import { inferQuoteCurrency } from '../../src/lib/quoteCurrency';

function FormInput({ value, onChange, placeholder, keyboardType="default" }: any) {
  return (
    <View className="bg-[#13141a] rounded-xl px-3 h-[52px] border border-[#1e1d2b] flex-row items-center mb-8">
      <TextInput 
        className="flex-1 text-white text-sm font-medium" 
        placeholder={placeholder} 
        placeholderTextColor="#3e3b4b" 
        value={value} 
        onChangeText={onChange} 
        keyboardType={keyboardType} 
        autoCapitalize={keyboardType === 'default' ? 'characters' : 'none'}
      />
    </View>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <Text className="text-white font-black text-lg mb-3">{label}</Text>;
}



function SegmentedAsset({ value, onChange }: { value: string, onChange: (v: any) => void }) {
  return (
    <View className="flex-row flex-wrap bg-[#13141a] rounded-2xl p-1 mb-8">
      {ASSET_CLASSES.map(o => {
        const isSelected = value === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            className="py-2.5 px-3 rounded-xl items-center flex-grow"
            style={{ backgroundColor: isSelected ? '#00E68A' : 'transparent' }}
          >
            <Text className="font-bold text-[12px]" style={{ color: isSelected ? '#13141a' : '#6b6880' }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SymbolsTab() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Sheet state
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Form state
  const [symbol, setSymbol] = useState('');
  const [assetClass, setAssetClass] = useState<AssetClass>('equity');
  const [quoteCurrency, setQuoteCurrency] = useState('USD');
  const [contractSize, setContractSize] = useState('1');
  const [saving, setSaving] = useState(false);

  const fetchInstruments = async () => {
    try {
      const data = await getInstruments(db);
      setInstruments(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstruments();
  }, [db]);

  const openAdd = () => {
    setEditingId(null);
    setSymbol('');
    setAssetClass('equity');
    setQuoteCurrency('USD');
    setContractSize('1');
    setSheetOpen(true);
  };

  const openEdit = (inst: Instrument) => {
    setEditingId(inst.id);
    setSymbol(inst.symbol);
    setAssetClass(inst.asset_class);
    setQuoteCurrency(inst.quote_currency || 'USD');
    setContractSize(String(inst.contract_size));
    setSheetOpen(true);
  };

  const save = async () => {
    if (!symbol.trim()) {
      Alert.alert('Error', 'Symbol is required');
      return;
    }
    setSaving(true);
    try {
      // Currency pairs (USDJPY, EURGBP, ...) carry their quote currency in the symbol;
      // auto-fix it when the field still holds the generic 'USD' default so P&L converts correctly.
      const inferredQuote = inferQuoteCurrency(symbol);
      const quote = inferredQuote && quoteCurrency === 'USD' ? inferredQuote : quoteCurrency.toUpperCase();
      const payload = {
        symbol: symbol.toUpperCase(),
        name: null,
        asset_class: assetClass,
        quote_currency: quote,
        price_mode: 'standard' as PriceMode, // Database default (now ignored, controlled by settings)
        contract_size: parseFloat(contractSize) || 1,
        tick_size: null,
      };
      
      if (editingId) {
        await updateInstrument(db, editingId, payload);
      } else {
        await insertInstrument(db, payload);
      }
      setSheetOpen(false);
      await fetchInstruments();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (id: number, sym: string) => {
    Alert.alert('Delete Symbol', `Are you sure you want to delete ${sym}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteInstrument(db, id);
          fetchInstruments();
      }},
    ]);
  };

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><ActivityIndicator size="large" color="#00E68A" /></View>;
  }

  return (
    <View className="flex-1 bg-dark-bg" style={{ paddingTop: insets.top }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="px-4 pt-2 pb-2 bg-dark-bg flex-row items-center">
        <Text className="text-2xl font-black text-dark-text">Symbols</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 }}>
        {instruments.length === 0 ? (
          <EmptyState icon="pricetags" title="No symbols yet." subtitle="Tap + to add your first symbol." />
        ) : (
          instruments.map((inst, i) => (
            <Animated.View key={inst.id} entering={FadeInDown.duration(400).delay(Math.min(i * 60, 600)).springify().damping(18)}>
              <TouchableOpacity
                onPress={() => openEdit(inst)}
                activeOpacity={0.7}
                className="bg-[#13141a] rounded-2xl p-4 mb-3 border border-[#1e1d2b] flex-row items-center justify-between"
              >
                <View className="w-12 h-12 rounded-xl bg-[#1a1b24] border border-[#2b2d3a] items-center justify-center mr-4">
                  <Ionicons name="bar-chart-outline" size={24} color="#00E68A" />
                </View>
                <View className="flex-1 pr-4">
                  <View className="flex-row items-center gap-x-2 mb-1.5">
                    <Text className="font-bold text-base text-white tracking-wide">{inst.symbol}</Text>
                  </View>
                  <View className="flex-row items-center gap-x-2">
                    <Text className="text-[#8B92A5] text-[11px] font-black uppercase tracking-wider">{inst.asset_class}</Text>
                    <View className="w-1 h-1 rounded-full bg-[#1e1d2b]" />
                    <Text className="text-[#8B92A5] text-[11px] font-black uppercase tracking-wider">{inst.quote_currency || 'USD'}</Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  <TouchableOpacity onPress={() => confirmDelete(inst.id, inst.symbol)} className="p-2 bg-[#FF4D6A]/10 rounded-xl border border-[#FF4D6A]/20">
                    <Ionicons name="trash" size={18} color="#FF4D6A" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Animated.View>
          ))
        )}
      </ScrollView>

      <View className="absolute bottom-6 right-6">
        <Fab onPress={openAdd} />
      </View>

      <Sheet visible={isSheetOpen} onClose={() => setSheetOpen(false)} title={editingId ? "Edit Symbol" : "Add Symbol"}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView showsVerticalScrollIndicator={false} className="mt-4">
            
            <SectionLabel label="Symbol" />
            <FormInput value={symbol} onChange={setSymbol} placeholder="e.g. AAPL" />
            
            <SectionLabel label="Asset Class" />
            <SegmentedAsset 
              value={assetClass} 
              onChange={(v) => { 
                setAssetClass(v as AssetClass); 
              }} 
            />

            <SectionLabel label="Quote Currency" />
            <FormInput value={quoteCurrency} onChange={setQuoteCurrency} placeholder="e.g. USD, JPY" />
            <Text className="text-[#6b6880] text-xs mb-4 px-1">JPY for USDJPY — used to convert P&L to USD. Auto-detected from the symbol.</Text>
            
            <SectionLabel label="Contract Size" />
            <FormInput value={contractSize} onChange={setContractSize} placeholder="1" keyboardType="numeric" />
            <Text className="text-[#6b6880] text-xs mb-4 px-1">Units per 1.0 lot. Forex: 100000.</Text>

            <View className="h-6" />
          </ScrollView>

          <View className="pt-2 pb-6">
            <Pressable
              onPress={save}
              disabled={saving}
              className="bg-[#2d7df6] rounded-2xl py-4 items-center"
              style={{ opacity: saving ? 0.7 : 1 }}
            >
              <Text className="text-white font-black tracking-wide">
                {saving ? 'Saving...' : 'Save Symbol'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Sheet>
    </View>
  );
}
