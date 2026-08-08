import { describe, it, expect } from 'vitest';
import { TRADE_STYLES, ASSET_CLASSES, ENTRY_CONDITIONS, EXIT_CONDITIONS } from './constants';

describe('constants', () => {
  it('trade styles cover the reference set', () => {
    expect(TRADE_STYLES.map((s) => s.key)).toEqual([
      'intraday', 'positional', 'swing', 'investment',
    ]);
  });
  it('asset classes cover the reference set', () => {
    expect(ASSET_CLASSES.map((a) => a.key)).toEqual([
      'equity', 'fno', 'crypto', 'forex', 'gold', 'currency',
    ]);
  });
  it('conditions are non-empty and unique', () => {
    expect(new Set(ENTRY_CONDITIONS).size).toBe(ENTRY_CONDITIONS.length);
    expect(new Set(EXIT_CONDITIONS).size).toBe(EXIT_CONDITIONS.length);
  });
});
