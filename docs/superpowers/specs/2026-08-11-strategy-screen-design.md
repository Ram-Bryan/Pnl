# Strategy Management — Design Spec

Date: 2026-08-11
Status: Approved for implementation

## 1. Problem

The app has a complete *storage* model for strategies — `strategies`,
`strategy_rules`, and `trade_rule_checks` tables, a single `trades.strategy_id`
FK, and add-trade already lets you pick a strategy and tick its rule checklist —
but there is **no management surface**: you cannot create, edit, or delete
strategies from the app, and there is no way to see how any strategy performs.

The user wants a professional strategy module: add strategies, give each one
details (description + a custom rule checklist), view per-strategy performance
stats, and select those strategies when adding a trade.

Separately, the symbol autocomplete in add-trade is broken: the inline
dropdown is clipped by the card below it, its inner list doesn't scroll
reliably, and "Add new symbol" sits at the bottom.

## 2. Decisions (user-confirmed)

1. **One strategy per trade** — every trade belongs to exactly one strategy
   (or none). Per-strategy stats are therefore unambiguous. Keeps the existing
   `trades.strategy_id` schema. (Rejected: a many-to-many `trade_strategies`
   join table.)
2. **New "Strategies" tab** — a 5th tab next to Dashboard / Trades / Symbols /
   Settings. Detail screen pushed from the list, like `trade/[id]`.
3. **Full pro stats set** — see §4. No schema changes required.
4. **Symbol picker → bottom Sheet** — replaces the fragile absolute-positioned
   dropdown; "Add new symbol" pinned as the first row with an inline quick-add
   form so the add-trade flow is never abandoned.

## 3. Approach (chosen)

Pure-extension over the existing schema. **No migrations.** Add a pure stats
module, thin CRUD wrappers, two hooks, two screens, and upgrade the two
add-trade pickers. All P&L stays *computed* (never stored) via the existing
`computeTradePnl`.

Rejected alternatives:
- **Schema v2** (per-strategy colors/tags, cached trade counts in the DB) —
  violates the "P&L is always computed" invariant; adds migration risk for no
  user value.
- **Full analytics** (per-strategy equity curves, monthly breakdowns) — scope
  creep; the full pro set covers strategy evaluation at this stage.

### 3.1 Shared trades query (refactor)

The trades-with-instrument SQL is duplicated verbatim in `useDashboard.ts` and
`useTrades.ts`; the strategies hook would be a third copy. Extract it once:

- `src/db/database.ts`: `getAllTradesWithInstrument(db): Promise<TradeWithInstrument[]>`
  (the exact query today, joining `accounts` for `price_mode`, `instruments`,
  `strategies`, `emotions`, ordered by `entry_at DESC`).
- `useDashboard.ts`, `useTrades.ts`, and the new `useStrategies.ts` all call it.
  This is a behavior-preserving refactor; existing dashboard/trades tests must
  keep passing untouched.

## 4. Stats engine — `src/stats/strategyStats.ts` (new, pure, testable)

No SQLite dependency. Accepts `TradeWithInstrument[]` filtered to one strategy.

### `computeStrategyStats(trades: TradeWithInstrument[]): StrategyStats`

Computes over **closed** trades only (status `closed` and `exit_price != null`).

```ts
type StrategyStats = {
  totalTrades: number;   // closed trades
  wins: number;
  losses: number;
  winRate: number;       // 0–100
  netPnl: number;        // sum of real-USD P&L
  grossProfit: number;   // sum of winning P&L (positive)
  grossLoss: number;     // sum of losing P&L (positive)
  profitFactor: number | null; // grossProfit / grossLoss; null when grossLoss === 0
  expectancy: number;    // netPnl / totalTrades
  avgWin: number;        // grossProfit / wins (0 when no wins)
  avgLoss: number;       // grossLoss / losses (0 when no losses)
  bestTrade: number;     // max P&L
  worstTrade: number;    // min P&L
  currentStreak: number; // positive = win streak, negative = loss streak
};
```

P&L per trade comes from the existing `computeTradePnl(trade)` (real USD,
sized by `trade.price_mode`, quote-currency conversion applied). Streak logic
mirrors `computeStats`: sort closed trades by `exit_at ?? entry_at` descending,
walk the most recent run of the same sign. Empty input → all zeros, `winRate`
0, `profitFactor` null.

### `computeRuleAdherence(rows): RuleAdherence[]`

Takes per-rule check counts and derives the percentages — pure, so it is tested.

```ts
type RuleAdherenceInput = { ruleId: number; rule_text: string; checked: number; unchecked: number };
type RuleAdherence = { ruleId: number; ruleText: string; checked: number; unchecked: number; adherence: number }; // 0–100
```

## 5. DB layer — `src/db/database.ts` (additions)

Thin, transaction-free wrappers (single statements; the app's chosen
error-handling convention is exceptions that propagate):

- `insertStrategy(db, { name, description }): Promise<number>` — `name` is
  UNIQUE; violations surface as thrown errors (surfaced via `Alert` by the UI).
- `updateStrategy(db, id, { name, description }): Promise<void>`
- `archiveStrategy(db, id): Promise<void>` — sets `archived_at` (soft delete;
  historical trades keep their FK and still resolve `strategy_name` in the
  join). Hard delete would orphan trades — never used.
- `getStrategyById(db, id): Promise<Strategy | null>`
- `insertStrategyRule(db, strategyId, ruleText): Promise<number>` — `sort_order`
  appended after the current max.
- `updateStrategyRule(db, ruleId, ruleText): Promise<void>`
- `archiveStrategyRule(db, ruleId): Promise<void>` — archived rules disappear
  from live checklists (`getStrategyRules` already filters `archived_at IS NULL`)
  but remain visible on historical trades (`getTradeRuleChecks` joins rules
  without the archived filter — verified).
- `getRuleAdherence(db, strategyId): Promise<RuleAdherenceInput[]>` — single
  aggregate query, only **active** rules:

```sql
SELECT r.id AS ruleId, r.rule_text,
       SUM(c.checked) AS checked,
       COUNT(*) - SUM(c.checked) AS unchecked
FROM trade_rule_checks c
JOIN strategy_rules r ON r.id = c.strategy_rule_id
JOIN trades t ON t.id = c.trade_id
WHERE r.strategy_id = ? AND r.archived_at IS NULL
GROUP BY r.id
ORDER BY r.sort_order
```

Trades whose `strategy_id` doesn't match the rule's strategy are excluded by
construction because `trade_rule_checks` rows only ever come from the selected
strategy's rules.

## 6. Hooks

### `src/hooks/useStrategies.ts`
- Loads `getStrategies(db)` + `getAllTradesWithInstrument(db)`.
- Memoizes `statsByStrategy: Record<number, StrategyStats>` by filtering trades
  per `strategy_id` and calling `computeStrategyStats`.
- Exposes `strategies`, `statsByStrategy`, `loading`, `error`, `refetch`, and
  CRUD actions (`addStrategy`, `updateStrategy`, `archiveStrategy`,
  `addRule`, `updateRule`, `archiveRule`) that each run the DB call and refetch.
  Refresh with `useFocusEffect` like the other tab hooks.

### `src/hooks/useStrategyDetail.ts`
- For `strategy/[id]`: strategy + stats + rules (with adherence via
  `getRuleAdherence`) + recent trades (top 10 by `entry_at DESC`).
- Same CRUD actions as above; used by both the detail screen and add-trade's
  "New strategy" sheet.

## 7. Screens

### Strategies tab — `app/(tabs)/strategies.tsx` (new)

- 5th tab in `app/(tabs)/_layout.tsx`, icon `bulb`, title "Strategies",
  placed after Trades: Dashboard / Trades / **Strategies** / Symbols / Settings.
- Header "Strategies" + `+` button (mirrors the Symbols tab header).
- List rows (mirror Symbols row styling): name, one-line description, and a
  stats strip: `n closed · winRate% · netPnl` (net colored green/red,
  formatted with `formatPnl` in the Settings display unit).
- Row tap → `router.push(\`/strategy/${s.id}\`)`.
- Add button opens a `Sheet` (name + description; name required and unique;
  duplicate name → `Alert` with the DB error). Uses `Sheet`, `Field`,
  `TextInputField`, `Button` from the UI kit.
- Empty state via the existing `EmptyState` component.

### Strategy detail — `app/strategy/[id].tsx` (new)

Registered in `app/_layout.tsx` (`<Stack.Screen name="strategy/[id]" options={{ title: 'Strategy' }} />`).

- **Hero card**: strategy name, description, "Edit" (pencil → edit sheet),
  and "＋ New Trade" → `router.push(\`/add-trade?strategyId=${id}\`)` so the
  new trade arrives with the strategy preselected.
- **Stats grid** (2 columns, `Card`s): Net P&L, Closed Trades, Win Rate,
  Profit Factor (or "∞"), Expectancy, Avg Win, Avg Loss, Best Trade,
  Worst Trade, Streak. Money values through `formatPnl` in the display unit.
- **Rules section**: each active rule with adherence — progress bar
  (`adherence%` of a tinted track) + `n/m followed`. "＋ Add rule" adds a row.
  Per-rule edit (pencil) renames; archive via trash with confirm. Order
  preserved (`sort_order`).
- **Recent trades**: up to 10, rendered with the existing `TradeRow`
  component, tapping → `trade/[id]`.
- **Archive strategy** (bottom, danger): confirm dialog noting historical
  trades are kept. After archiving, `router.back()` to the (now-refreshed) tab.

## 8. Add-trade updates — `app/add-trade.tsx` + `src/hooks/useAddTrade.ts`

### Strategy sheet (upgrade, no new mechanics)
- Keep the rules checklist flow untouched (`selectStrategy`, `toggleRuleCheck`,
  `saveTradeAssociations`).
- Sheet rows show rule count per strategy (from `strategyRules` when loaded,
  or a `getStrategyRules` count lookup in `useAddTrade`).
- Pin a **"＋ New strategy"** row at the top of the sheet → opens the same
  add-strategy sheet used by the Strategies tab. The form (name + description,
  save/cancel) is used in **three** places — Strategies tab (add), Strategy
  detail (edit), add-trade quick-add — so per AGENTS.md it is extracted once as
  `src/ui/StrategyFormSheet.tsx` (a domain UI component, like `PnlText`/
  `TradeRow`). On save, auto-select the new strategy.

### Symbol picker (bug fix)
- Delete the absolute-positioned dropdown block (`symbolFocused` overlay,
  nested `ScrollView`, `zIndex` juggling) — the root cause of the clipping.
- The symbol field becomes a `SelectRow`-style button ("Select symbol…")
  showing the selected symbol, exactly like the Strategy field.
- Tapping opens a `Sheet`:
  1. Search `TextInput` at the top (autofocused, uppercase, filters the list).
  2. **"＋ Add new symbol" — first row**, pinned above the results: expands an
     inline mini-form (symbol, asset class `Segmented`, contract size;
     quote currency auto-inferred via the existing `inferQuoteCurrency`).
     Saving calls `insertInstrument`, selects the new instrument, and closes
     the sheet. The user never leaves the add-trade flow.
  3. Matching instruments below (symbol, name, asset-class badge). Selecting
     sets `instrumentId` and closes.
- Existing `symbolQuery`/`symbolFocused` state and the `setInstrumentId(null)`
  clear-on-type behavior are removed with the dropdown.

## 9. Files touched

- New: `src/stats/strategyStats.ts`, `src/stats/strategyStats.test.ts`,
  `src/hooks/useStrategies.ts`, `src/hooks/useStrategyDetail.ts`,
  `app/(tabs)/strategies.tsx`, `app/strategy/[id].tsx`,
  `src/ui/StrategyFormSheet.tsx`.
- Modified: `src/db/database.ts`, `src/hooks/useDashboard.ts`,
  `src/hooks/useTrades.ts`, `src/hooks/useAddTrade.ts`, `app/add-trade.tsx`,
  `app/(tabs)/_layout.tsx`, `app/_layout.tsx`.

## 10. Testing

- **New** `src/stats/strategyStats.test.ts`: win rate; profit factor
  (null when there are no losses — displayed as "∞"); avg win/avg loss on empty
  sides; best/worst; current streak sign/length; empty input all-zeros.
  Rule-adherence percentages (full adherence, partial, none).
- Existing **45 tests keep passing**; the shared-query refactor changes no
  behavior (dashboard/trades tests untouched).
- `pnpm typecheck` clean.
- Manual smoke (device): Strategies tab CRUD, strategy stats correctness vs a
  known strategy's trades, add-trade symbol sheet (Add-first, search, quick-add,
  selection), strategy preselection via `?strategyId=`, trade detail still shows
  rules for archived rules.

## 11. Out of scope

- Multiple strategies per trade, per-strategy equity curves, monthly win-rate
  breakdowns, strategy colors/tags, archiving/restoring from a "hidden" list.
- Component/E2E tests (repo norm: Vitest covers pure layers only).
