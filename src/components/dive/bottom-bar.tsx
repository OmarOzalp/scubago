import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The strip pinned to the bottom of a screen with its main action: "Next" on the species step,
 * "Save dive No. 28" on the details, "Done" once saved. It sits below the scrolling part (not over
 * it), so nothing scrolls out of reach behind it, and it keeps clear of the home indicator.
 * `tone="twilight"` is for the dark page of the new-species moment.
 */
export function BottomBar({
  children,
  tone = 'page',
  maxWidth = 720,
  keyboardOpen = false,
}: {
  children: ReactNode;
  tone?: 'page' | 'twilight';
  /** The content column's width, as the screen above it has it. */
  maxWidth?: number;
  /** With the keyboard up there is no home indicator to clear. */
  keyboardOpen?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        tone === 'twilight'
          ? { backgroundColor: theme.twilight, borderTopColor: 'rgba(255, 255, 255, 0.14)' }
          : { backgroundColor: theme.background, borderTopColor: theme.rule },
        { paddingBottom: Math.max(keyboardOpen ? 0 : insets.bottom, Spacing.three) },
      ]}>
      <View style={[styles.column, { maxWidth }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, borderTopWidth: 1 },
  column: { width: '100%', alignSelf: 'center', gap: Spacing.two },
});
