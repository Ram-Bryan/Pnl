import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getAllSettings, setSetting, getFirstAccount, updateAccountPriceMode } from '../db/database';
import { AccountType } from '../stats/tradeMath';
import { DisplayUnit } from '../lib/format';

type SettingsContextValue = {
  accountType: AccountType;
  displayUnit: DisplayUnit;
  loading: boolean;
  setAccountType: (value: AccountType) => Promise<void>;
  setDisplayUnit: (value: DisplayUnit) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

// Single reactive source of truth for account type (sizing) and display unit
// (view). Every P&L screen subscribes here, so toggling either re-renders all
// of them instantly instead of waiting for a per-screen refetch on focus.
// The display unit defaults to the account type only at load; after that the
// two settings are independent — changing the account type never rewrites the
// display unit.
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [accountType, setAccountTypeState] = useState<AccountType>('standard');
  const [displayUnit, setDisplayUnitState] = useState<DisplayUnit>('usd');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const settings = await getAllSettings(db);
        const account = await getFirstAccount(db);
        const accountTypeValue = (account?.price_mode ?? 'standard') as AccountType;
        const stored = settings['displayUnit'];
        const defaultUnit: DisplayUnit = accountTypeValue === 'cents' ? 'usc' : 'usd';
        if (active) {
          setAccountTypeState(accountTypeValue);
          setDisplayUnitState(stored === 'usc' || stored === 'usd' ? stored : defaultUnit);
        }
      } catch (e) {
        console.error('SettingsProvider: failed to load settings', e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [db]);

  const setAccountType = useCallback(async (value: AccountType) => {
    const account = await getFirstAccount(db);
    if (!account) throw new Error('No account found. Please restart the app.');
    await updateAccountPriceMode(db, account.id, value);
    setAccountTypeState(value);
  }, [db]);

  const setDisplayUnit = useCallback(async (value: DisplayUnit) => {
    await setSetting(db, 'displayUnit', value);
    setDisplayUnitState(value);
  }, [db]);

  const value = useMemo(
    () => ({ accountType, displayUnit, loading, setAccountType, setDisplayUnit }),
    [accountType, displayUnit, loading, setAccountType, setDisplayUnit]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useAccountSetting(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useAccountSetting must be used within SettingsProvider');
  return ctx;
}
