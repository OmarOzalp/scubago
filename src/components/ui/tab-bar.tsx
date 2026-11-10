import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { usePressScale } from '@/components/ui/press';
import { Elevation, OnFill, Size, Space, TabBarHeight, TypeScale } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

const TAB_ICONS: Record<string, IconName> = {
  index: 'home',
  map: 'map',
  logbook: 'logbook',
  'field-guide': 'fieldGuide',
};

/** The coral "Log" button sits in the middle of the bar, after this tab. */
const LOG_AFTER = 'map';
/** The tab the bar has no button for: the island explorer (src/app/(tabs)/explore.tsx), which stays mounted when it is closed. */
const HIDDEN_TAB = 'explore';

/**
 * The tab bar: a white bar with a hairline on top, four tabs (24 icons, 13 labels; the current one in tint
 * with a filled icon) and the raised coral Log circle in the middle.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const theme = useTheme();
  // The island explorer is a tab with no button of its own, and draws over the whole screen: no bar over it.
  if (state.routes[state.index]?.name === HIDDEN_TAB) return null;
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { backgroundColor: theme.backgroundElement, borderTopColor: theme.rule, paddingBottom: Math.max(insets.bottom, 6), minHeight: TabBarHeight + insets.bottom },
      ]}>
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          if (route.name === HIDDEN_TAB) return null;
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label = options.title ?? route.name;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          const onLongPress = () => emitter.emit({ type: 'tabLongPress', target: route.key });
          return [
            <Tab
              key={route.key}
              label={label}
              icon={TAB_ICONS[route.name] ?? 'list'}
              focused={focused}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
            />,
            route.name === LOG_AFTER ? <LogDiveButton key="log-dive" /> : null,
          ];
        })}
      </View>
    </View>
  );
}

function Tab({
  label,
  icon,
  focused,
  accessibilityLabel,
  testID,
  onPress,
  onLongPress,
}: {
  label: string;
  icon: IconName;
  focused: boolean;
  accessibilityLabel?: string;
  testID?: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const colour = focused ? theme.tint : theme.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      aria-selected={focused}
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.iconSlot}>
        <Icon name={icon} size={Size.iconBar} color={colour} weight={focused ? 'fill' : 'regular'} />
      </View>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.label, { color: colour }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function LogDiveButton() {
  const theme = useTheme();
  const scheme = useSchemeName();
  const scale = usePressScale();
  return (
    <Pressable
      onPress={() => router.push('/log/new')}
      accessibilityRole="button"
      accessibilityLabel="Log a dive"
      style={({ pressed }) => [styles.tab, styles.logTab, scale(pressed)]}>
      <View style={[styles.logCircle, { backgroundColor: theme.coral, borderColor: theme.backgroundElement, boxShadow: Elevation[scheme].raised }]}>
        <Icon name="plus" size={26} color={OnFill[scheme].coral} weight="bold" />
      </View>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.label, { color: theme.textSecondary }]}>
        Log
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.s2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: Space.s1,
  },
  tab: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    gap: 4,
  },
  iconSlot: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...TypeScale.footnoteStrong,
    lineHeight: 16,
  },
  // The circle (56) rises 28 above the icons (28), so all five labels line up; it stands 20 above the bar
  // (less than TabBarOverhang, the room tab screens leave under their content).
  logTab: {
    marginTop: -(Size.tabBarLog - 28),
  },
  logCircle: {
    width: Size.tabBarLog,
    height: Size.tabBarLog,
    borderRadius: Size.tabBarLog / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
