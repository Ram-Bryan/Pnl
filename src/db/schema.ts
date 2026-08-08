// ============================================================
// TypeScript types that mirror schema.sql exactly.
// Computed fields (pnl, pnl_pct, r_multiple, holding_time) are
// intentionally absent from these types — they are always derived.
// ============================================================

export type Account = {
  id: number;
  name: string;
  currency: string; // ISO 4217
  starting_balance: number;
  created_at: string;
};

export type AssetClass = 'equity' | 'fno' | 'crypto' | 'forex' | 'gold' | 'currency';
export type TradeStyle = 'intraday' | 'positional' | 'swing' | 'investment';

export type TradeFill = {
  id: number;
  trade_id: number;
  side: 'entry' | 'exit';
  price: number;
  quantity: number;
  note: string | null;
  occurred_at: string;
  sort_order: number;
};

export type PriceMode = 'standard' | 'cents';

export type Instrument = {
  id: number;
  symbol: string;
  name: string | null;
  asset_class: AssetClass;
  quote_currency: string;
  price_mode: PriceMode;
  contract_size: number;
  tick_size: number | null;
  created_at: string;
};

export type Strategy = {
  id: number;
  name: string;
  description: string | null;
  archived_at: string | null;
  created_at: string;
};

export type StrategyRule = {
  id: number;
  strategy_id: number;
  rule_text: string;
  sort_order: number;
  archived_at: string | null;
};

export type Emotion = {
  id: number;
  name: string;
  color: string | null;
};

export type Tag = {
  id: number;
  name: string;
  color: string | null;
};

export type TradeDirection = 'long' | 'short';
export type TradeStatus = 'open' | 'closed';

export type Trade = {
  id: number;
  account_id: number;
  instrument_id: number;
  strategy_id: number | null;
  emotion_id: number | null;
  trade_style: TradeStyle | null;
  entry_condition: string | null;
  exit_condition: string | null;
  direction: TradeDirection;
  status: TradeStatus;
  entry_price: number;
  exit_price: number | null;
  size: number;
  stop_loss: number | null;
  take_profit: number | null;
  entry_at: string; // ISO 8601 datetime
  exit_at: string | null;
  fees: number;
  followed_rules: 0 | 1 | null; // nullable tri-state
  notes: string | null;
  reflection: string | null;
  created_at: string;
  updated_at: string;
};

export type TradeRuleCheck = {
  trade_id: number;
  strategy_rule_id: number;
  checked: 0 | 1;
};

export type TradeTag = {
  trade_id: number;
  tag_id: number;
};

export type TradeScreenshot = {
  id: number;
  trade_id: number;
  file_path: string; // local file URI
  caption: string | null;
  sort_order: number;
  created_at: string;
};

export type GoalKind = 'profit_goal' | 'loss_limit';
export type GoalPeriod = 'daily' | 'weekly' | 'monthly';

export type Goal = {
  id: number;
  account_id: number;
  kind: GoalKind;
  period: GoalPeriod;
  amount: number; // always positive; sign implied by kind
  effective_from: string;
  effective_to: string | null;
  created_at: string;
};

export type ReviewPeriod = 'weekly' | 'monthly';

export type Review = {
  id: number;
  account_id: number;
  period: ReviewPeriod;
  period_start: string; // Monday for weekly, 1st for monthly
  reflection: string | null;
  created_at: string;
  updated_at: string;
};

export type Setting = {
  key: string;
  value: string;
};
