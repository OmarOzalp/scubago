import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/** The first page of an empty log: blank, with the one way to write on it. */
export function BlankPage() {
  const theme = useTheme();
  return (
    <View style={styles.page}>
      <View style={styles.art}>
        <Wash width={120} height={84} color={theme.wash} seed={47} style={StyleSheet.absoluteFill} />
        <Icon name="logbook" size={44} />
      </View>
      <ThemedText type="heading" accessibilityRole="header" style={styles.center}>
        Your first page is blank
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        Log a dive and what you saw to write it here.
      </ThemedText>
      <OceanButton title="Log a dive" variant="log" icon="plus" onPress={() => router.push('/log/new')} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 24 },
  art: { width: 120, height: 84, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  center: { textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: 6 },
});
