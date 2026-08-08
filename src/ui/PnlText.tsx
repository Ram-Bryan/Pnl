import React from 'react';
import { Text, TextStyle } from 'react-native';
import { formatPnl } from '../lib/format';

export function PnlText({
  value,
  size = 'text-base',
  weight = 'font-bold',
  align,
}: {
  value: number;
  size?: string;
  weight?: string;
  align?: 'center';
}) {
  const color = value >= 0 ? 'text-emerald-600' : 'text-rose-500';
  return (
    <Text
      className={`${color} ${size} ${weight} ${align === 'center' ? 'text-center' : ''}`}
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {formatPnl(value)}
    </Text>
  );
}
