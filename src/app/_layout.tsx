import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useAppStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="log/new"
          options={{ presentation: 'modal', title: 'Log a sighting' }}
        />
        <Stack.Screen
          name="add-site"
          options={{ presentation: 'modal', title: 'Add a dive site' }}
        />
        <Stack.Screen name="auth" options={{ presentation: 'modal', title: 'Account' }} />
        <Stack.Screen name="site/[id]" options={{ title: '' }} />
        <Stack.Screen name="species/[id]" options={{ title: '' }} />
      </Stack>
    </ThemeProvider>
  );
}
