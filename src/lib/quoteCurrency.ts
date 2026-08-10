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

// The DB defaults new symbols to 'USD' quote currency, which silently breaks P&L
// conversion for currency pairs (e.g. a USDJPY symbol stored as 'USD' skips the
// JPY->USD division). When the stored value is still that generic default but the
// symbol encodes a different quote, use the symbol's.
export function resolveQuoteCurrency(symbol: string, storedQuote: string): string {
  const quote = storedQuote.trim().toUpperCase();
  if (quote !== 'USD') return quote || 'USD';
  return inferQuoteCurrency(symbol) ?? 'USD';
}
