import type { Ionicons } from '@expo/vector-icons';

export type TradeStyle = 'intraday' | 'positional' | 'swing' | 'investment';
export type AssetClassKey = 'equity' | 'fno' | 'crypto' | 'forex' | 'gold' | 'currency';

export const TRADE_STYLES: { key: TradeStyle; label: string }[] = [
  { key: 'intraday', label: 'Intraday' },
  { key: 'positional', label: 'Positional' },
  { key: 'swing', label: 'Swing' },
  { key: 'investment', label: 'Investment' },
];

export const ASSET_CLASSES: {
  key: AssetClassKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'equity', label: 'Equity', icon: 'business' },
  { key: 'fno', label: 'F&O', icon: 'options' },
  { key: 'crypto', label: 'Crypto', icon: 'logo-bitcoin' },
  { key: 'forex', label: 'Forex', icon: 'swap-horizontal' },
  { key: 'gold', label: 'Gold', icon: 'medal' },
  { key: 'currency', label: 'Currency', icon: 'cash' },
];

export const ENTRY_CONDITIONS = [
  'Breakout', 'Pullback', 'Trend', 'Reversal', 'Support/Resistance',
  'Gap', 'News', 'Pattern', 'Other',
];

export const EXIT_CONDITIONS = [
  'Target', 'Stop loss', 'Trailing', 'Time', 'Signal', 'News',
  'Oversized risk', 'Other',
];
