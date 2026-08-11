import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, SplashScreen } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { useFonts, Roboto_400Regular, Roboto_500Medium, Roboto_700Bold, Roboto_900Black } from '@expo-google-fonts/roboto';
import { initializeDatabase } from '../src/db/database';
import { SettingsProvider } from '../src/hooks/SettingsContext';
import '../global.css';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
    Roboto_900Black,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SQLiteProvider databaseName="pnl.db" onInit={initializeDatabase}>
      <SettingsProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#12162B' },
            headerTintColor: '#00E68A',
            headerTitleStyle: { fontFamily: 'Roboto_700Bold', color: '#F0F2F5' },
            contentStyle: { backgroundColor: '#0A0E1A' },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="add-trade"
            options={{ title: 'Add Trade' }}
          />
          <Stack.Screen
            name="trade/[id]"
            options={{ title: 'Trade Detail' }}
          />
          <Stack.Screen
            name="strategy/[id]"
            options={{ title: 'Strategy' }}
          />
        </Stack>
      </SettingsProvider>
    </SQLiteProvider>
  );
}