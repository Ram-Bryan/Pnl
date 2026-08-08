import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (val: T) => void;
}) {
  return (
    <View className="flex-row bg-slate-100 rounded-xl p-1">
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.key}
          onPress={() => onChange(opt.key)}
          className={`flex-1 py-2.5 rounded-xl items-center shadow-none ${
            value === opt.key ? 'bg-white' : ''
          }`}
        >
          <Text
            className={`font-bold text-sm ${
              value === opt.key ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
