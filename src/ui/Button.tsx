import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';

const VARIANTS = {
  primary: 'bg-emerald-600',
  outline: 'bg-white border border-slate-200',
  ghost: 'bg-transparent',
  danger: 'bg-rose-50 border border-rose-200',
};

const TEXT_VARIANTS = {
  primary: 'text-white',
  outline: 'text-slate-800',
  ghost: 'text-emerald-600',
  danger: 'text-rose-500',
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: {
  title: string;
  onPress: () => void;
  variant?: keyof typeof VARIANTS;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      className={`${VARIANTS[variant]} py-4 rounded-2xl items-center shadow-none ${
        disabled && variant === 'primary' ? 'opacity-60' : ''
      }`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? 'white' : '#059669'} />
      ) : (
        <Text className={`${TEXT_VARIANTS[variant]} font-black text-base`}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}
