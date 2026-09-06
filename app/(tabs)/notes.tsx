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
  const [filter, setFilter] = useState<'daily' | 'normal'>('daily');

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => n.type === filter);
  }, [notes, filter]);

  const onAddToday = async () => {
    setFabOpen(false);
    const today = formatDayKey(new Date());
    try {
      const existing = await getNoteByDay(db, today);
      if (existing) {
        Alert.alert(
          'Today already has a note',
          'You can edit today’s note instead.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Edit Note', onPress: () => router.push(`/add-note?id=${existing.id}&type=daily`) },
          ]
        );
        return;
      }
      router.push(`/add-note?day=${today}&type=daily`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to open note screen.');
    }
  };

  const onAddNormal = () => {
    setFabOpen(false);
    router.push(`/add-note?type=normal`);
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

  const optionShadow = {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  };

  return (
    <View className="flex-1 bg-dark-bg" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-2 pb-2 bg-dark-bg flex-row items-center justify-between">
        <Text className="text-2xl font-black text-dark-text">Notes</Text>
      </View>

      {/* Filter Tabs */}
      <View className="px-4 py-2 flex-row gap-3">
        <Pressable
          onPress={() => setFilter('daily')}
          className={`px-4 py-2 rounded-full border ${filter === 'daily' ? 'bg-[#2d7df6] border-[#2d7df6]' : 'bg-transparent border-[#2B2D3A]'}`}
        >
          <Text className={`font-semibold ${filter === 'daily' ? 'text-white' : 'text-[#8B92A5]'}`}>Daily Notes</Text>
        </Pressable>
        <Pressable
          onPress={() => setFilter('normal')}
          className={`px-4 py-2 rounded-full border ${filter === 'normal' ? 'bg-[#2d7df6] border-[#2d7df6]' : 'bg-transparent border-[#2B2D3A]'}`}
        >
          <Text className={`font-semibold ${filter === 'normal' ? 'text-white' : 'text-[#8B92A5]'}`}>Other Notes</Text>
        </Pressable>
      </View>

      <FlatList
        data={filteredNotes}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 }}
        onRefresh={refetch}
        refreshing={loading}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.duration(350).delay(Math.min(index * 30, 300)).springify().damping(18)}>
            <Pressable
              onPress={() => router.push(`/add-note?id=${item.id}&type=${item.type}`)}
              className="mb-4 bg-dark-card rounded-2xl border border-dark-border p-4"
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
            >
              <View className="flex-row items-start justify-between mb-3">
                <Text className="font-black text-lg text-white pr-2 flex-1 leading-6">
                  {item.title || (item.type === 'daily' ? `Daily Note` : 'Untitled Note')}
                </Text>
                <Pressable onPress={() => onDelete(item.id)} className="p-2 bg-[#FF4D6A]/10 rounded-xl border border-[#FF4D6A]/20 ml-2">
                  <Ionicons name="trash" size={16} color="#FF4D6A" />
                </Pressable>
              </View>

              <Text className="text-dark-text-secondary text-sm leading-5" numberOfLines={3}>
                {item.content}
              </Text>
              
              <View className="flex-row items-center justify-between mt-4">
                <View className="flex-row items-center">
                  <Ionicons name="images-outline" size={14} color="#8B92A5" />
                  <Text className="text-[#8B92A5] text-[12px] font-bold ml-1.5 uppercase tracking-wider">
                    {item.photo_count} image{item.photo_count === 1 ? '' : 's'}
                  </Text>
                </View>
                <Text className="text-[#8B92A5]/70 text-xs font-semibold">
                  {formatDisplayDate(item.created_at)}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        )}
        ListEmptyComponent={<EmptyState icon="document-text-outline" title={filter === 'daily' ? "No Daily Notes" : "No Notes"} subtitle={filter === 'daily' ? "Tap + and add today's note." : "Tap + and create a note."} />}
      />

      {fabOpen && (
        <Pressable
          onPress={() => setFabOpen(false)}
          style={[StyleSheet.absoluteFill, { zIndex: 30, backgroundColor: 'rgba(0,0,0,0.5)' }]}
        />
      )}
      
      <View className="absolute bottom-6 right-6 items-end" style={{ zIndex: 40 }}>
        {fabOpen && (
          <View className="items-end mb-3 gap-2">
            <Animated.View entering={FadeInDown.duration(200).springify().damping(16)}>
              <Pressable
                onPress={onAddNormal}
                className="flex-row items-center gap-3 bg-dark-card rounded-2xl px-4 py-3 border border-dark-border"
                style={({ pressed }) => [optionShadow, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="document-text-outline" size={20} color="#00E68A" />
                <Text className="text-white font-semibold">Add a Note</Text>
              </Pressable>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(200).delay(60).springify().damping(16)}>
              <Pressable
                onPress={onAddToday}
                className="flex-row items-center gap-3 bg-dark-card rounded-2xl px-4 py-3 border border-dark-border"
                style={({ pressed }) => [optionShadow, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="calendar-outline" size={20} color="#2d7df6" />
                <Text className="text-white font-semibold">Add today's note</Text>
              </Pressable>
            </Animated.View>
          </View>
        )}

        <Fab onPress={() => setFabOpen((v) => !v)} active={fabOpen} />
      </View>
    </View>
  );
}