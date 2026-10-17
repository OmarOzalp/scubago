import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/lib/store';

/**
 * Covers the app when the log can't be opened, so nothing pretends the log is empty. On the web
 * that usually means ScubaGo is open in another tab; "Try again" opens it once that tab is closed.
 */
export function StorageProblem() {
  const theme = useTheme();
  const problem = useAppStore((s) => s.storageProblem);
  const init = useAppStore((s) => s.init);
  const [trying, setTrying] = useState(false);
  if (!problem) return null;
  const busy = problem === 'busy';
  const retry = async () => {
    setTrying(true);
    await init();
    setTrying(false);
  };
  return (
    <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: theme.background }]}>
      <Paper raised style={styles.card}>
        <View style={styles.art}>
          <Wash width={112} height={78} color={theme.wash} seed={11} style={StyleSheet.absoluteFill} />
          <Icon name={busy ? 'logbook' : 'warning'} size={40} />
        </View>
        <ThemedText type="heading" accessibilityRole="header" style={styles.center}>
          {busy ? 'ScubaGo is open in another tab' : 'Your log couldn’t be opened'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center} accessibilityLiveRegion="polite">
          {busy
            ? 'Your log can only be open in one tab at a time, which keeps it safe. Close the other tab, then try again here.'
            : `Nothing has been lost, but the app couldn’t read it just now (${problem}). Try again, or restart the app.`}
        </ThemedText>
        <OceanButton title={trying ? 'Trying…' : 'Try again'} icon="sync" onPress={retry} disabled={trying} style={styles.button} />
        {busy && Platform.OS === 'web' ? (
          <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
            Or reload this page once the other tab is closed.
          </ThemedText>
        ) : null}
      </Paper>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    zIndex: 10,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  art: {
    width: 112,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    textAlign: 'center',
  },
  button: {
    alignSelf: 'stretch',
  },
});
