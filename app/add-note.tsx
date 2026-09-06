import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { getNoteByDay, getNoteById, insertNote, updateNote } from '../src/db/database';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayToDisplay(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

function composeLocalDateTime(day: string): string {
  const now = new Date();
  return `${day} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function persistNoteImages(uris: string[]): Promise<string[]> {
  const dir = new Directory(Paths.document, 'note-images');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  const persisted: string[] = [];
  for (const uri of uris) {
    const ext = (uri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext) ? ext : 'jpg';
    const dest = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`);
    await new File(uri).copy(dest);
    persisted.push(dest.uri);
  }
  return persisted;
}

export default function AddNoteScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string; day?: string; type?: 'daily' | 'normal' }>();
  const noteId = params.id ? parseInt(params.id, 10) : null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [day, setDay] = useState(params.day ?? formatDayKey(new Date()));
  const [type, setType] = useState<'daily' | 'normal'>(params.type ?? 'daily');
  const [title, setTitle] = useState('');
  
  // Image Zoom state
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!noteId || Number.isNaN(noteId)) {
        setLoading(false);
        return;
      }
      try {
        const note = await getNoteById(db, noteId);
        if (!mounted || !note) return;
        setContent(note.content ?? '');
        setPhotos(note.photos);
        setDay(note.created_at.slice(0, 10));
        setType(note.type);
        setTitle(note.title ?? '');
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load note.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [db, noteId]);

  useEffect(() => {
    // If it's a new note, set default title
    if (!noteId && !title) {
      if (type === 'daily') setTitle(`Notes for ${dayToDisplay(day)}`);
      else setTitle('');
    }
  }, [type, day, noteId]);

  const addImages = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
      });
      if (result.canceled) return;
      const uris = result.assets.map((a) => a.uri);
      const persisted = await persistNoteImages(uris);
      setPhotos((prev) => [...prev, ...persisted]);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add images.');
    }
  };

  const save = async () => {
    if (!content.trim() && photos.length === 0) {
      Alert.alert('Validation', 'Add some note content or at least one image.');
      return;
    }
    setSaving(true);
    try {
      if (noteId && !Number.isNaN(noteId)) {
        await updateNote(db, noteId, { title: title || null, content, photos });
      } else {
        if (type === 'daily') {
          const existing = await getNoteByDay(db, day);
          if (existing) {
            Alert.alert('Today already has a daily note', 'You can edit it instead.');
            setSaving(false);
            router.replace(`/add-note?id=${existing.id}&type=daily`);
            return;
          }
        }
        await insertNote(db, {
          type,
          title: title || null,
          content,
          photos,
          created_at: composeLocalDateTime(day),
        });
      }
      router.back();
    } catch (e: any) {
      const msg = e?.message || 'Failed to save note.';
      if (String(msg).toLowerCase().includes('unique')) {
        Alert.alert('Today already has a note', 'Only one note per day is allowed.');
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-dark-bg"><ActivityIndicator size="large" color="#00E68A" /></View>;
  }

  const headerHeight = insets.top + 60;

  return (
    <View className="flex-1 bg-[#0D1326]">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="absolute left-0 right-0 z-30 border-b border-[#1F2437]" style={{ paddingTop: insets.top, height: headerHeight, backgroundColor: '#0D1326' }}>
        <View className="h-[60px] px-4 flex-row items-center justify-between">
          <Pressable onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
            <Ionicons name="chevron-back" size={24} color="#ffffff" />
          </Pressable>
          <TextInput 
            value={title}
            onChangeText={setTitle}
            placeholder={type === 'daily' ? 'Daily Note' : 'Untitled Note'}
            placeholderTextColor="#6B7287"
            className="flex-1 text-white font-black text-center text-base mx-2"
          />
          <Pressable onPress={addImages} className="w-10 h-10 rounded-full items-center justify-center border border-white">
            <Ionicons name="add" size={22} color="#ffffff" />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ paddingTop: headerHeight + 16, paddingHorizontal: 16, paddingBottom: 120 + insets.bottom }}>
          <TextInput
            multiline
            value={content}
            onChangeText={setContent}
            placeholder="Write what happened today..."
            placeholderTextColor="#6B7287"
            className="text-white text-base leading-7 min-h-[280px]"
            textAlignVertical="top"
          />

          {photos.length > 0 && (
            <View className="mt-4 flex-row flex-wrap">
              {photos.map((uri, index) => (
                <View key={`${uri}-${index}`} className="mr-3 mb-3">
                  <Pressable onPress={() => setZoomedImage(uri)}>
                    <Image source={{ uri }} className="w-28 h-28 rounded-xl border border-[#2B2D3A]" />
                  </Pressable>
                  <Pressable
                    onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
                    className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[#FF4D6A] items-center justify-center"
                  >
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View className="absolute left-0 right-0 bottom-0 border-t border-[#1F2437] px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 16), backgroundColor: 'rgba(13, 19, 38, 0.96)' }}>
        <Pressable
          onPress={save}
          disabled={saving}
          className="bg-[#2d7df6] rounded-2xl py-4 items-center"
          style={{ opacity: saving ? 0.7 : 1 }}
        >
          <Text className="text-white font-black tracking-wide">{saving ? 'Saving...' : 'Save Note'}</Text>
        </Pressable>
      </View>

      <Modal visible={!!zoomedImage} transparent animationType="fade" onRequestClose={() => setZoomedImage(null)}>
        <View className="flex-1 bg-black justify-center items-center">
          <Pressable onPress={() => setZoomedImage(null)} className="absolute top-0 bottom-0 left-0 right-0 z-0" />
          <Pressable onPress={() => setZoomedImage(null)} className="absolute top-12 right-6 z-20 w-12 h-12 bg-black/50 rounded-full items-center justify-center">
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {zoomedImage && (
            <Image source={{ uri: zoomedImage }} resizeMode="contain" className="w-full h-full z-10" />
          )}
        </View>
      </Modal>
    </View>
  );
}
