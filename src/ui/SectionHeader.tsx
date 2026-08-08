import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="flex-row justify-between items-center mb-3 px-1">
      <Text className="text-lg font-bold text-slate-800">{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction}>
          <Text className="text-emerald-600 font-bold text-sm">{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
