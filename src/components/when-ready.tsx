import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/lib/store';

/**
 * Shows its children once the log has loaded. A form that starts from what's in the log (the next
 * dive number, the page being edited) waits behind it, so a link or a reload straight to it doesn't
 * start the form from an empty log.
 */
export function WhenReady({ children }: { children: ReactNode }) {
  const ready = useAppStore((s) => s.ready);
  const theme = useTheme();
  if (!ready) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.tint} accessibilityLabel="Opening your log" />
      </ThemedView>
    );
  }
  return children;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
