import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Wash } from '@/components/journal/wash';
import { OnFill, Shadow, TabBarHeight, TabBarOverhang, Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { hashSeed } from '@/lib/wash';

const TAB_ICONS: Record<string, IconName> = {
  index: 'home',
  map: 'explore',
  logbook: 'logbook',
  'field-guide': 'fieldGuide',
};

/** The coral "Log dive" button sits in the middle of the bar, after this tab. */
const LOG_AFTER = 'map';

/**
 * The paper tab bar: four tabs with the coral "Log dive" button raised in the middle. The current
 * tab's icon sits on a watercolour wash.
 */
export function JournalTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { backgroundColor: theme.background, borderTopColor: theme.rule, paddingBottom: Math.max(insets.bottom, 6), minHeight: TabBarHeight + insets.bottom },
      ]}>
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label = options.title ?? route.name;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
          return [
            <Tab
              key={route.key}
              label={label}
              icon={TAB_ICONS[route.name] ?? 'list'}
              seed={hashSeed(route.name)}
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
  seed,
  focused,
  accessibilityLabel,
  testID,
  onPress,
  onLongPress,
}: {
  label: string;
  icon: IconName;
  seed: number;
  focused: boolean;
  accessibilityLabel?: string;
  testID?: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      aria-selected={focused}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.iconSlot}>
        {focused ? <Wash width={52} height={32} color={theme.wash} seed={seed} style={StyleSheet.absoluteFill} /> : null}
        <Icon name={icon} size={24} color={theme.text} weight={focused ? 'duotone' : 'regular'} wash={theme.lagoon} washOpacity={0.35} />
      </View>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={[styles.label, { fontFamily: focused ? Type.bodyHeavy : Type.bodyBold, color: focused ? theme.tint : theme.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function LogDiveButton() {
  const theme = useTheme();
  const scheme = useSchemeName();
  return (
    <Pressable
      onPress={() => router.push('/log/new')}
      accessibilityRole="button"
      accessibilityLabel="Log a dive"
      style={({ pressed }) => [styles.tab, styles.logTab, { transform: [{ translateY: pressed ? 2 : 0 }] }]}>
      <View style={[styles.logCircle, { backgroundColor: theme.coral, borderColor: theme.background, boxShadow: Shadow[scheme].coral }]}>
        <Icon name="plus" size={26} color={OnFill[scheme].coral} weight="bold" />
      </View>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.label, { fontFamily: Type.bodyHeavy, color: theme.text }]}>
        Log dive
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    paddingTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    gap: 2,
  },
  iconSlot: {
    width: 52,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
  },
  // The circle (56) stands TabBarOverhang above the icons (32), so all five labels line up.
  logTab: {
    marginTop: -TabBarOverhang,
  },
  logCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
