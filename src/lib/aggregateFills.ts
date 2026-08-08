export function averageFillPrice(fills: { price: number; quantity: number }[]): number {
  if (fills.length === 0) return 0;
  const total = fills.reduce((sum, f) => sum + f.price * f.quantity, 0);
  const qty = fills.reduce((sum, f) => sum + f.quantity, 0);
  return qty === 0 ? 0 : total / qty;
}

export function totalQuantity(fills: { quantity: number }[]): number {
  return fills.reduce((sum, f) => sum + f.quantity, 0);
}

export function tradeTotalSize(entryFills: { quantity: number }[]): number {
  return totalQuantity(entryFills);
}
