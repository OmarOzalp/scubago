import { router, type ErrorBoundaryProps } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/ui/list';
import { Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The page shown when the app cannot draw itself (a failed screen, a log that cannot be opened): the page
 * colour, one centred column (an icon tile, a headline, a line of what it means), and its actions as
 * `children`. It does not depend on the app's navigator or safe-area provider, so it can stand when they
 * have failed.
 */
export function ProblemPanel({ icon, title, message, children }: { icon: IconName; title: string; message: string; children?: ReactNode }) {
  return (
    <View style={styles.panel}>
      <IconTile icon={icon} size={56} />
      <View style={styles.text}>
        <ThemedText type="title" accessibilityRole="header" style={styles.center}>
          {title}
        </ThemedText>
        <ThemedText type="callout" themeColor="textSecondary" style={styles.center} accessibilityLiveRegion="polite">
          {message}
        </ThemedText>
      </View>
      {children}
    </View>
  );
}

/**
 * What a screen shows when something in it fails while drawing, instead of a red screen or the app
 * closing: a calm page that says the log is safe, with "Try again" (and, inside the app's navigator,
 * a way home). The error's own words sit at the foot in small print, so it can be reported.
 *
 * `whole`: the app itself failed (the root layout), so there is no navigator to go home with.
 */
export function ErrorScreen({ error, retry, whole = false }: ErrorBoundaryProps & { whole?: boolean }) {
  const theme = useTheme();
  useEffect(() => {
    console.error(whole ? 'ScubaGo hit a problem it could not draw past' : 'A screen hit a problem it could not draw past', error);
  }, [error, whole]);
  const detail = (error?.message || String(error ?? '')).slice(0, 300);
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.page}>
      <ProblemPanel
        icon="warning"
        title={whole ? 'ScubaGo hit a snag' : 'This page hit a snag'}
        message={`Your log is safe: nothing has been lost. Try again${whole ? ', or close and reopen the app' : ', or head back to your home'}.`}>
        <View style={styles.actions}>
          <Button title="Try again" icon="sync" onPress={() => void retry()} />
          {whole ? null : <Button title="Back to my home" variant="secondary" icon="home" onPress={() => router.replace('/')} />}
        </View>
        {detail ? (
          <ThemedText type="footnote" themeColor="textSecondary" selectable style={styles.center}>
            {detail}
          </ThemedText>
        ) : null}
      </ProblemPanel>
    </ScrollView>
  );
}

/** For a route's `ErrorBoundary`: one screen failed, the navigator (and its back arrow) carries on. */
export function ScreenError(props: ErrorBoundaryProps) {
  return <ErrorScreen {...props} />;
}

/** For the root layout's `ErrorBoundary`: the app itself failed. */
export function AppError(props: ErrorBoundaryProps) {
  return <ErrorScreen {...props} whole />;
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.s6,
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: Space.s4,
  },
  text: {
    alignItems: 'center',
    gap: Space.s2,
  },
  actions: {
    alignSelf: 'stretch',
    gap: Space.s3,
    marginTop: Space.s2,
  },
  center: {
    textAlign: 'center',
  },
});
