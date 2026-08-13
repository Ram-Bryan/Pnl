import React from 'react';
import { Text, ActivityIndicator, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const VARIANTS = {
  primary: 'bg-neon-green',
  outline: 'bg-dark-elevated border border-dark-border',
  'blue-outline': 'bg-dark-elevated border border-[#2563EB]/50',
  ghost: 'bg-transparent',
  danger: 'bg-dark-elevated border border-neon-red/30',
};

const TEXT_VARIANTS = {
  primary: 'text-dark-bg',
  outline: 'text-neon-green',
  'blue-outline': 'text-[#2563EB]',
  ghost: 'text-neon-green',
  danger: 'text-neon-red',
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
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || loading}
      onPressIn={() => { scale.value = withSpring(0.96, { damping: 15 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
      style={animatedStyle}
      className={`${VARIANTS[variant]} py-4 rounded-2xl items-center shadow-none ${
        disabled && variant === 'primary' ? 'opacity-50' : ''
      }`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#0A0E1A' : '#00E68A'} />
      ) : (
        <Text className={`${TEXT_VARIANTS[variant]} font-black text-base`}>{title}</Text>
      )}
    </AnimatedPressable>
  );
}
