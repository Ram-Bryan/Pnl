// Pure money math for P&L, shared by computeStats and the add-trade preview.
// Canonical unit is real USD. On a cents account (MT5 cent-account sizing) lots
// map to 100x smaller positions, and fees are entered in the account's display
// unit (USC), so both are scaled by 0.01 before computing.

export type AccountType = 'standard' | 'cents';

export function tradeVolume(lots: number, contractSize: number, accountType: AccountType): number {
  const centScale = accountType === 'cents' ? 0.01 : 1;
  return lots * contractSize * centScale;
}

export function computeTradePnlInUsd(input: {
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  lots: number;
  contractSize: number;
  quoteCurrency: string;
  fees: number;
  accountType: AccountType;
}): number {
  const { direction, entryPrice, exitPrice, lots, contractSize, quoteCurrency, fees, accountType } = input;
  const priceDiff = direction === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  let pnlInQuote = priceDiff * tradeVolume(lots, contractSize, accountType);
  // Convert non-USD quote currency (e.g. JPY in USDJPY) to USD by the entry rate.
  if (quoteCurrency && quoteCurrency !== 'USD' && entryPrice > 0) {
    pnlInQuote /= entryPrice;
  }
  const feesUsd = fees * (accountType === 'cents' ? 0.01 : 1);
  return pnlInQuote - feesUsd;
}

export function computeInvestedUsd(input: {
  entryPrice: number;
  lots: number;
  contractSize: number;
  quoteCurrency: string;
  accountType: AccountType;
}): number {
  const { entryPrice, lots, contractSize, quoteCurrency, accountType } = input;
  const volume = tradeVolume(lots, contractSize, accountType);
  // Approximation for pairs whose base currency isn't USD; exact for the
  // common USD-quoted (EURUSD) and USD-based (USDJPY) cases.
  return volume * (quoteCurrency === 'USD' ? entryPrice : 1);
}
