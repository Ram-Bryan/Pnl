import { useState, useEffect, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getAllSettings, setSetting } from '../db/database';

export type AccountType = 'standard' | 'cents';

type Settings = {
  accountType: AccountType;
};

const DEFAULT_SETTINGS: Settings = {
  accountType: 'standard',
};

type UseSettingsResult = {
  settings: Settings;
  loading: boolean;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
};

export function useSettings(): UseSettingsResult {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const raw = await getAllSettings(db);
      setSettings({
        accountType: (raw['accountType'] as AccountType) || 'standard',
      });
    } catch (e) {
      console.error('useSettings: failed to load', e);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { load(); }, [load]);

  const updateSetting = useCallback(async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    await setSetting(db, key, String(value));
    setSettings(prev => ({ ...prev, [key]: value }));
  }, [db]);

  return { settings, loading, updateSetting };
}
