import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BackupRow, useBackupRowDismissed } from '@/components/backup-row';
import { DiveRow } from '@/components/dive/dive-row';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/journal/icon-button';
import { Ledger } from '@/components/journal/ledger';
import { LinkRow } from '@/components/journal/link-row';
import { Paper } from '@/components/journal/paper';
import { Screen, ScreenHeader, SectionHeader } from '@/components/journal/screen';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { summarize } from '@/components/rewards/summary';
import { ThemedText } from '@/components/themed-text';
import { Type } from '@/constants/theme';
import { useRewards } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { speciesForSighting } from '@/lib/catalog';
import { formatDepth, formatMinutes, logTotals, sortDives } from '@/lib/dives';
import { useAppStore, useDivesBefore, useMyDives, useMySightings, usePendingChanges, useSiteById } from '@/lib/store';
import type { Species } from '@/lib/types';

/** "4 h 57 min" is too wide for a quarter of the ledger: "4h 57m" fits on one line. */
const shortTime = (min: number) => formatMinutes(min).replace(' h ', 'h ').replace(' min', 'm');

/**
 * The diver's own log: three lifetime totals, the way to the badges, then every page, newest first. The
 * setup rows (dives before ScubaGo, the buddy code) are on the account page: they are not part of the log.
 */
export default function LogbookScreen() {
  const user = useAppStore((s) => s.user);
  const backendEnabled = useAppStore((s) => s.backendEnabled);
  const mySightings = useMySightings();
  const pending = usePendingChanges();
  const syncing = useAppStore((s) => s.syncing);
  const syncProblem = useAppStore((s) => s.syncProblem);
  const requestSync = useAppStore((s) => s.requestSync);
  // Any site a page names, a hidden or retired one too (the list of sites on offer has only those listed).
  const siteById = useSiteById();
  const theme = useTheme();
  const dives = useMyDives();
  const divesBefore = useDivesBefore();
  const backup = useBackupRowDismissed();
  const rewards = useRewards();
  // "18 of 51 badges": a count to scan, not a description.
  const rewardsLine = useMemo(() => {
    const { earned, badges } = summarize(rewards);
    return `${earned} of ${badges} badges`;
  }, [rewards]);

  const totals = useMemo(() => logTotals(dives), [dives]);
  const pages = useMemo(() => sortDives(dives), [dives]);
  // The animals on each page, in the order they were logged.
  const speciesByDive = useMemo(() => {
    const map = new Map<string, Species[]>();
    for (const s of [...mySightings].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const species = s.diveId ? speciesForSighting(s) : undefined;
      if (!species || !s.diveId) continue;
      map.set(s.diveId, [...(map.get(s.diveId) ?? []), species]);
    }
    return map;
  }, [mySightings]);
  const lifetime = Math.max(totals.lifetime, divesBefore);

  return (
    <Screen tab>
      <ScreenHeader
        title="Logbook"
        // Always there: the account page also holds "Dives before ScubaGo" (and the buddy code), which are no
        // longer rows of the log, so every diver must be able to reach it, with or without a server to sign in to.
        accessory={
          <IconButton
            icon="account"
            onPress={() => router.push('/auth')}
            accessibilityLabel={user ? `Account, signed in as ${user.username}` : backendEnabled ? 'Sign in or create an account' : 'Account'}
          />
        }
      />

      {/* Signed out, the log lives only in this phone's storage: say so in one line, once there is something to lose. */}
      {backendEnabled && !user && (dives.length > 0 || mySightings.length > 0) && !backup.dismissed ? (
        <BackupRow
          text={
            dives.length > 0
              ? `${dives.length} ${dives.length === 1 ? 'page' : 'pages'} only on this phone`
              : `${mySightings.length} ${mySightings.length === 1 ? 'sighting' : 'sightings'} only on this phone`
          }
          onBackup={() => router.push('/auth')}
          onDismiss={backup.dismiss}
        />
      ) : null}

      {pending.count > 0 ? (
        <Pressable onPress={() => void requestSync()} accessibilityRole="button" accessibilityHint="Tries to sync now" style={styles.syncRow}>
          <Icon name="sync" size={18} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
            {syncing
              ? 'Syncing…'
              : `${pending.count} ${pending.count === 1 ? 'change' : 'changes'} waiting to sync${
                  syncProblem || pending.failing > 0 ? ' · will retry automatically' : ''
                } · `}
            {syncing ? null : <Text style={{ fontFamily: Type.bodyHeavy, color: theme.tint }}>Sync now</Text>}
          </ThemedText>
        </Pressable>
      ) : null}

      <Ledger
        items={[
          { value: lifetime.toLocaleString('en'), label: lifetime === 1 ? 'Dive' : 'Dives', accessibilityLabel: `${lifetime} dives in your lifetime log` },
          { value: totals.bottomMinutes ? shortTime(totals.bottomMinutes) : '–', label: 'Time', accessibilityLabel: totals.bottomMinutes ? `${formatMinutes(totals.bottomMinutes)} underwater in ScubaGo` : 'No bottom time yet' },
          { value: totals.deepest ? formatDepth(totals.deepest.depth) : '–', label: 'Deepest', accessibilityLabel: totals.deepest ? `Deepest dive ${formatDepth(totals.deepest.depth)}` : 'No depth yet' },
        ]}
      />

      {/* Nothing to show until there is a first dive: badges and stamps start with it. */}
      {pages.length > 0 ? (
        <LinkRow icon="medal" title="Badges & collections" detail={rewards.ready ? rewardsLine : undefined} role="link" onPress={() => router.push('/rewards')} />
      ) : null}

      <SectionHeader
        title="Pages"
        accessory={
          dives.length ? (
            <ThemedText type="label" accessibilityLabel={`${dives.length} ${dives.length === 1 ? 'page' : 'pages'} in ScubaGo`}>
              {dives.length}
            </ThemedText>
          ) : undefined
        }
      />

      {pages.length === 0 ? (
        <EmptyState />
      ) : (
        pages.map((d) => (
          <DiveRow
            key={d.id}
            dive={d}
            siteName={siteById(d.siteId)?.name ?? 'Unknown site'}
            species={speciesByDive.get(d.id) ?? []}
            pending={!!user && !d.synced}
            onPress={() => router.push(`/dive/${d.id}`)}
          />
        ))
      )}

    </Screen>
  );
}

function EmptyState() {
  const theme = useTheme();
  return (
    <Paper style={styles.empty}>
      <View style={styles.emptyArt}>
        <Wash width={120} height={84} color={theme.wash} seed={47} style={StyleSheet.absoluteFill} />
        <Icon name="logbook" size={44} />
      </View>
      <ThemedText type="heading" style={{ textAlign: 'center' }}>
        Your first page is blank
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        Log a dive and what you saw to write it here.
      </ThemedText>
      <OceanButton title="Log a dive" variant="log" icon="plus" onPress={() => router.push('/log/new')} style={{ alignSelf: 'stretch' }} />
    </Paper>
  );
}

const styles = StyleSheet.create({
  syncRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  empty: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  emptyArt: {
    width: 120,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});
