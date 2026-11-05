import { router } from 'expo-router';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { LinkRow } from '@/components/journal/link-row';
import { PaperButton } from '@/components/journal/paper';
import { Screen, ScreenHeader } from '@/components/journal/screen';
import { SyncLine } from '@/components/sync-line';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setOceanPaused, useOceanPaused } from '@/lib/ocean-pause';
import { useAppStore, useDivesBefore, usePendingChanges } from '@/lib/store';

/**
 * You: the account and sync, the dives from before ScubaGo, the one setting, help and credits. One row
 * each, reached from the button at the top of Home. Everything here works without an account.
 */
export default function YouScreen() {
  const user = useAppStore((s) => s.user);
  const backendEnabled = useAppStore((s) => s.backendEnabled);
  const syncProblem = useAppStore((s) => s.syncProblem);
  const pending = usePendingChanges();
  const divesBefore = useDivesBefore();

  const syncDetail = !backendEnabled
    ? 'Saved on this phone'
    : !user
      ? 'Sign in to keep your log safe'
      : pending.count > 0
        ? `${pending.count} ${pending.count === 1 ? 'change' : 'changes'} waiting`
        : 'Backed up';

  return (
    <Screen>
      <ScreenHeader title="You" />
      <View style={styles.rows}>
        {user ? <LinkRow icon="account" title={`@${user.username}`} detail="Your account" onPress={() => router.push('/auth')} /> : null}
        <LinkRow
          icon="sync"
          title="Back up and sync"
          detail={syncDetail}
          onPress={() => router.push('/auth')}
        />
        {user && pending.count > 0 ? <SyncLine item={{ synced: false, syncError: syncProblem ?? undefined }} /> : null}
        <LinkRow
          icon="logbook"
          title="Dives before ScubaGo"
          detail={divesBefore > 0 ? `${divesBefore.toLocaleString('en')} logged elsewhere` : undefined}
          accessibilityHint="Numbers your pages after the dives you logged elsewhere"
          onPress={() => router.push('/dive/count')}
        />
        <PauseRow />
        <LinkRow icon="info" title="How ScubaGo works" onPress={() => router.push('/help')} />
        <LinkRow icon="everyone" title="Data & credits" role="link" onPress={() => router.push('/credits')} />
      </View>
    </Screen>
  );
}

/** The ocean animation, on or paused. Reduce Motion still wins: with it on, the ocean is still whatever this says. */
function PauseRow() {
  const theme = useTheme();
  const paused = useOceanPaused();
  const toggle = () => setOceanPaused(!paused);
  // The whole row is the switch (44 pt and more to hit); the control inside only shows its state.
  return (
    <PaperButton
      onPress={toggle}
      accessibilityRole="switch"
      accessibilityLabel="Animate the ocean"
      accessibilityState={{ checked: !paused }}
      style={styles.switchRow}>
      <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
        <Icon name="waves" size={24} />
      </View>
      <Text style={[styles.title, { color: theme.text }]}>Animate the ocean</Text>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch value={!paused} onValueChange={toggle} trackColor={{ true: theme.tint }} />
      </View>
    </PaperButton>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, paddingVertical: 12, paddingHorizontal: 14 },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: Type.bodyHeavy, fontSize: 15, lineHeight: 20 },
});
