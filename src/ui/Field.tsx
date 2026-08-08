import React from 'react';
import { View, Text, TextInput } from 'react-native';

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">{label}</Text>
      {children}
      {error ? <Text className="text-rose-500 text-xs font-semibold mt-1">{error}</Text> : null}
    </View>
  );
}

export function TextInputField({
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <TextInput
      className={`bg-white border border-slate-200 rounded-xl px-4 text-slate-800 font-medium ${
        multiline ? 'py-3 min-h-[80px]' : 'py-3'
      }`}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
    />
  );
}

export function NumericInput({
  value,
  onChangeText,
  placeholder,
  align = 'right',
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  align?: 'left' | 'right';
}) {
  return (
    <TextInput
      className={`bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-semibold ${
        align === 'right' ? 'text-right' : ''
      }`}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      keyboardType="decimal-pad"
      style={{ fontVariant: ['tabular-nums'] }}
    />
  );
}
