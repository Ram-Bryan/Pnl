# App Foundation & Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up React Navigation with a Bottom Tab Bar and build the static Dashboard (Option A Light Theme) with NativeWind styling.

**Architecture:** We will create a `src/navigation` directory for routing and a `src/screens` directory for UI. The `Dashboard` will use static dummy data to build out the "Thumb Zone" bottom-heavy UI and the typography-first layout.

**Tech Stack:** React Native (Expo), React Navigation, NativeWind, TypeScript.

---

### Task 1: Navigation Setup

**Files:**
- Create: `src/navigation/AppNavigator.tsx`
- Modify: `App.tsx:1-20` (approximate)

- [ ] **Step 1: Create the AppNavigator**

```tsx
// src/navigation/AppNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/navigation';
import { View, Text } from 'react-native';

const Tab = createBottomTabNavigator();

// Temporary placeholders until we build the real screens
const DashboardPlaceholder = () => <View className="flex-1 items-center justify-center bg-slate-50"><Text>Dashboard</Text></View>;
const TradesPlaceholder = () => <View className="flex-1 items-center justify-center bg-slate-50"><Text>Trades</Text></View>;

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: '#ffffff', borderTopWidth: 0, elevation: 10 },
          tabBarActiveTintColor: '#059669', // emerald-600
        }}
      >
        <Tab.Screen name="Dashboard" component={DashboardPlaceholder} />
        <Tab.Screen name="Trades" component={TradesPlaceholder} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
```

- [ ] **Step 2: Update App.tsx to load Navigation**

```tsx
// App.tsx
import React from 'react';
import { AppNavigator } from './src/navigation/AppNavigator';
import './global.css'; // NativeWind v4 requires global CSS

export default function App() {
  return (
    <AppNavigator />
  );
}
```

- [ ] **Step 3: Commit (if auto_commit enabled)**

Check `.agent/config.yml` for `auto_commit` setting.

If `auto_commit: true` (default when absent):
```bash
git add src/navigation/AppNavigator.tsx App.tsx
git commit -m "feat: setup react navigation with bottom tabs"
```
If `auto_commit: false`: skip commit and staging. Print: "Skipping commit (auto_commit: false)."

---

### Task 2: Build the Dashboard UI

**Files:**
- Create: `src/screens/Dashboard.tsx`
- Modify: `src/navigation/AppNavigator.tsx`

- [ ] **Step 1: Create the Dashboard Screen Component**

```tsx
// src/screens/Dashboard.tsx
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function Dashboard() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        
        {/* Header Section */}
        <View className="items-center mb-8">
          <Text className="text-gray-500 uppercase tracking-wide text-xs font-bold mb-1">Today's P&L</Text>
          <Text className="text-5xl font-black text-emerald-600">+$420.50</Text>
        </View>

        {/* Progress Section */}
        <View className="bg-white p-5 rounded-2xl mb-6 shadow-sm">
          <Text className="text-gray-800 font-bold text-lg mb-2">Weekly Goal</Text>
          <View className="h-3 bg-slate-100 rounded-full overflow-hidden flex-row">
            <View className="bg-emerald-500 w-3/4 h-full rounded-full" />
          </View>
          <Text className="text-gray-500 font-medium mt-2 text-sm">$750 / $1000</Text>
        </View>

        {/* Recent Trades Header */}
        <Text className="text-xl font-bold text-gray-800 mb-4">Recent Trades</Text>
        
        {/* Trade Card 1 */}
        <View className="bg-white p-4 rounded-xl mb-3 shadow-sm flex-row justify-between items-center">
          <View>
            <Text className="font-bold text-lg text-gray-900">AAPL</Text>
            <Text className="text-gray-500 text-sm">Long • 100 shares</Text>
          </View>
          <View className="items-end bg-emerald-50 px-3 py-1 rounded-full">
            <Text className="text-emerald-700 font-bold">+$120.00</Text>
          </View>
        </View>

      </ScrollView>

      {/* Floating Action Button */}
      <View className="absolute bottom-6 right-6">
        <TouchableOpacity 
          className="bg-emerald-600 w-16 h-16 rounded-full items-center justify-center shadow-lg"
          activeOpacity={0.8}
        >
          <Text className="text-white text-3xl font-bold mb-1">+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Mount Dashboard in AppNavigator**

```tsx
// src/navigation/AppNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/navigation';
import { View, Text } from 'react-native';
// Add this import:
import { Dashboard } from '../screens/Dashboard';

const Tab = createBottomTabNavigator();

// Remove DashboardPlaceholder

const TradesPlaceholder = () => <View className="flex-1 items-center justify-center bg-slate-50"><Text>Trades</Text></View>;

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: '#ffffff', borderTopWidth: 0, elevation: 10 },
          tabBarActiveTintColor: '#059669',
        }}
      >
        <Tab.Screen name="Dashboard" component={Dashboard} />
        <Tab.Screen name="Trades" component={TradesPlaceholder} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
```

- [ ] **Step 3: Commit (if auto_commit enabled)**

Check `.agent/config.yml` for `auto_commit` setting.

If `auto_commit: true` (default when absent):
```bash
git add src/screens/Dashboard.tsx src/navigation/AppNavigator.tsx
git commit -m "feat: build dashboard UI and integrate into navigation"
```
If `auto_commit: false`: skip commit and staging. Print: "Skipping commit (auto_commit: false)."
