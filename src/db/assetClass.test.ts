import { describe, it, expect } from 'vitest';
import { mapLegacyAssetClass } from './assetClass';

describe('mapLegacyAssetClass', () => {
  it('maps legacy values to reference classes', () => {
    expect(mapLegacyAssetClass('stock')).toBe('equity');
    expect(mapLegacyAssetClass('futures')).toBe('fno');
    expect(mapLegacyAssetClass('option')).toBe('fno');
    expect(mapLegacyAssetClass('forex')).toBe('forex');
    expect(mapLegacyAssetClass('crypto')).toBe('crypto');
  });
  it('falls back to equity for unknown', () => {
    expect(mapLegacyAssetClass('bogus')).toBe('equity');
  });
});
