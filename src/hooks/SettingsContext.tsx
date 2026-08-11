import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getAllSettings, setSetting } from '../db/database';
import { AccountType } from '../stats/tradeMath';

type SettingsContextValue = {
  accountType: AccountType;
  loading: boolean;
  setAccountType: (value: AccountType) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

// Single reactive source of truth for the account type. Every P&L screen
// subscribes here, so toggling the setting re-renders all of them instantly
// instead of waiting for a per-screen refetch on focus.
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [accountType, setAccountTypeState] = useState<AccountType>('standard');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await getAllSettings(db);
        if (active) setAccountTypeState((raw['accountType'] as AccountType) || 'standard');
      } catch (e) {
        console.error('SettingsProvider: failed to load settings', e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [db]);

  const setAccountType = useCallback(async (value: AccountType) => {
    await setSetting(db, 'accountType', value);
    setAccountTypeState(value);
  }, [db]);

  const value = useMemo(
    () => ({ accountType, loading, setAccountType }),
    [accountType, loading, setAccountType]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useAccountSetting(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useAccountSetting must be used within SettingsProvider');
  return ctx;
}
