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

export function formatPrice(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 2 : 4;
  return Number(value.toFixed(digits)).toString();
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
