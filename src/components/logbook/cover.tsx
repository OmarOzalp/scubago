import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BackupRow, useBackupRowDismissed } from '@/components/backup-row';
import { summarize } from '@/components/rewards/summary';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { List, ListRow } from '@/components/ui/list';
import { Radius, Space, TypeScale } from '@/constants/theme';
import { useRewards } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { formatDepth, formatMinutes, logTotals } from '@/lib/dives';
import { useAppStore, useDivesBefore, useMySightings, usePendingChanges } from '@/lib/store';
import type { Dive } from '@/lib/types';

/** "4 h 57 min" is too wide for a third of the totals: "4h 57m" fits on one line. */
const shortTime = (min: number) => formatMinutes(min).replace(' h ', 'h ').replace(' min', 'm');

type Figure = { value: string; label: string; accessibilityLabel: string };

/** The totals: three figures side by side in one card, each with its label under it. */
function Totals({ items }: { items: Figure[] }) {
  const theme = useTheme();
  return (
    <Card padded={false} style={styles.totals}>
      {items.map((item, index) => (
        <View key={item.label} accessible accessibilityLabel={item.accessibilityLabel} style={[styles.figure, index > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.rule }]}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[TypeScale.figure, { color: theme.text }]}>
            {item.value}
          </Text>
          <Text numberOfLines={1} style={[TypeScale.footnote, { color: theme.textSecondary }]}>
            {item.label}
          </Text>
        </View>
      ))}
    </Card>
  );
}

/**
 * The front of the book: its label (the diver's name when they are signed in), the lifetime totals
 * and the way to the badges and, when there is something to say, the backup and sync rows. The
 * account, the dives before ScubaGo and the settings are on the You screen (the button on Home).
 */
export function Cover({ dives }: { dives: Dive[] }) {
  const user = useAppStore((s) => s.user);
  const backendEnabled = useAppStore((s) => s.backendEnabled);
  const syncing = useAppStore((s) => s.syncing);
  const syncProblem = useAppStore((s) => s.syncProblem);
  const requestSync = useAppStore((s) => s.requestSync);
  const mySightings = useMySightings();
  const pending = usePendingChanges();
  const divesBefore = useDivesBefore();
  const backup = useBackupRowDismissed();
  const rewards = useRewards();
  const theme = useTheme();
  // "18 of 51 badges": a count to scan, not a description.
  const rewardsLine = useMemo(() => {
    const { earned, badges } = summarize(rewards);
    return `${earned} of ${badges} badges`;
  }, [rewards]);
  const totals = useMemo(() => logTotals(dives), [dives]);
  const lifetime = Math.max(totals.lifetime, divesBefore);

  return (
    <View style={styles.cover}>
      <View style={styles.middle}>
        <CoverLabel name={user?.username} />
      </View>

      {/* No totals of zeros: they start with the first dive (or the count of dives before ScubaGo). */}
      {lifetime > 0 ? (
        <Totals
          items={[
            { value: lifetime.toLocaleString('en'), label: lifetime === 1 ? 'Dive' : 'Dives', accessibilityLabel: `${lifetime} dives in your lifetime log` },
            { value: totals.bottomMinutes ? shortTime(totals.bottomMinutes) : '–', label: 'Time', accessibilityLabel: totals.bottomMinutes ? `${formatMinutes(totals.bottomMinutes)} underwater in ScubaGo` : 'No bottom time yet' },
            { value: totals.deepest ? formatDepth(totals.deepest.depth) : '–', label: 'Deepest', accessibilityLabel: totals.deepest ? `Deepest dive ${formatDepth(totals.deepest.depth)}` : 'No depth yet' },
          ]}
        />
      ) : null}

      {/* Nothing to show until there is a first dive: badges and stamps start with it. */}
      {dives.length > 0 ? (
        <List>
          <ListRow
            leading="medal"
            title="Badges"
            subtitle={rewards.ready ? rewardsLine : undefined}
            accessibilityRole="link"
            onPress={() => router.navigate({ pathname: '/field-guide', params: { view: 'badges' } })}
          />
        </List>
      ) : null}

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
        <List>
          <ListRow
            leading="sync"
            title={syncing ? 'Syncing…' : `${pending.count} ${pending.count === 1 ? 'change' : 'changes'} waiting to sync`}
            subtitle={!syncing && (syncProblem || pending.failing > 0) ? 'Will retry automatically' : undefined}
            trailing={syncing ? 'none' : <Text style={[TypeScale.subheadStrong, { color: theme.tint }]}>Sync now</Text>}
            accessibilityHint="Tries to sync now"
            onPress={() => void requestSync()}
          />
        </List>
      ) : null}
    </View>
  );
}

/**
 * The label on the front, set on a plaque: "Logbook", or the diver's name under a small
 * "Logbook" when they are signed in.
 */
function CoverLabel({ name }: { name?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.label, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.labelInner} accessible accessibilityRole="header" accessibilityLabel={name ? `Logbook of ${name}` : 'Logbook'}>
        {name ? (
          <ThemedText type="footnoteStrong" themeColor="textSecondary">
            Logbook
          </ThemedText>
        ) : null}
        <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={[TypeScale.display, styles.title, { color: theme.text }]}>
          {name ?? 'Logbook'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { flexGrow: 1, gap: Space.s4 },
  // The label sits in the middle of whatever room the rows leave.
  middle: { flexGrow: 1, minHeight: 150, justifyContent: 'center' },
  label: { alignSelf: 'center', width: '86%', maxWidth: 360, borderRadius: Radius.lg },
  labelInner: { paddingVertical: Space.s8, paddingHorizontal: Space.s4, alignItems: 'center', gap: Space.s1 },
  title: { textAlign: 'center' },
  totals: { flexDirection: 'row', paddingVertical: Space.s4 },
  figure: { flex: 1, alignItems: 'center', paddingHorizontal: Space.s2, gap: 2 },
});
