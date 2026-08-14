import React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type FabProps = {
  onPress: () => void;
  /** When true, the "+" icon is swapped for a close icon (speed-dial open state). */
  active?: boolean;
};

export function Fab({ onPress, active = false }: FabProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.88, { damping: 14, stiffness: 320 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 8, stiffness: 240 }); }}
      style={[
        animatedStyle,
        {
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: '#00E68A',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#00E68A',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.45,
          shadowRadius: 14,
          elevation: 8,
        },
      ]}
    >
      <Ionicons name={active ? 'close' : 'add'} size={28} color="black" />
    </AnimatedPressable>
  );
}
