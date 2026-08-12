# Strategy Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the strategy card to a trade-card style (name/description/win-rate left, P&L right), slim the detail Performance section to six stats with a dashboard-style win-rate doughnut, and remove the detail-screen archive button.

**Architecture:** Extract the dashboard's inline `BigDonut` into a shared `src/ui/WinRateDonut` component (size-parameterized) so both the dashboard and strategy detail render the same doughnut. Two screen files are reworked: `app/(tabs)/strategies.tsx` (card) and `app/strategy/[id].tsx` (Performance section + button removal). No logic, DB, or hook changes — pure presentation.

**Tech Stack:** React Native / Expo Router, NativeWind (Tailwind class strings), react-native-svg, react-native-reanimated, TypeScript strict.

## Global Constraints

- **Static-shadow invariant:** `shadow-*` classes are always static literals and never toggled at runtime.
- **Design tokens:** `dark-card` `#12162B`, `dark-text` `#F0F2F5`, `dark-text-secondary` `#A8AEC1`, `dark-text-muted` `#757B8E`, `dark-border` `#1F2437`, `dark-bg` `#0A0E1A`. Win P&L color `#00E68A`, loss `#FF4D6A`.
- **P&L display:** `formatPnl(value, displayUnit)` is sign-agnostic (returns absolute value) — screens add the `+`/`−` sign and color manually.
- **No copy-paste:** the doughnut appears in two screens, so it must be a shared component, not duplicated.
- **Keep archive functionality:** only the UI button is removed. `archiveStrategy`/`archiveRule`/`confirmArchiveStrategy`-adjacent DB and hook code stay untouched.
- Numeric displays use `fontVariant: ['tabular-nums']`.
- Run `pnpm test` and `pnpm typecheck` before each commit.

---

### Task 1: Extract shared `WinRateDonut` component

**Files:**
- Create: `src/ui/WinRateDonut.tsx`
- Modify: `src/ui/index.ts`
- Modify: `app/(tabs)/index.tsx` (lines 549–607: delete inline `BigDonut`; line 24: import it from the UI kit)

**Interfaces:**
- Consumes: nothing from other tasks. `react-native-svg` (`Svg`, `Circle as SvgCircle`, `G`), `react-native` (`View`, `Text`).
- Produces:
  ```ts
  WinRateDonut({ winRate: number; wins: number; losses: number; size?: number })
  ```
  Renders the doughnut (track `#1e1e28`, win arc `#00E68A`, loss arc `#FF4D6A`, `strokeLinecap="butt"`, centered `Win Rate` label + `{winRate.toFixed(0)}%`, legend `{wins} Wins` / `{losses} Losses` below). `size` defaults to `220` and scales the square container; the `viewBox` stays `0 0 100 100` so arcs/stroke scale proportionally.

- [ ] **Step 1: Create the component**

Create `src/ui/WinRateDonut.tsx`:

```tsx
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle as SvgCircle, G } from 'react-native-svg';

export function WinRateDonut({
  winRate,
  wins,
  losses,
  size = 220,
}: {
  winRate: number;
  wins: number;
  losses: number;
  size?: number;
}) {
  const CX = 50, CY = 50, R = 40;
  const strokeW = 12;
  const circumference = 2 * Math.PI * R;
  const winLength = (winRate / 100) * circumference;
  const lossLength = circumference - winLength;

  return (
    <View className="items-center justify-center w-full">
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <G rotation="-90" origin="50, 50">
            <SvgCircle cx={CX} cy={CY} r={R} stroke="#1e1e28" strokeWidth={strokeW} fill="transparent" />
            <SvgCircle
              cx={CX} cy={CY} r={R}
              stroke="#FF4D6A"
              strokeWidth={strokeW}
              fill="transparent"
              strokeDasharray={`${lossLength} ${circumference}`}
              strokeDashoffset={-winLength}
              strokeLinecap="butt"
            />
            <SvgCircle
              cx={CX} cy={CY} r={R}
              stroke="#00E68A"
              strokeWidth={strokeW}
              fill="transparent"
              strokeDasharray={`${winLength} ${circumference}`}
              strokeLinecap="butt"
            />
          </G>
        </Svg>

        <View className="absolute items-center justify-center" pointerEvents="none">
          <Text className="text-[9px] uppercase tracking-widest font-bold mb-1" style={{ color: '#6b6880' }}>Win Rate</Text>
          <Text className="text-3xl font-black text-white">{winRate.toFixed(0)}%</Text>
        </View>
      </View>

      <View className="flex-row items-center justify-center mt-2 gap-x-8">
        <View className="flex-row items-center gap-x-2">
          <View className="w-3 h-3 rounded-full bg-[#00E68A]" />
          <Text className="text-xs font-bold text-white tracking-wide">{wins} Wins</Text>
        </View>
        <View className="flex-row items-center gap-x-2">
          <View className="w-3 h-3 rounded-full bg-[#FF4D6A]" />
          <Text className="text-xs font-bold text-white tracking-wide">{losses} Losses</Text>
        </View>
      </View>
    </View>
  );
}
```

Note: the center label uses a fixed `text-3xl` — for the 150px detail usage this is slightly large but acceptable per the approved design ("identical visual language, smaller size"). Do not scale font sizes.

- [ ] **Step 2: Export it**

In `src/ui/index.ts`, add after the `StrategyFormSheet` export:

```ts
export { WinRateDonut } from './WinRateDonut';
```

- [ ] **Step 3: Point the dashboard at the shared component**

In `app/(tabs)/index.tsx`:
- Delete the inline `BigDonut` component (lines 549–607, from the `// ─── Big Donut for Win Rate ───` comment through the closing brace before `// ─── Dashboard Screen ───`).
- In the `react-native-svg` import, remove `G` (it is only used inside `BigDonut`) but **keep** `Circle as SvgCircle` — it is also used at line 456 in the equity curve chart.
- Add `WinRateDonut` to the UI-kit import at line 24: `import { Card, EmptyState, Fab, PnlText, SectionHeader, Segmented, TradeRow, WinRateDonut } from '../../src/ui';`
- Replace the `<BigDonut winRate={stats.winRate} wins={stats.wins} losses={stats.losses} />` call (line 867) with `<WinRateDonut winRate={stats.winRate} wins={stats.wins} losses={stats.losses} />`.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: clean.

Run: `pnpm test`
Expected: PASS (52).

- [ ] **Step 5: Commit**

```bash
git add src/ui/WinRateDonut.tsx src/ui/index.ts "app/(tabs)/index.tsx"
git commit -m "refactor: extract shared WinRateDonut component"
```

---

### Task 2: Redesign the strategy card

**Files:**
- Modify: `app/(tabs)/strategies.tsx`

**Interfaces:**
- Consumes: `useStrategies()` → `{ strategies, statsByStrategy, loading, addStrategy }` (existing), `useAccountSetting()` → `displayUnit`, `formatPnl` (existing), `StrategyStats` shape via `statsByStrategy[s.id]` → `{ totalTrades, winRate, netPnl }` (existing).
- Produces: the card renders **only** name + description + win rate (left) and net P&L (right). Navigation to `/strategy/{id}` unchanged.

- [ ] **Step 1: Update imports**

In `app/(tabs)/strategies.tsx`, change the react-native import from:

```tsx
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
```

to:

```tsx
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Pressable } from 'react-native';
```

- [ ] **Step 2: Replace the card body**

Replace the entire `strategies.map((s, i) => { ... })` render block (from `strategies.map((s, i) => {` through its closing `);`) with:

```tsx
strategies.map((s, i) => {
  const st = statsByStrategy[s.id];
  return (
    <Animated.View key={s.id} entering={FadeInDown.duration(400).delay(Math.min(i * 60, 600)).springify().damping(18)}>
      <Pressable
        onPress={() => router.push(`/strategy/${s.id}`)}
        className="mb-3 bg-dark-card rounded-2xl border border-dark-border p-4"
        style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text className="font-bold text-base text-white tracking-wide">{s.name}</Text>
            {s.description ? (
              <Text className="text-xs text-dark-text-muted mt-0.5" numberOfLines={1}>{s.description}</Text>
            ) : null}
            <Text className="text-xs text-dark-text-secondary mt-1.5" style={{ fontVariant: ['tabular-nums'] }}>
              {st.totalTrades > 0 ? `${st.winRate.toFixed(0)}% win rate` : '—'}
            </Text>
          </View>
          <Text
            className="text-base font-black tracking-wide"
            style={{ color: st.netPnl >= 0 ? '#00E68A' : '#FF4D6A', fontVariant: ['tabular-nums'] }}
          >
            {(st.netPnl >= 0 ? '+' : '−')}{formatPnl(st.netPnl, displayUnit)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
})
```

This removes the bulb icon chip, the "Closed" column, the three-column stats row, and the chevron.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/strategies.tsx"
git commit -m "feat: strategy card in trade-row style"
```

---

### Task 3: Detail Performance section + remove archive button

**Files:**
- Modify: `app/strategy/[id].tsx`

**Interfaces:**
- Consumes: `useStrategyDetail(strategyId)` → `{ strategy, stats, rules, recentTrades, loading, error, refetch }` (existing), `useStrategies()` → `{ addRule, updateRule, archiveRule, updateStrategy }` (existing — drop `archiveStrategy` from the destructure), `useAccountSetting()` → `{ accountType, displayUnit }`, `WinRateDonut` (Task 1), `StatCell` (local), `fmtSigned` (local).
- Produces: Performance card shows the doughnut + exactly six stats; no archive button anywhere on the screen.

- [ ] **Step 1: Add the doughnut import**

In `app/strategy/[id].tsx`, add `WinRateDonut` to the UI-kit import:

```tsx
import {
  Button, Card, SectionHeader, TradeRow, EmptyState, StrategyFormSheet, TextInputField, Sheet, WinRateDonut,
} from '../../src/ui';
```

- [ ] **Step 2: Remove archiveStrategy from the destructure**

Change:

```tsx
const { addRule, updateRule, archiveRule, updateStrategy, archiveStrategy } = useStrategies();
```

to:

```tsx
const { addRule, updateRule, archiveRule, updateStrategy } = useStrategies();
```

- [ ] **Step 3: Delete the archive handler**

Delete the entire `confirmArchiveStrategy` function:

```tsx
const confirmArchiveStrategy = () => {
  Alert.alert('Archive Strategy', `Archive "${strategy.name}"? It stays on historical trades.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Archive', style: 'destructive', onPress: async () => { await archiveStrategy(strategy.id); router.back(); } },
  ]);
};
```

- [ ] **Step 4: Replace the Performance card contents**

Replace the `<SectionHeader title="Performance" />` + stats grid block (from `<SectionHeader title="Performance" />` through the closing `</View>` of the flex-wrap grid) with:

```tsx
            <SectionHeader title="Performance" />
            <View className="items-center mt-2 mb-4">
              <WinRateDonut winRate={stats.winRate} wins={stats.wins} losses={stats.losses} size={150} />
            </View>
            <View className="flex-row flex-wrap gap-3">
              <View className="flex-1 min-w-[45%]"><StatCell label="Net P&L" value={fmtSigned(stats.netPnl, displayUnit)} tone={stats.netPnl >= 0 ? 'good' : 'bad'} /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Trades" value={String(stats.totalTrades)} /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Avg Win" value={fmtSigned(stats.avgWin, displayUnit)} /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Avg Loss" value={fmtSigned(stats.avgLoss, displayUnit)} tone="bad" /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Best Trade" value={fmtSigned(stats.bestTrade, displayUnit)} tone="good" /></View>
              <View className="flex-1 min-w-[45%]"><StatCell label="Worst Trade" value={fmtSigned(stats.worstTrade, displayUnit)} tone="bad" /></View>
            </View>
```

This removes Profit Factor, Expectancy, Streak, and the "Closed Trades" cell, and the `pf` variable becomes unused.

- [ ] **Step 5: Delete the now-unused `pf` variable**

Delete:

```tsx
const pf = stats.profitFactor == null ? '∞' : stats.profitFactor.toFixed(2);
```

- [ ] **Step 6: Delete the archive button**

Delete the archive button line at the bottom of the ScrollView:

```tsx
<Button title="Archive Strategy" variant="danger" onPress={confirmArchiveStrategy} />
```

- [ ] **Step 7: Verify**

Run: `pnpm typecheck`
Expected: clean (if `Alert` import is now unused because `confirmArchiveStrategy` was its only consumer, remove `Alert` from the react-native import in this file).

Run: `pnpm test`
Expected: PASS (52).

- [ ] **Step 8: Commit**

```bash
git add "app/strategy/[id].tsx"
git commit -m "feat: slim strategy performance section and remove archive button"
```

---

### Task 4: Full verification and smoke checklist

**Files:** none (verification only).

- [ ] **Step 1: Full suite + typecheck**

Run: `pnpm test`
Expected: PASS (52 tests).

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 2: Stale-reference scan**

Run (expect no matches):
- `grep -rn "BigDonut" app src`
- `grep -rn "Archive Strategy" app src`
- `grep -rn "Profit Factor" app/strategy` and `grep -rn "Expectancy" app/strategy` (should only match nothing; the stat labels are removed)

- [ ] **Step 3: Working tree check**

Run: `git status --short`
Expected: clean (every task committed).

- [ ] **Step 4: Manual smoke on device (documented for the user, not automatable)**

Run: `npx expo start`
- Strategies tab: each card shows only name, description (if any), win rate (`55% win rate` or `—`), and right-aligned signed P&L. Tap navigates to detail.
- Strategy detail: Performance card shows the 150px doughnut (green/red arcs, `Win Rate` + `%`, `X Wins · Y Losses`) on top, then exactly Net P&L / Trades / Avg Win / Avg Loss / Best Trade / Worst Trade.
- Dashboard: win-rate doughnut renders identically to before the refactor (220px).
- No "Archive Strategy" button on the strategy detail screen.
- Rules section and Recent Trades unchanged; add-trade flows unchanged.

- [ ] **Step 5: Final commit**

Nothing to commit unless the smoke test surfaced a fix. If it did, commit the fix scoped on its own.

---

## Notes for the implementer

- **Reading tasks out of order is safe:** each task lists its own exact code. Cross-task names are pinned in each task's **Interfaces** block.
- **`WinRateDonut` is size-parameterized** via `size` (default 220); the SVG `viewBox` is constant so strokes scale proportionally. Do not adjust font sizes per size.
- **Archive functionality is preserved on purpose** — the spec requires removing only the button. Do not touch `archiveStrategy`/`archiveRule` in `src/hooks/useStrategies.ts` or `src/db/database.ts`.
- **No logic changes:** `app/(tabs)/strategies.tsx` and `app/strategy/[id].tsx` are presentation-only edits.
- `statistics` names come from `StrategyStats` (Task 1 of the strategy-feature plan): `totalTrades`, `wins`, `losses`, `winRate`, `netPnl`, `avgWin`, `avgLoss`, `bestTrade`, `worstTrade`.
