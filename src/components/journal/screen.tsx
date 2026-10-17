import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing, TabBarOverhang } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A page of the journal: paper background, a centred column on wide screens, and room at the
 * bottom for the raised "Log dive" button. Tab screens draw under the status bar, so they pad for
 * it (`tab`); screens with a header don't need to.
 */
export function Screen({
  children,
  tab = false,
  contentStyle,
  ...scroll
}: Omit<ScrollViewProps, 'contentContainerStyle' | 'children'> & {
  children: ReactNode;
  tab?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      {...scroll}
      style={[{ flex: 1, backgroundColor: theme.background }, scroll.style]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: tab ? insets.top + Spacing.four : Spacing.three,
          paddingBottom: tab ? TabBarOverhang + Spacing.four : insets.bottom + Spacing.five,
        },
        contentStyle,
      ]}>
      {children}
    </ScrollView>
  );
}

/** A screen's title block: a typewriter eyebrow over a serif title, with room for a button. */
export function ScreenHeader({ eyebrow, title, accessory }: { eyebrow?: string; title: string; accessory?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.titles}>
        {eyebrow ? <ThemedText type="label">{eyebrow}</ThemedText> : null}
        <ThemedText type="display" accessibilityRole="header">
          {title}
        </ThemedText>
      </View>
      {accessory}
    </View>
  );
}

/** A section's title, with an optional link or count on the right. */
export function SectionHeader({ title, eyebrow, accessory }: { title: string; eyebrow?: string; accessory?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.titles}>
        {eyebrow ? <ThemedText type="label">{eyebrow}</ThemedText> : null}
        <ThemedText type="heading" accessibilityRole="header">
          {title}
        </ThemedText>
      </View>
      {accessory}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: -6,
  },
});
