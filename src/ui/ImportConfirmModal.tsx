import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ImportSummary } from '../hooks/useCsvImport';

export function ImportConfirmModal({
  summary,
  importing,
  onCancel,
  onConfirm,
}: {
  summary: ImportSummary | null;
  importing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!summary) return null;

  return (
    <View className="absolute inset-0 bg-black/60 items-center justify-center z-50">
      <View className="bg-dark-elevated border border-dark-border rounded-3xl p-6 mx-8 w-full">
        <View className="items-center mb-4">
          <View className="w-12 h-12 rounded-full bg-[#2d7df6]/10 items-center justify-center mb-3">
            <Ionicons name="cloud-upload" size={24} color="#2d7df6" />
          </View>
          <Text className="text-white font-bold text-lg text-center">Import Trades</Text>
        </View>
        <Text className="text-dark-text-secondary text-sm text-center mb-2">
          {summary.count} trades found
        </Text>
        <Text className="text-dark-text-muted text-xs text-center mb-5">
          Symbols: {summary.symbols.join(', ')}
        </Text>
        <View className="flex-row gap-x-3">
          <Pressable
            onPress={onCancel}
            disabled={importing}
            className="flex-1 py-3 rounded-xl bg-dark-card border border-dark-border items-center"
          >
            <Text className="text-dark-text-muted font-bold">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={importing}
            className="flex-1 py-3 rounded-xl bg-[#2d7df6] items-center"
          >
            <Text className="text-white font-bold">{importing ? 'Importing...' : 'Import'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
