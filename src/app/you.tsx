import { router } from 'expo-router';

import { SyncLine } from '@/components/sync-line';
import { List, ListRow } from '@/components/ui/list';
import { Screen, ScreenTitle } from '@/components/ui/screen';
import { setOceanPaused, useOceanPaused } from '@/lib/ocean-pause';
import { useAppStore, useDivesBefore, usePendingChanges } from '@/lib/store';

/**
 * You: the account and sync, the dives from before ScubaGo, the one setting, help, credits and the performance report: one grouped
 * list, reached from the button at the top of Home. Everything here works without an account.
 */
export default function YouScreen() {
  const user = useAppStore((s) => s.user);
  const backendEnabled = useAppStore((s) => s.backendEnabled);
  const syncProblem = useAppStore((s) => s.syncProblem);
  const pending = usePendingChanges();
  const divesBefore = useDivesBefore();
  const paused = useOceanPaused();

  const syncDetail = !backendEnabled
    ? 'Saved on this phone'
    : !user
      ? 'Sign in to keep your log safe'
      : pending.count > 0
        ? `${pending.count} ${pending.count === 1 ? 'change' : 'changes'} waiting`
        : 'Backed up';

  return (
    <Screen>
      <ScreenTitle title="You" />
      <List>
        {user ? <ListRow leading="account" title={`@${user.username}`} subtitle="Your account" onPress={() => router.push('/auth')} /> : null}
        <ListRow leading="sync" title="Back up and sync" subtitle={syncDetail} onPress={() => router.push('/auth')} />
        <ListRow
          leading="logbook"
          title="Dives before ScubaGo"
          subtitle={divesBefore > 0 ? `${divesBefore.toLocaleString('en')} logged elsewhere` : undefined}
          accessibilityHint="Numbers your pages after the dives you logged elsewhere"
          onPress={() => router.push('/dive/count')}
        />
        {/* The ocean animation, on or paused. Reduce Motion still wins: with it on, the ocean is still whatever this says. */}
        <ListRow leading="waves" title="Animate the ocean" switchValue={!paused} onPress={() => setOceanPaused(!paused)} />
        <ListRow leading="info" title="How ScubaGo works" onPress={() => router.push('/help')} />
        <ListRow leading="everyone" title="Data & credits" accessibilityRole="link" onPress={() => router.push('/credits')} />
        <ListRow leading="gauge" title="Performance report" onPress={() => router.push('/perf')} />
      </List>
      {user && pending.count > 0 ? <SyncLine item={{ synced: false, syncError: syncProblem ?? undefined }} /> : null}
    </Screen>
  );
}
