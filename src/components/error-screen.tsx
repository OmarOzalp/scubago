import { router, type ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * What a screen shows when something in it fails while drawing, instead of a red screen or the app
 * closing: a calm card that says the log is safe, with "Try again" (and, inside the app's navigator,
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
      <Paper raised style={styles.card}>
        <View style={styles.art}>
          <Wash width={112} height={78} color={theme.wash} seed={17} style={StyleSheet.absoluteFill} />
          <Icon name="logbook" size={40} />
        </View>
        <ThemedText type="heading" accessibilityRole="header" style={styles.center}>
          {whole ? 'ScubaGo hit a snag' : 'This page hit a snag'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center} accessibilityLiveRegion="polite">
          Your log is safe: nothing has been lost. Try again{whole ? ', or close and reopen the app' : ', or head back to your home'}.
        </ThemedText>
        <OceanButton title="Try again" icon="sync" onPress={() => void retry()} style={styles.stretch} />
        {whole ? null : <OceanButton title="Back to my home" variant="secondary" icon="home" onPress={() => router.replace('/')} style={styles.stretch} />}
        {detail ? (
          <ThemedText type="caption" themeColor="textSecondary" selectable style={styles.center}>
            {detail}
          </ThemedText>
        ) : null}
      </Paper>
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
    padding: Spacing.four,
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
  stretch: {
    alignSelf: 'stretch',
  },
});
