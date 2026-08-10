const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPnl(value: number, accountType: 'standard' | 'cents' = 'standard'): string {
  const isCents = accountType === 'cents';
  // If baseline is Cents: Cents view displays natively. Standard view divides by 100 to show Dollars.
  const displayValue = isCents ? value : value / 100;
  const rounded = Math.round(displayValue * 100) / 100;
  const v = Math.abs(rounded);
  if (isCents) {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k USC`;
    return `${v.toFixed(2)} USC`;
  } else {
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
    return `$${moneyFormatter.format(v)}`;
  }
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
