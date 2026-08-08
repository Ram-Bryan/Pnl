import { AssetClass } from './schema';

const LEGACY_MAP: Record<string, AssetClass> = {
  stock: 'equity',
  futures: 'fno',
  option: 'fno',
  forex: 'forex',
  crypto: 'crypto',
  other: 'equity',
};

export function mapLegacyAssetClass(value: string): AssetClass {
  return LEGACY_MAP[value] ?? 'equity';
}
