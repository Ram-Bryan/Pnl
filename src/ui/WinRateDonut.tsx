import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle as SvgCircle, G } from 'react-native-svg';

export function WinRateDonut({
  winRate,
  wins,
  losses,
  size = 220,
}: {
  winRate: number;
  wins: number;
  losses: number;
  size?: number;
}) {
  const CX = 50, CY = 50, R = 40;
  const strokeW = 12;
  const circumference = 2 * Math.PI * R;
  const winLength = (winRate / 100) * circumference;
  const lossLength = circumference - winLength;

  return (
    <View className="items-center justify-center w-full">
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <G rotation="-90" origin="50, 50">
            <SvgCircle cx={CX} cy={CY} r={R} stroke="#1e1e28" strokeWidth={strokeW} fill="transparent" />
            <SvgCircle
              cx={CX} cy={CY} r={R}
              stroke="#FF4D6A"
              strokeWidth={strokeW}
              fill="transparent"
              strokeDasharray={`${lossLength} ${circumference}`}
              strokeDashoffset={-winLength}
              strokeLinecap="butt"
            />
            <SvgCircle
              cx={CX} cy={CY} r={R}
              stroke="#00E68A"
              strokeWidth={strokeW}
              fill="transparent"
              strokeDasharray={`${winLength} ${circumference}`}
              strokeLinecap="butt"
            />
          </G>
        </Svg>

        <View className="absolute items-center justify-center" pointerEvents="none">
          <Text className="text-[9px] uppercase tracking-widest font-bold mb-1" style={{ color: '#6b6880' }}>Win Rate</Text>
          <Text className="text-3xl font-black text-white">{winRate.toFixed(0)}%</Text>
        </View>
      </View>

      <View className="flex-row items-center justify-center mt-2 gap-x-8">
        <View className="flex-row items-center gap-x-2">
          <View className="w-3 h-3 rounded-full bg-[#00E68A]" />
          <Text className="text-xs font-bold text-white tracking-wide">{wins} Wins</Text>
        </View>
        <View className="flex-row items-center gap-x-2">
          <View className="w-3 h-3 rounded-full bg-[#FF4D6A]" />
          <Text className="text-xs font-bold text-white tracking-wide">{losses} Losses</Text>
        </View>
      </View>
    </View>
  );
}
