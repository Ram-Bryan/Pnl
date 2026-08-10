// Guess the quote currency of a currency pair from its symbol (USDJPY -> JPY).
// Returns null when the symbol is not a 6-letter pair ending in a known code.

const CURRENCY_CODES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD',
  'CNY', 'HKD', 'SGD', 'SEK', 'NOK', 'MXN', 'ZAR', 'TRY',
  'RUB', 'INR', 'BRL', 'PLN', 'KRW', 'TWD', 'THB', 'DKK',
];

export function inferQuoteCurrency(symbol: string): string | null {
  const s = symbol.trim().toUpperCase();
  if (s.length !== 6) return null;
  const quote = s.slice(-3);
  return CURRENCY_CODES.includes(quote) ? quote : null;
}
