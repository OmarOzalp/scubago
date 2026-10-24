import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const DISMISSED_KEY = 'scubago.backupRowDismissed.v1';

/** How long the row stays closed once the diver has closed it. */
export const BACKUP_ROW_QUIET_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the row is closed: true for 7 days after the diver closed it, then it comes back (a log
 * that still lives only on this phone is worth a reminder now and then, not on every visit). What is
 * stored is the moment it was closed; a value that isn't a date (from an older build) counts as
 * closed just now. Until storage has answered the row counts as closed, so it never flashes in and
 * out; if storage can't be read it shows, and closing it lasts until the screen is left.
 */
export function useBackupRowDismissed(now: () => number = Date.now): { dismissed: boolean; dismiss: () => void } {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((value) => {
        if (!live) return;
        if (!value) {
          setDismissed(false);
          return;
        }
        // (Date.parse reads even "1" as a year, so only a stored ISO moment is trusted as one.)
        const closedAt = /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN;
        if (Number.isNaN(closedAt)) {
          // Not a date: take it as closed now, so it comes back a week from today.
          AsyncStorage.setItem(DISMISSED_KEY, new Date(now()).toISOString()).catch(() => undefined);
          setDismissed(true);
          return;
        }
        setDismissed(now() - closedAt < BACKUP_ROW_QUIET_DAYS * DAY_MS);
      })
      .catch(() => {
        if (live) setDismissed(false);
      });
    return () => {
      live = false;
    };
    // `now` is a clock: a new function each render must not re-read storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(DISMISSED_KEY, new Date(now()).toISOString()).catch(() => undefined);
  };
  return { dismissed, dismiss };
}

/**
 * One line for a log that lives only on this phone: what is at risk, the way to back it up, and a
 * close button. A plain card in the page's own colours, not a warning: it is a reminder, and it
 * should not be louder than the totals under it. (A banner with a button of its own pushed the dives
 * below the first screen.)
 */
export function BackupRow({ text, onBackup, onDismiss }: { text: string; onBackup: () => void; onDismiss: () => void }) {
  const theme = useTheme();
  return (
    <Paper padded={false} style={styles.row}>
      <Pressable onPress={onBackup} accessibilityRole="button" accessibilityLabel={`${text}. Back up my log`} style={({ pressed }) => [styles.main, { opacity: pressed ? 0.6 : 1 }]}>
        <Icon name="info" size={20} color={theme.textSecondary} />
        <ThemedText type="small" numberOfLines={2} style={styles.text}>
          {text}
        </ThemedText>
        <ThemedText type="smallBold" themeColor="tint">
          Back up
        </ThemedText>
      </Pressable>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss this reminder for a week" style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}>
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
