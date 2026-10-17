import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/lib/store';
import { isConnectionProblem } from '@/lib/verification';

/** Where the diver's change stands: saved here only, on its way, failing, or backed up. */
export function SyncLine({ item }: { item: { synced: boolean; syncError?: string } }) {
  const theme = useTheme();
  const user = useAppStore((s) => s.user);
  const backendEnabled = useAppStore((s) => s.backendEnabled);
  const syncing = useAppStore((s) => s.syncing);
  const requestSync = useAppStore((s) => s.requestSync);
  const quiet = { color: theme.textSecondary, wash: theme.textSecondary, washOpacity: 0.2 };

  if (!backendEnabled) {
    return (
      <View style={styles.syncRow}>
        <Icon name="check" size={16} {...quiet} />
        <ThemedText type="small" themeColor="textSecondary">Saved on this device.</ThemedText>
      </View>
    );
  }
  if (!user) {
    return (
      <Pressable onPress={() => router.push('/auth')} accessibilityRole="link" style={[styles.syncRow, styles.inlineLink]}>
        <Icon name="account" size={16} {...quiet} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
          Saved on this device only. <ThemedText type="small" themeColor="tint">Sign in to back it up ›</ThemedText>
        </ThemedText>
      </Pressable>
    );
  }
  if (item.synced) {
    return (
      <View style={styles.syncRow}>
        <Icon name="checkCircle" size={16} color={theme.tint} />
        <ThemedText type="small" themeColor="textSecondary">Backed up to your account</ThemedText>
      </View>
    );
  }
  if (item.syncError && !syncing) {
    const offline = isConnectionProblem(item.syncError);
    return (
      <View style={styles.syncBlock}>
        <View style={styles.syncRow}>
          <Icon name={offline ? 'sync' : 'warning'} size={16} color={offline ? theme.textSecondary : theme.danger} wash={offline ? theme.textSecondary : theme.danger} washOpacity={0.2} />
          <ThemedText type="small" themeColor={offline ? 'textSecondary' : 'danger'} style={styles.flex}>
            {offline
              ? 'Waiting for a connection. It will sync when you’re back online.'
              : `Couldn’t sync: ${item.syncError.replace(/\.$/, '')}. It will retry automatically.`}
          </ThemedText>
        </View>
        <Pressable onPress={() => void requestSync()} accessibilityRole="button" style={[styles.syncRow, styles.inlineLink]}>
          <Icon name="sync" size={16} color={theme.tint} />
          <ThemedText type="smallBold" themeColor="tint">
            Retry now
          </ThemedText>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.syncRow}>
      <Icon name="sync" size={16} {...quiet} />
      <ThemedText type="small" themeColor="textSecondary">
        {syncing ? 'Syncing…' : 'Saved on this device, waiting to sync.'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  syncBlock: { gap: 2 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineLink: { minHeight: 44 },
});
