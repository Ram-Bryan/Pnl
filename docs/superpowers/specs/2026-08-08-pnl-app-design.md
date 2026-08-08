# Pnl Trading Journal — App Design & Architecture Spec

## 1. Overview
The Pnl Trading Journal is an offline-first mobile app for traders. The current redesign ships the **Light Emerald** theme: crisp, typography-driven screens on `bg-slate-50`, white cards with soft static shadows, emerald for gains and primary actions, rose for losses, amber for open-trade status. Scope is the **Core-4 screens** — Dashboard, Trade List, Add Trade, Trade Detail.

## 2. Tech Stack & UX Principles
- **Core Stack:** Expo SDK 57 / React Native 0.86, TypeScript (strict), expo-router (file-based routes in `app/`), NativeWind v4.2.6 (Tailwind v3.4.19 class strings), expo-sqlite (local data), pnpm.
- **Routed Screens:** Add Trade is a routed screen (`app/add-trade.tsx`), not a bottom sheet; edit mode reuses it via `/add-trade?id=<tradeId>`. The `Sheet` component is reserved for small pickers (strategy, entry/exit condition).
- **Offline By Default:** Everything executes locally; SQLite is the only store and there are no network calls.
- **Mobile Ergonomics:** Primary actions are anchored low — bottom tab bar, bottom-right FAB. Safe-area insets (`insets.top` / `insets.bottom`) are respected on every screen.

## 3. Design System

### Typography — system fonts
No custom fonts are loaded (the `@expo-google-fonts` packages in package.json are unused template deps; the `fontFamily` tokens in tailwind.config.js are unused). The hierarchy is built with weight/size/color on the platform system font:
- **Hero P&L:** `text-4xl` via `PnlText` (defaults to `font-bold`, signed emerald/rose color). The open-trade hero placeholder uses `text-4xl font-black`.
- **Page titles:** `text-2xl font-black`.
- **Section headers:** `text-lg font-bold` (`SectionHeader`).
- **Labels:** `text-xs uppercase tracking-wider text-slate-500 font-bold`.
- **Body:** `text-sm font-medium`.
- **Numeric displays** (`PnlText`, `NumericInput`, fill summaries, averaged rows) use `fontVariant: ['tabular-nums']` so columns of numbers align.

### Color — Light Emerald
- **Backgrounds:** `bg-slate-50`.
- **Cards/Surfaces:** white (`bg-white`) with `border border-slate-100` and a soft static `shadow-sm`.
- **Gains / primary actions:** emerald — `text-emerald-600` for positive P&L, `bg-emerald-600` for the FAB, primary buttons, selected chips and the active tab tint (`#059669`).
- **Losses:** `text-rose-500` for negative P&L; `bg-rose-50`/`text-rose-500` for the danger/delete variant.
- **Open-trade status:** amber — `bg-amber-50`/`text-amber-600` chips in lists; `text-amber-500` "Open" on the detail hero.

### Components — hand-rolled `src/ui/` kit
No third-party UI library. The kit is built directly on NativeWind in `src/ui/` and re-exported from `src/ui/index.ts`: `Button`, `Card`, `Chip`, `Segmented`, `Field` / `TextInputField` / `NumericInput`, `PnlText`, `SectionHeader`, `EmptyState`, `Fab`, `Sheet`, `TradeRow`.
- **Static-shadow invariant:** shadows are never toggled at runtime — every `shadow-*` class is a static literal (`shadow-sm` on cards and the trade-list search box, `shadow-lg` on the FAB, `shadow-none` on buttons/segments). This is a hard rule (nativewind css-interop 0.2.6 limitation with runtime class toggling); color classes may still switch at runtime.
- **Touch targets:** `Button` (`py-4`, ≈56px) and `Fab` (64px) exceed the 48dp guideline; the compact `Chip`/`Segmented` controls used in dense filter rows are deliberately smaller.

### Add Trade — reference parity
A full-screen routed form (`app/add-trade.tsx`); in edit mode it pre-fills from the existing trade. Fields, top to bottom:
- **Instrument type:** asset-class chips — `equity | fno | crypto | forex | gold | currency`; selecting F&O auto-switches price mode to cents.
- **Symbol** (uppercased), **price mode** (standard / cents), **trade style** (`intraday | positional | swing | investment`), **direction** (long / short), **status** (open / closed).
- **Partial fills:** entry fills (plus exit fills when closed), each row price + quantity + note, with live average price and total size summary and add/remove rows.
- **Stop loss / take profit; strategy** picker (sheet) with per-rule checklist; **emotion**; **mistakes/tags**; **entry/exit conditions**; **entry/exit notes**; **entry date & time**; **fees**; **screenshots** (cap 6, picked from the library and persisted).

## 4. Data & Components
- **Partial-fill data model:** fills live in `trade_fills` (side `entry|exit`, price, quantity, note, occurred_at, sort_order). The trade row stores the *derived* average entry/exit price and total size, computed from fills via `averageFillPrice` / `totalQuantity` (`src/lib/aggregateFills.ts`).
- **Trade associations:** strategy + per-rule checklist (`trade_rule_checks`), emotion, tags (`trade_tags`), screenshots (`trade_screenshots`).
- **P&L is always computed, never stored:** `computeTradePnl` (`src/stats/computeStats.ts`) derives per-trade gross P&L from direction, price mode (standard/cents), contract size and fees; `computeStats` derives today/week/month P&L, win rate, profit factor, expectancy and streak. The DB has no P&L columns.
- **Trade List** (`app/(tabs)/trades.tsx`): symbol search plus three chip filter rows (status + direction, asset class, trade style); rows use the shared `TradeRow`; distinct empty states for no trades vs. no filter matches.
- **Trade Detail** (`app/trade/[id].tsx`): hero (symbol, class/style chips, P&L or "Open", direction/status pills); fills with per-side averages; plan (stop loss / take profit / conditions / dates); strategy rules checklist; emotion dot; mistake tags; entry/exit notes; screenshot strip; Edit (`/add-trade?id=`) and Delete (confirm alert).
- **Dashboard** (`app/(tabs)/index.tsx`): greeting + title, hero period P&L with a today/week/month `Segmented` and decorative sparkline, weekly-goal progress bar, win-rate / trades / profit-factor stat cards, recent-trades list.

## 5. Storage
- **SQLite** via expo-sqlite (`pnl.db`), schema initialized in `src/db/database.ts` (`initializeDatabase`); `trade_fills`, `trade_rule_checks`, `trade_tags`, `trade_screenshots` reference `trades` with `ON DELETE CASCADE`.
- **Screenshots** are copied out of the picker cache into `Paths.document/screenshots` using the SDK 57 object-based `File` / `Directory` API; only the persisted URIs are stored in SQLite (`trade_screenshots.file_path`).

## 6. Scope & Deferred
- **In scope (Core-4):** Dashboard, Trade List, Add Trade, Trade Detail — the screens redesigned in this upgrade.
- **Explicitly deferred:** dark mode (app is locked to the light theme); the rest of the unchecked README feature checklist (calendar views, exports, per-strategy stats, calculators, widgets, etc.); the expo SDK minor upgrade; the README theme-line/encoding fix.
