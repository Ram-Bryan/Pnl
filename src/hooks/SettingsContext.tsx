import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getAllSettings, setSetting, getFirstAccount, updateAccountPriceMode } from '../db/database';
import { AccountType } from '../stats/tradeMath';
import { DisplayUnit } from '../lib/format';

type SettingsContextValue = {
  accountType: AccountType;
  displayUnit: DisplayUnit;
  loading: boolean;
  currentPrices: Record<string, number>;
  setAccountType: (value: AccountType) => Promise<void>;
  setDisplayUnit: (value: DisplayUnit) => Promise<void>;
  setCurrentPrice: (symbol: string, price: number | null) => Promise<void>;
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
  const [currentPrices, setCurrentPricesState] = useState<Record<string, number>>({});
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

        // Mark prices are persisted per symbol under current_price_<SYMBOL> so
        // open positions keep their floating P&L across app restarts.
        const markPrices: Record<string, number> = {};
        for (const [key, value] of Object.entries(settings)) {
          if (key.startsWith('current_price_')) {
            const num = parseFloat(value);
            if (Number.isFinite(num)) markPrices[key.slice('current_price_'.length)] = num;
          }
        }

        if (active) {
          setAccountTypeState(accountTypeValue);
          setDisplayUnitState(stored === 'usc' || stored === 'usd' ? stored : defaultUnit);
          setCurrentPricesState(markPrices);
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

  const setCurrentPrice = useCallback(async (symbol: string, price: number | null) => {
    const key = `current_price_${symbol.toUpperCase().trim()}`;
    if (price == null || !Number.isFinite(price)) {
      await db.runAsync('DELETE FROM settings WHERE key = ?', [key]);
      setCurrentPricesState(prev => {
        const next = { ...prev };
        delete next[symbol.toUpperCase().trim()];
        return next;
      });
    } else {
      await setSetting(db, key, String(price));
      setCurrentPricesState(prev => ({ ...prev, [symbol.toUpperCase().trim()]: price }));
    }
  }, [db]);

  const value = useMemo(
    () => ({ accountType, displayUnit, loading, currentPrices, setAccountType, setDisplayUnit, setCurrentPrice }),
    [accountType, displayUnit, loading, currentPrices, setAccountType, setDisplayUnit, setCurrentPrice]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useAccountSetting(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useAccountSetting must be used within SettingsProvider');
  return ctx;
}
