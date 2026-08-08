import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { initializeDatabase } from '../src/db/database';
import '../global.css';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="pnl.db" onInit={initializeDatabase}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="add-trade"
          options={{
            title: 'Add Trade',
            headerStyle: { backgroundColor: '#fff' },
            headerTintColor: '#059669',
            headerTitleStyle: { fontWeight: '700' },
          }}
        />
        <Stack.Screen
          name="trade/[id]"
          options={{
            title: 'Trade Detail',
            headerStyle: { backgroundColor: '#fff' },
            headerTintColor: '#059669',
            headerTitleStyle: { fontWeight: '700' },
          }}
        />
      </Stack>
    </SQLiteProvider>
  );
}