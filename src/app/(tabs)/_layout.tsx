import { Tabs } from 'expo-router/js-tabs';

import { JournalTabBar } from '@/components/journal/tab-bar';

// One tab bar, drawn by the app, on iOS, Android and the web: four tabs and the coral "Log dive"
// button in the middle (see JournalTabBar).
export default function TabLayout() {
  return (
    <Tabs tabBar={(props) => <JournalTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="map" options={{ title: 'Explore' }} />
      <Tabs.Screen name="logbook" options={{ title: 'Logbook' }} />
      <Tabs.Screen name="field-guide" options={{ title: 'Field guide' }} />
      {/* The island explorer: a tab the bar draws no button for, and no bar over it (see JournalTabBar). It fades in over the screen it was opened from,
          and fades out as it closes (a little slower than a tab's default, as the full-screen fade it replaces was); closed, it stays mounted (explore.tsx). */}
      <Tabs.Screen name="explore" options={{ title: 'Explore your ocean', animation: 'fade', transitionSpec: { animation: 'timing', config: { duration: 300 } } }} />
    </Tabs>
  );
}
