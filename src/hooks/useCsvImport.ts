import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { useSQLiteContext } from 'expo-sqlite';
import { parseCsvRows } from '../lib/csvParser';
import { importTradesFromCsv, getFirstAccount } from '../db/database';
import { showError } from '../ui/ErrorModal';

export type ImportSummary = {
  count: number;
  symbols: string[];
};

type UseCsvImportOptions = {
  /** Called after a successful import so the caller can refresh its data. */
  onImported?: () => void | Promise<void>;
};

export function useCsvImport({ onImported }: UseCsvImportOptions = {}) {
  const db = useSQLiteContext();
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [pendingCsv, setPendingCsv] = useState<string | null>(null);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const uri = result.assets[0].uri;
      if (!uri.toLowerCase().endsWith('.csv')) {
        showError({ title: 'Invalid File', message: 'Selected file must be a CSV file.' });
        return;
      }

      const response = await fetch(uri);
      const csvText = await response.text();
      const rows = parseCsvRows(csvText);

      if (rows.length === 0) {
        showError({ title: 'No Trades Found', message: 'The CSV file contains no valid trade rows.' });
        return;
      }

      setPendingCsv(csvText);
      setSummary({ count: rows.length, symbols: [...new Set(rows.map(r => r.symbol))] });
    } catch (e) {
      showError({ title: 'Parse Error', message: e instanceof Error ? e.message : 'Failed to parse CSV.' });
    }
  };

  const confirmImport = async () => {
    if (!pendingCsv) return;
    setImporting(true);
    setSummary(null);
    try {
      const rows = parseCsvRows(pendingCsv);
      const account = await getFirstAccount(db);
      if (!account) throw new Error('No account found.');

      const result = await importTradesFromCsv(db, rows, account.id);
      setPendingCsv(null);
      await onImported?.();
      showError({ title: 'Import Complete', message: `${result.imported} trades imported across ${result.symbols} new symbols.` });
    } catch (e) {
      showError({ title: 'Import Failed', message: e instanceof Error ? e.message : 'An error occurred during import.' });
    } finally {
      setImporting(false);
    }
  };

  const cancelImport = () => {
    setSummary(null);
    setPendingCsv(null);
  };

  return { importing, summary, pickFile, confirmImport, cancelImport };
}
