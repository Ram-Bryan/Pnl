import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';

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
    <Animated.View entering={FadeIn.duration(500)} className="items-center py-10">
      <View className="w-16 h-16 rounded-2xl bg-dark-elevated items-center justify-center mb-4">
        <Ionicons name={icon} size={32} color="#555B6E" />
      </View>
      <Text className="text-dark-text-secondary font-medium text-center">{title}</Text>
      {subtitle ? <Text className="text-dark-text-muted text-sm text-center mt-1">{subtitle}</Text> : null}
    </Animated.View>
  );
}
