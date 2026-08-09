import React from 'react';
import { ViewProps } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

export function Card({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(delay).springify().damping(18)}
      className={`bg-dark-card rounded-2xl border border-dark-border shadow-sm ${className}`}
    >
      {children}
    </Animated.View>
  );
}
