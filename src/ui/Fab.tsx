import React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Fab({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.85, { damping: 10, stiffness: 300 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 8, stiffness: 250 }); }}
      style={[
        animatedStyle,
        {
          shadowColor: '#00E68A',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
          elevation: 8,
        },
      ]}
      className="bg-neon-green w-16 h-16 rounded-full items-center justify-center"
    >
      <Ionicons name="add" size={32} color="#0A0E1A" />
    </AnimatedPressable>
  );
}
