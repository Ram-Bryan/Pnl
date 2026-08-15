import { AssetClass, TradeStyle } from '../db/schema';
import { computeTradePnlInUsd } from './tradeMath';
import { resolveQuoteCurrency } from '../lib/quoteCurrency';

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
  ticket: string | null;
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

// Compute gross P&L for a single trade in real USD.
// - Lot volume is scaled 100x smaller on a cents account (MT5 cent-account sizing).
// - For non-USD quote pairs (e.g. JPY in USDJPY), converts to USD by the entry price.
// Returns 0 for open trades (no exit_price).
// MT5 rounds each trade's realized profit to the account currency's cent before
// carrying it into totals. Cents accounts display USC (2 decimals), so their USD
// value is quantized to 0.0001. This is the single rounding boundary — the
// add-trade preview uses computeTradePnlInUsd directly and keeps full precision.
function roundPnlToAccountCent(pnlUsd: number, priceMode: 'standard' | 'cents'): number {
  const digits = priceMode === 'cents' ? 4 : 2;
  return Number(pnlUsd.toFixed(digits));
}

export function computeTradePnl(trade: TradeWithInstrument): number {
  if (trade.exit_price == null) return 0;

  return roundPnlToAccountCent(
    computeTradePnlInUsd({
      direction: trade.direction,
      entryPrice: trade.entry_price,
      exitPrice: trade.exit_price,
      lots: trade.size,
      contractSize: trade.contract_size,
      quoteCurrency: resolveQuoteCurrency(trade.symbol, trade.quote_currency),
      fees: trade.fees,
      accountType: trade.price_mode,
    }),
    trade.price_mode,
  );
}

function toDateString(iso: string): string {
  return iso.slice(0, 10);
}

// Stored dates are naive UTC ISO: manual "now" entries use toISOString() and
// imported CSV timestamps are kept verbatim in the export's UTC frame. So
// "today", week start and month must be derived in UTC too — matching MT5's
// server days and the dashboard calendars (getWeekDays/getMonthDays use
// Date.UTC). Deriving them in local time would shift trades into the wrong
// bucket for users outside UTC around midnight.
function utcYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function getWeekStartUtc(d: Date): string {
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - ((day + 6) % 7); // Monday as week start
  const monday = new Date(d);
  monday.setUTCDate(diff);
  return utcYmd(monday);
}

export function computeStats(trades: TradeWithInstrument[]): StatsResult {
  const now = new Date();
  const todayStr = utcYmd(now);
  const weekStartStr = getWeekStartUtc(now);
  const monthStr = todayStr.slice(0, 7);

  const closed = trades.filter((t) => t.status === 'closed' && t.exit_price != null);

  let todayPnl = 0, weekPnl = 0, monthPnl = 0, allTimePnl = 0;
  let grossProfit = 0, grossLoss = 0, wins = 0;

  for (const t of closed) {
    const pnl = computeTradePnl(t);
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
    const firstPnl = computeTradePnl(sorted[0]);
    // A zero-P&L trade is neither a win nor a loss and ends any run.
    if (firstPnl !== 0) {
      const sign = firstPnl > 0 ? 1 : -1;
      for (const t of sorted) {
        const pnl = computeTradePnl(t);
        if (pnl === 0) break;
        if ((pnl > 0 ? 1 : -1) !== sign) break;
        streak += sign;
      }
    }
  }

  return { todayPnl, weekPnl, monthPnl, allTimePnl, winRate, totalTrades, wins, losses, expectancy, currentStreak: streak };
}
