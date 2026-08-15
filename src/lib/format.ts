export type DisplayUnit = 'usd' | 'usc';

const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPnl(value: number, displayUnit: DisplayUnit = 'usd'): string {
  const isUsc = displayUnit === 'usc';
  // value is always real USD. USC display scales up 100x.
  const displayValue = isUsc ? value * 100 : value;
  const v = Math.abs(displayValue);
  if (isUsc) {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k USC`;
    return `${v.toFixed(2)} USC`;
  }
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  const digits = v >= 0.01 ? 2 : v >= 0.001 ? 3 : 4;
  return `$${v.toFixed(digits)}`;
}

export function formatMoney(value: number): string {
  return `$${moneyFormatter.format(value)}`;
}

// Imported prices are stored to ≤6 decimals (csvParser.parsePrice); show them
// exactly as stored — no rounding down to 2/4 decimals and no zero-padding.
export function formatPrice(value: number): string {
  return Number(value.toFixed(6)).toString();
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
