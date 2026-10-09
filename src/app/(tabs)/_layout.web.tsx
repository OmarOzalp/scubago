import { Tabs } from 'expo-router/js-tabs';
import { useColorScheme, type ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors } from '@/constants/theme';

// Native tabs render as a floating pill at the top of the page on web, which
// covers each screen's title. The web build (the home-screen web app) uses a
// plain bottom tab bar instead; iOS and Android keep `_layout.tsx`.

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14',
  book: 'M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5zm0 15A1.5 1.5 0 0 0 5.5 21H20v-3',
};

function TabIcon({ shape, color, size }: { shape: keyof typeof ICONS; color: ColorValue; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={ICONS[shape]}
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function TabLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.backgroundSelected,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Home',
          tabBarIcon: ({ color, size }) => <TabIcon shape="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => <TabIcon shape="map" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="logbook"
        options={{
          title: 'My Log',
          tabBarIcon: ({ color, size }) => <TabIcon shape="book" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
