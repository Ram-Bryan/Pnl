# Pnl Trading Journal - App Design & Architecture Spec

## 1. Overview
The Pnl Trading Journal is an offline-first mobile application designed for traders. Based on the choice of **Option A (Light Theme)**, the UI will feature a crisp, typography-driven layout that emphasizes readability, visual hierarchy, and actionable data at a glance.

## 2. Tech Stack & UX Principles
- **Core Stack:** React Native (Expo), TypeScript, NativeWind (Tailwind CSS), SQLite (local data processing).
- **Mobile Ergonomics:** The "Thumb Zone" is strictly enforced. The top 60% of most screens will contain read-only summaries and scrollable lists, while primary actions (like creating a trade) are anchored near the bottom nav bar.
- **Offline By Default:** Everything executes locally to prevent lag and secure user data.

## 3. UI/UX Hierarchy & Typography

### Typography System
Using strong, legible sans-serif fonts (e.g. `Roboto` / `Inter`) focused on financial clarity.
- **Hero Numbers (H1):** `40px+`, `font-black`. Example: *Today's P&L ($500.00)*.
- **Section Headers (H2):** `20px`, `font-bold`. Example: *Recent Trades*, *Goals Progress*.
- **Body Text:** `14px-16px`, `font-medium`. Used for the actual log entries.
- **Labels (Micro-copy):** `12px`, `uppercase tracking-wide`, `text-slate-500`. Example: *ENTRY PRICE*, *FEE*.

### Color Palette (The Light Theme)
- **Backgrounds:** `bg-slate-50` (very soft off-white to reduce glare).
- **Cards/Surfaces:** `bg-white` with a small corner radius and very soft drop shadows to create a layered hierarchy without relying on heavy borders.
- **Win/Loss Semantic Colors:** 
  - *Winning Trades/Profits:* `text-emerald-600` on subtle `bg-emerald-50` pills.
  - *Losing Trades/Drawdowns:* `text-rose-500` on subtle `bg-rose-50` pills.
- **Primary Accents:** A bold brand color (e.g., deep pine green or slate blue) used sparingly for the bottom bar and FABs.

## 4. Components & Interactive Elements
- **Layout Margins:** Generous safe-area padding (`p-4` or `p-5`) will be respected everywhere, stopping text from hitting the bezels.
- **Cards:** Used to group related stats. Whitespace separates properties.
- **Touch Targets:** No button or interactive row will ever be smaller than `48dp` tall (Android Material 3 standards), ensuring easy one-handed tapping.
- **Add Trade Flow:** Opens inside a Bottom Sheet or a layered modal, giving the psychological effect of "inserting" a record rather than navigating completely away from the dashboard context.

## 5. Security & Storage Boundaries
- The app operates completely offline. SQLite performs SQL queries locally.
- Trade screenshots are persisted in the Expo FileSystem (`FileSystem.documentDirectory`) and mapped to SQLite rows by their URIs.

## 6. Implementation Phasing
Assuming the design passes review, the subsequent `Implementation Plan` will structure the build into independent milestones:
1. **Database & Models:** Scaffolding the SQLite tables and establishing queries.
2. **UI Framework:** Setting up React Navigation and NativeWind tokens (colors/fonts) matching this spec.
3. **Core CRUD:** The Add Trade bottom sheet and the interactive trade list.
4. **Analytics Layer:** Calculating P&L dynamically and rendering the Dashboard stats.
5. **Advanced Views:** Strategy management, Calendar views, Export tools.
