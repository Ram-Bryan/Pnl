import React, { useState } from 'react';
import { View, Text, TextInput, TextInputProps } from 'react-native';

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="text-[11px] uppercase tracking-wider text-white font-bold opacity-90 mb-1.5">{label}</Text>
      {children}
      {error ? <Text className="text-[#FF4D6A] text-xs font-semibold mt-1">{error}</Text> : null}
    </View>
  );
}

export function TextInputField({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  ...props
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
} & TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      className={`bg-[#13141a] rounded-xl px-4 text-white font-medium ${
        multiline ? 'py-3 min-h-[80px]' : 'h-[52px]'
      }`}
      style={[
        { borderWidth: 1, borderColor: focused ? '#00E68A' : '#1e1d2b' },
      ]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#3e3b4b"
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...props}
    />
  );
}

export function NumericInput({
  value,
  onChangeText,
  placeholder,
  align = 'right',
  suffix,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  align?: 'left' | 'right';
  suffix?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View className="flex-row items-center bg-[#13141a] rounded-xl h-[52px]" style={{ borderWidth: 1, borderColor: focused ? '#00E68A' : '#1e1d2b' }}>
      <TextInput
        className={`flex-1 px-4 h-full text-white font-medium ${align === 'right' ? 'text-right' : ''}`}
        style={[{ fontVariant: ['tabular-nums'] }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#3e3b4b"
        keyboardType="decimal-pad"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {suffix ? <Text className="text-[#6b6880] text-sm font-bold pr-4">{suffix}</Text> : null}
    </View>
  );
}
