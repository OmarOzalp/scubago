import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ProblemPanel } from '@/components/error-screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Space } from '@/constants/theme';
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
      <ProblemPanel
        icon={busy ? 'logbook' : 'warning'}
        title={busy ? 'ScubaGo is open in another tab' : 'Your log couldn’t be opened'}
        message={
          busy
            ? 'Your log can only be open in one tab at a time, which keeps it safe. Close the other tab, then try again here.'
            : `Nothing has been lost, but the app couldn’t read it just now (${problem}). Try again, or restart the app.`
        }>
        <Button title={trying ? 'Trying…' : 'Try again'} icon="sync" onPress={retry} disabled={trying} style={styles.button} />
        {busy && Platform.OS === 'web' ? (
          <ThemedText type="footnote" themeColor="textSecondary" style={styles.center}>
            Or reload this page once the other tab is closed.
          </ThemedText>
        ) : null}
      </ProblemPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.s6,
    zIndex: 10,
  },
  button: {
    alignSelf: 'stretch',
    marginTop: Space.s2,
  },
  center: {
    textAlign: 'center',
  },
});
