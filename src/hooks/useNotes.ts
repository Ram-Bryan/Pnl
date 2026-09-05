import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteNote, getAllNotes } from '../db/database';
import { Note } from '../db/schema';

export type NoteListItem = Note & { photo_count: number };

export function useNotes() {
  const db = useSQLiteContext();
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const rows = await getAllNotes(db);
      setNotes(rows);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(useCallback(() => { fetch({ silent: true }); }, [fetch]));

  const removeNote = useCallback(async (id: number) => {
    await deleteNote(db, id);
    await fetch({ silent: true });
  }, [db, fetch]);

  return { notes, loading, error, refetch: fetch, removeNote };
}
