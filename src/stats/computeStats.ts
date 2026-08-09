import { AssetClass, TradeStyle } from '../db/schema';

// Pure stats engine — no SQLite dependency.
// P&L is ALWAYS computed here, never stored in the DB.

export type TradeWithInstrument = {
  id: number;
  account_id: number;
  instrument_id: number;
  strategy_id: number | null;
  emotion_id: number | null;
  trade_style: TradeStyle | null;
  entry_condition: string | null;
  exit_condition: string | null;
  direction: 'long' | 'short';
  status: 'open' | 'closed';
  entry_price: number;
  exit_price: number | null;
  size: number;
  stop_loss: number | null;
  take_profit: number | null;
  entry_at: string;
  exit_at: string | null;
  fees: number;
  followed_rules: 0 | 1 | null;
  notes: string | null;
  reflection: string | null;
  created_at: string;
  updated_at: string;
  // joined from instruments
  symbol: string;
  instrument_name: string | null;
  quote_currency: string;
  price_mode: 'standard' | 'cents';
  contract_size: number;
  asset_class: AssetClass;
  strategy_name: string | null;
  emotion_name: string | null;
};

export type StatsResult = {
  todayPnl: number;
  weekPnl: number;
  monthPnl: number;
  allTimePnl: number;
  winRate: number;       // 0–100
  totalTrades: number;
  wins: number;
  losses: number;
  expectancy: number;    // avg P&L per closed trade
  currentStreak: number; // positive = win streak, negative = loss streak
};

// Compute gross P&L for a single trade in USD, accounting for accountType and quote_currency.
// - For a Cent account, the lot scale is 0.01x vs standard (1 lot = 1000 units not 100,000)
// - For non-USD quote pairs (e.g. JPY in USDJPY), divides by entry_price to convert back to USD
// Returns 0 for open trades (no exit_price).
export function computeTradePnl(trade: TradeWithInstrument, accountType: 'standard' | 'cents' = 'standard'): number {
  if (trade.exit_price == null) return 0;

  const priceDiff =
    trade.direction === 'long'
      ? trade.exit_price - trade.entry_price
      : trade.entry_price - trade.exit_price;

  const rawSize = trade.size * trade.contract_size;
  // A cent account uses 0.01x lot scale vs standard
  const adjustedSize = accountType === 'cents' ? rawSize * 0.01 : rawSize;

  let rawPnl = priceDiff * adjustedSize;

  // Convert quote currency to USD if needed (e.g. JPY -> USD: divide by exchange rate)
  if (trade.quote_currency && trade.quote_currency !== 'USD' && trade.entry_price > 0) {
    rawPnl /= trade.entry_price;
  }

  return rawPnl - trade.fees;
}

function toDateString(iso: string): string {
  return iso.slice(0, 10);
}

function getWeekStart(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - ((day + 6) % 7); // Monday as week start
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

export function computeStats(trades: TradeWithInstrument[], accountType: 'standard' | 'cents' = 'standard'): StatsResult {
  const now = new Date();
  const todayStr = toDateString(now.toISOString());
  const weekStartStr = getWeekStart(now);
  const monthStr = now.toISOString().slice(0, 7);

  const closed = trades.filter((t) => t.status === 'closed' && t.exit_price != null);

  let todayPnl = 0, weekPnl = 0, monthPnl = 0, allTimePnl = 0;
  let grossProfit = 0, grossLoss = 0, wins = 0;

  for (const t of closed) {
    const pnl = computeTradePnl(t, accountType);
    const dateStr = toDateString(t.exit_at ?? t.entry_at);

    if (dateStr === todayStr) todayPnl += pnl;
    if (dateStr >= weekStartStr) weekPnl += pnl;
    if (dateStr.startsWith(monthStr)) monthPnl += pnl;

    allTimePnl += pnl;

    if (pnl > 0) { grossProfit += pnl; wins++; }
    else if (pnl < 0) { grossLoss += Math.abs(pnl); }
  }

  const totalTrades = closed.length;
  const losses = totalTrades - wins;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const expectancy = totalTrades > 0 ? (grossProfit - grossLoss) / totalTrades : 0;

  let streak = 0;
  if (closed.length > 0) {
    const sorted = [...closed].sort(
      (a, b) => (b.exit_at ?? b.entry_at).localeCompare(a.exit_at ?? a.entry_at)
    );
    const firstPnl = computeTradePnl(sorted[0], accountType);
    const sign = firstPnl >= 0 ? 1 : -1;
    for (const t of sorted) {
      const pnl = computeTradePnl(t, accountType);
      if ((pnl >= 0 ? 1 : -1) !== sign) break;
      streak += sign;
    }
  }

  return { todayPnl, weekPnl, monthPnl, allTimePnl, winRate, totalTrades, wins, losses, expectancy, currentStreak: streak };
}
