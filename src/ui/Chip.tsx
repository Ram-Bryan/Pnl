import React from 'react';
import { Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.93, { damping: 15 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
      style={animatedStyle}
      className={`px-4 py-2.5 rounded-full border ${
        selected ? 'bg-[#00E68A] border-[#00E68A]' : 'bg-[#13141a] border-[#1e1d2b]'
      }`}
    >
      <Text className={`text-sm font-bold ${selected ? 'text-[#13141a]' : 'text-white'}`}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
