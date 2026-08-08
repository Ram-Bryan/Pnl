import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="items-center py-10">
      <Ionicons name={icon} size={48} color="#cbd5e1" />
      <Text className="text-slate-400 font-medium mt-3 text-center">{title}</Text>
      {subtitle ? <Text className="text-slate-300 text-sm text-center mt-1">{subtitle}</Text> : null}
    </View>
  );
}
