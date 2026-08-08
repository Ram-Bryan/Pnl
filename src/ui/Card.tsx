import React from 'react';
import { View, ViewProps } from 'react-native';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <View className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>
      {children}
    </View>
  );
}
