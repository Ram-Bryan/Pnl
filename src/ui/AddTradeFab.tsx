import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Fab } from './Fab';

type AddTradeFabProps = {
  onAddManual: () => void;
  onImport: () => void;
};

const optionShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.5,
  shadowRadius: 12,
  elevation: 6,
};

export function AddTradeFab({ onAddManual, onImport }: AddTradeFabProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      {open && (
        <Pressable
          onPress={close}
          style={[StyleSheet.absoluteFill, { zIndex: 40, backgroundColor: 'rgba(0,0,0,0.45)' }]}
        />
      )}

      <View className="absolute bottom-6 right-6 items-end" style={{ zIndex: 50 }}>
        {open && (
          <View className="items-end mb-3 gap-2">
            <Animated.View entering={FadeInDown.duration(200).springify().damping(16)}>
              <Pressable
                onPress={() => { onImport(); close(); }}
                className="flex-row items-center gap-3 bg-dark-card rounded-2xl px-4 py-3 border border-dark-border"
                style={({ pressed }) => [optionShadow, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="cloud-upload-outline" size={20} color="#2d7df6" />
                <Text className="text-white font-semibold">Import Trade</Text>
              </Pressable>
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(200).delay(60).springify().damping(16)}>
              <Pressable
                onPress={() => { onAddManual(); close(); }}
                className="flex-row items-center gap-3 bg-dark-card rounded-2xl px-4 py-3 border border-dark-border"
                style={({ pressed }) => [optionShadow, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="create-outline" size={20} color="#00E68A" />
                <Text className="text-white font-semibold">Add Trade Manually</Text>
              </Pressable>
            </Animated.View>
          </View>
        )}

        <Fab onPress={() => setOpen(v => !v)} active={open} />
      </View>
    </>
  );
}
