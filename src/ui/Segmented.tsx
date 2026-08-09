import React from 'react';
import { View, Text, Pressable } from 'react-native';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  dangerKeys = [],
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (val: T) => void;
  dangerKeys?: string[];
}) {
  return (
    <View className="flex-row bg-[#13141a] rounded-2xl p-1 gap-x-1">
      {options.map((opt) => {
        const isSelected = value === opt.key;
        const color = dangerKeys.includes(opt.key) ? '#FF4D6A' : '#00E68A';
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            className="flex-1 py-3 rounded-xl items-center"
            style={{ backgroundColor: isSelected ? color : 'transparent' }}
          >
            <Text className="font-bold text-sm" style={{ color: isSelected ? '#13141a' : '#6b6880' }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
