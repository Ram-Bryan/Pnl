import React from 'react';
import { Text, TextStyle } from 'react-native';
import { formatPnl } from '../lib/format';

export function PnlText({
  value,
  size = 'text-base',
  weight = 'font-bold',
  align,
  glow = false,
  accountType = 'standard',
}: {
  value: number;
  size?: string;
  weight?: string;
  align?: 'center';
  glow?: boolean;
  accountType?: 'standard' | 'cents';
}) {
  const isZero = value === 0;
  const isPositive = value > 0;
  const color = isZero ? 'text-[#6b6880]' : isPositive ? 'text-neon-green' : 'text-neon-red';
  const glowStyle: TextStyle = glow
    ? {
        textShadowColor: isZero ? 'rgba(107,104,128,0.4)' : isPositive ? 'rgba(0,230,138,0.5)' : 'rgba(255,77,106,0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 16,
      }
    : {};

  return (
    <Text
      className={`${color} ${size} ${weight} ${align === 'center' ? 'text-center' : ''}`}
      style={[{ fontVariant: ['tabular-nums'] }, glowStyle]}
    >
      {formatPnl(value, accountType)}
    </Text>
  );
}
