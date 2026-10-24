import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const DISMISSED_KEY = 'scubago.backupRowDismissed.v1';

/**
 * Whether the diver has closed the Logbook's "only on this phone" row: once per install, like the
 * intro. Until storage has answered the row counts as closed, so it never flashes in and out; if
 * storage can't be read it shows, and closing it lasts until the screen is left.
 */
export function useBackupRowDismissed(): { dismissed: boolean; dismiss: () => void } {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((value) => {
        if (live) setDismissed(!!value);
      })
      .catch(() => {
        if (live) setDismissed(false);
      });
    return () => {
      live = false;
    };
  }, []);
  const dismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(DISMISSED_KEY, new Date().toISOString()).catch(() => undefined);
  };
  return { dismissed, dismiss };
}

/**
 * One line for a log that lives only on this phone: what is at risk, the way to back it up, and a
 * close button. (A banner with a button of its own pushed the dives below the first screen.)
 */
export function BackupRow({ text, onBackup, onDismiss }: { text: string; onBackup: () => void; onDismiss: () => void }) {
  const theme = useTheme();
  return (
    <Paper tone="sand" padded={false} style={styles.row}>
      <Pressable onPress={onBackup} accessibilityRole="button" accessibilityLabel={`${text}. Back up my log`} style={({ pressed }) => [styles.main, { opacity: pressed ? 0.6 : 1 }]}>
        <Icon name="warning" size={20} wash={theme.sun} />
        <ThemedText type="smallBold" numberOfLines={2} style={styles.text}>
          {text}
        </ThemedText>
        <ThemedText type="smallBold" themeColor="tint">
          Back up
        </ThemedText>
      </Pressable>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss this reminder" style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}>
        <Icon name="close" size={16} weight="bold" />
      </Pressable>
    </Paper>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  main: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
  },
  text: {
    flex: 1,
  },
  close: {
    width: 44,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
