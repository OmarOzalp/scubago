import { CourierPrime_700Bold } from '@expo-google-fonts/courier-prime/700Bold';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { Fraunces_500Medium_Italic } from '@expo-google-fonts/fraunces/500Medium_Italic';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { StorageProblem } from '@/components/storage-problem';
import { Colors, Type } from '@/constants/theme';
import { useSchemeName } from '@/hooks/use-theme';
import { useAppStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

/** Each weight registers as its own family (see Type in constants/theme). */
const FONTS = {
  Fraunces_500Medium,
  Fraunces_500Medium_Italic,
  Fraunces_600SemiBold,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  CourierPrime_700Bold,
};

export default function RootLayout() {
  // The hydration-safe scheme: on the web the page is pre-rendered light, then switches once loaded.
  const scheme = useSchemeName();
  const colors = Colors[scheme];
  const init = useAppStore((s) => s.init);
  // If a font can't load, the app carries on in the system faces rather than waiting forever.
  const [fontsLoaded, fontError] = useFonts(FONTS);

  useEffect(() => {
    init();
  }, [init]);

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.rule,
      primary: colors.tint,
    },
  };

  // Native waits behind the splash screen. The web build renders at once (its pages are
  // pre-rendered as static HTML) and the faces swap in as they arrive.
  if (!fontsLoaded && !fontError && Platform.OS !== 'web') return null;

  return (
    <ThemeProvider value={navTheme}>
      <AnimatedSplashOverlay />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: Type.display, fontSize: 19, color: colors.text },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="log/new" options={{ presentation: 'modal', title: 'Log a dive' }} />
        <Stack.Screen name="add-site" options={{ presentation: 'modal', title: 'Add a dive site' }} />
        <Stack.Screen name="auth" options={{ presentation: 'modal', title: 'Account' }} />
        <Stack.Screen name="inspect" options={{ presentation: 'modal', title: 'A closer look' }} />
        <Stack.Screen name="explore" options={{ presentation: 'fullScreenModal', animation: 'fade', headerShown: false, title: 'Explore your ocean' }} />
        <Stack.Screen name="verify" options={{ presentation: 'modal', title: 'Buddy code' }} />
        <Stack.Screen name="dive/edit" options={{ presentation: 'modal', title: 'Edit page' }} />
        <Stack.Screen name="dive/sign" options={{ presentation: 'modal', title: 'Sign the page' }} />
        <Stack.Screen name="dive/count" options={{ presentation: 'modal', title: 'Dives before ScubaGo' }} />
        <Stack.Screen name="dive/[id]" options={{ title: '' }} />
        <Stack.Screen name="site/[id]" options={{ title: '' }} />
        <Stack.Screen name="species/[id]" options={{ title: '' }} />
        <Stack.Screen name="sighting/[id]" options={{ title: '' }} />
        <Stack.Screen name="credits" options={{ title: 'Data & credits', headerTitle: '' }} />
        <Stack.Screen name="rewards/index" options={{ title: '' }} />
        <Stack.Screen name="rewards/passport" options={{ title: '' }} />
        <Stack.Screen name="rewards/islands" options={{ title: '' }} />
        <Stack.Screen name="rewards/[badge]" options={{ title: '' }} />
        <Stack.Screen name="rewards/collections/[id]" options={{ title: '' }} />
      </Stack>
      <StorageProblem />
    </ThemeProvider>
  );
}
