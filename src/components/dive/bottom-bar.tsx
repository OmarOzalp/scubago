import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The strip pinned to the bottom of a screen with its main action: "Next" on the species step,
 * "Save dive" on the details, "Done" once saved. It is a surface like the tab bar (white, a hairline
 * above), below the scrolling part and not over it, so nothing scrolls out of reach behind it, and it
 * keeps clear of the home indicator.
 */
export function BottomBar({
  children,
  maxWidth = MaxContentWidth,
  keyboardOpen = false,
}: {
  children: ReactNode;
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
        { backgroundColor: theme.backgroundElement, borderTopColor: theme.rule, paddingBottom: Math.max(keyboardOpen ? 0 : insets.bottom, Space.s3) },
      ]}>
      <View style={[styles.column, { maxWidth }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: Space.s4, paddingTop: Space.s3, borderTopWidth: StyleSheet.hairlineWidth },
  column: { width: '100%', alignSelf: 'center', gap: Space.s2 },
});
