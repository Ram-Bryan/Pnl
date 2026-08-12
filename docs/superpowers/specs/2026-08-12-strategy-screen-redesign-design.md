# Strategy Screen Redesign — Design Spec

**Date:** 2026-08-12
**Status:** Approved design (pending implementation)

## Objective

Rework the two strategy screens to match the app's established trade-card and dashboard visual language, and remove the archive button from the strategy detail screen (keeping the archive functionality intact).

## 1. Strategy card (Strategies tab)

The strategy list card is redesigned to look like a `TradeRow`-style card. It shows exactly three pieces of info:

- **Left block:**
  - Strategy **name** — `font-bold`, `text-white`, base size.
  - Strategy **description** (when present) — `text-xs`, `dark-text-muted`, single line (`numberOfLines={1}`).
  - **Win rate** — text line under the description, e.g. `55% win rate`; when the strategy has no closed trades show `—`. Uses `dark-text-secondary`.
- **Right block:**
  - **Net P&L** — right-aligned, `font-black`, tabular numerals, sign-prefixed (`+`/`−`), green `#00E68A` when ≥ 0, red `#FF4D6A` when < 0. Uses `formatPnl(netPnl, displayUnit)`.

**Removed from the current card:** the bulb icon chip, the "Closed" count column, the three-column stats row, and the chevron.

Card container follows the `TradeRow` hierarchy: `bg-dark-card rounded-2xl border border-dark-border p-4`, `Pressable` with pressed opacity, entrance animation preserved.

## 2. Strategy detail — Performance section

The Performance card now contains only:

1. **Win Rate doughnut** — centered at the top of the card (~150px diameter). Identical visual language to the dashboard `BigDonut`: dark track, green win arc `#00E68A`, red loss arc `#FF4D6A`, square line caps, centered `Win Rate` label + `%` value, and the `X Wins · Y Losses` legend underneath. Rendered at a smaller size than the dashboard's 220px.
2. **Stats grid** (below the doughnut) — exactly these cells, in this order:
   - Net P&L
   - Trades (count)
   - Avg Win
   - Avg Loss
   - Best Trade
   - Worst Trade

   Each cell keeps the existing `StatCell` style (label + tabular value, good/bad tone where P&L-signed).

**Removed from the current Performance card:** Profit Factor, Expectancy, Streak, and the "Closed Trades" cell (replaced by "Trades"). The card's other sections (strategy info, rules, recent trades) are unchanged.

## 3. Shared Win Rate doughnut component

The doughnut appears in both the dashboard (`app/(tabs)/index.tsx`, inline `BigDonut`, 220px) and the strategy detail (`app/strategy/[id].tsx`, 150px). Per the no-copy-paste rule, extract it into a shared component:

- `src/ui/WinRateDonut.tsx` — props: `{ winRate: number; wins: number; losses: number; size?: number }` (default size 220, matching current dashboard usage).
- Both the dashboard and the strategy detail render this shared component.
- The dashboard must render identically after the refactor (same 220px, same legend).

## 4. Archive button removal

Remove the `Archive Strategy` button (`Button title="Archive Strategy" variant="danger"`) from `app/strategy/[id].tsx`.

**Keep untouched:** `archiveStrategy` (hook), `archiveStrategy`/`archiveRule` (DB), and the `confirmArchiveStrategy` handler are no longer reachable from the UI but remain in the codebase — the functionality is preserved for future use. `archiveRule` and its trash icon on rule rows **stay** (only the strategy-level archive button is removed).

## Out of scope

- No changes to rules section, recent trades, add-trade screens, or dashboard behavior (other than using the shared doughnut).
- No DB or schema changes.
- No change to the archive **functionality** — only its UI affordance is removed.

## Verification

- `pnpm test` — existing suite passes (52 tests).
- `pnpm typecheck` — clean.
- Manual smoke: Strategies tab cards show only name/description/win-rate + P&L; detail Performance shows the doughnut and the 6 stats; dashboard doughnut unchanged; no archive button on detail.
