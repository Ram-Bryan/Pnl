import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`px-3 py-1.5 rounded-full border ${
        selected ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-200'
      }`}
    >
      <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-slate-600'}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
