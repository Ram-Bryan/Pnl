import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSQLiteContext } from 'expo-sqlite';
import { EmptyState, Fab } from '../../src/ui';
import { useNotes } from '../../src/hooks/useNotes';
import { getNoteByDay } from '../../src/db/database';

function formatDayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatDisplayDate(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v.slice(0, 10).split('-').reverse().join('/');
  return d.toLocaleDateString('en-GB');
}

export default function NotesTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();
  const { notes, loading, refetch, removeNote } = useNotes();
  const [fabOpen, setFabOpen] = useState(false);

  const today = useMemo(() => formatDayKey(new Date()), []);

  const onAddToday = async () => {
    setFabOpen(false);
    try {
      const existing = await getNoteByDay(db, today);
      if (existing) {
        Alert.alert(
          'Today already has a note',
          'You can edit today’s note instead.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Edit Note', onPress: () => router.push(`/add-note?id=${existing.id}`) },
          ]
        );
        return;
      }
      router.push(`/add-note?day=${today}`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to open note screen.');
    }
  };

  const onDelete = (id: number) => {
    Alert.alert('Delete note', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeNote(id);
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete note.');
          }
        },
      },
    ]);
  };

  if (loading && notes.length === 0) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><ActivityIndicator size="large" color="#00E68A" /></View>;
  }

  return (
    <View className="flex-1 bg-dark-bg" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-2 pb-2 bg-dark-bg flex-row items-center">
        <Text className="text-2xl font-black text-dark-text">Notes</Text>
      </View>

      <FlatList
        data={notes}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 }}
        onRefresh={refetch}
        refreshing={loading}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.duration(350).delay(Math.min(index * 40, 400)).springify().damping(18)}>
            <Pressable
              onPress={() => router.push(`/add-note?id=${item.id}`)}
              className="mb-3 bg-dark-card rounded-2xl border border-dark-border p-4"
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="font-bold text-base text-white tracking-wide">
                  {formatDisplayDate(item.created_at)}
                </Text>
                <Pressable onPress={() => onDelete(item.id)} className="p-2 bg-[#FF4D6A]/10 rounded-xl border border-[#FF4D6A]/20">
                  <Ionicons name="trash" size={16} color="#FF4D6A" />
                </Pressable>
              </View>
              <Text className="text-dark-text-secondary text-sm" numberOfLines={3}>
                {item.content}
              </Text>
              <View className="flex-row items-center mt-3">
                <Ionicons name="images-outline" size={14} color="#8B92A5" />
                <Text className="text-[#8B92A5] text-[11px] font-black ml-1 tracking-wider uppercase">
                  {item.photo_count} image{item.photo_count === 1 ? '' : 's'}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        )}
        ListEmptyComponent={<EmptyState icon="document-text-outline" title="No notes yet." subtitle="Tap + and add today's note." />}
      />

      {fabOpen && (
        <Pressable
          onPress={() => setFabOpen(false)}
          style={[StyleSheet.absoluteFill, { zIndex: 30, backgroundColor: 'rgba(0,0,0,0.4)' }]}
        />
      )}
      <View className="absolute bottom-6 right-6 items-end" style={{ zIndex: 40 }}>
        {fabOpen && (
          <Animated.View entering={FadeInDown.duration(200).springify().damping(16)} className="mb-3">
            <Pressable
              onPress={onAddToday}
              className="flex-row items-center gap-3 bg-dark-card rounded-2xl px-4 py-3 border border-dark-border"
            >
              <Ionicons name="create-outline" size={20} color="#00E68A" />
              <Text className="text-white font-semibold">Add today&apos;s note</Text>
            </Pressable>
          </Animated.View>
        )}
        <Fab onPress={() => setFabOpen((v) => !v)} active={fabOpen} />
      </View>
    </View>
  );
}
