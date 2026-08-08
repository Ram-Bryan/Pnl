const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPnl(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const sign = rounded >= 0 ? '+' : '-';
  return `${sign}$${moneyFormatter.format(Math.abs(rounded))}`;
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
