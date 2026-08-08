import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function Fab({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      className="bg-emerald-600 w-16 h-16 rounded-full items-center justify-center shadow-lg"
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Ionicons name="add" size={32} color="white" />
    </TouchableOpacity>
  );
}
