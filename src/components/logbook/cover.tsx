import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BackupRow, useBackupRowDismissed } from '@/components/backup-row';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/journal/icon-button';
import { Ledger } from '@/components/journal/ledger';
import { LinkRow } from '@/components/journal/link-row';
import { Paper } from '@/components/journal/paper';
import { summarize } from '@/components/rewards/summary';
import { ThemedText } from '@/components/themed-text';
import { Radius, Type } from '@/constants/theme';
import { useRewards } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { formatDepth, formatMinutes, logTotals } from '@/lib/dives';
import { useAppStore, useDivesBefore, useMySightings, usePendingChanges } from '@/lib/store';
import type { Dive } from '@/lib/types';

/** "4 h 57 min" is too wide for a third of the ledger: "4h 57m" fits on one line. */
const shortTime = (min: number) => formatMinutes(min).replace(' h ', 'h ').replace(' min', 'm');

/**
 * The front of the book: its label (the diver's name when they are signed in), the lifetime totals
 * and the way to the badges, with the account button and, when there is something to say, the
 * backup and sync rows. The setup rows (dives before ScubaGo, the buddy code) are on the account page.
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
      <View style={styles.top}>
        {/* Always there: the account page also holds "Dives before ScubaGo" and the buddy code, so every diver must reach it. */}
        <IconButton
          icon="account"
          onPress={() => router.push('/auth')}
          accessibilityLabel={user ? `Account, signed in as ${user.username}` : backendEnabled ? 'Sign in or create an account' : 'Account'}
        />
      </View>

      <View style={styles.middle}>
        <CoverLabel name={user?.username} />
      </View>

      {/* No ledger of zeros: the totals start with the first dive (or the count of dives before ScubaGo). */}
      {lifetime > 0 ? (
        <Ledger
          items={[
            { value: lifetime.toLocaleString('en'), label: lifetime === 1 ? 'Dive' : 'Dives', accessibilityLabel: `${lifetime} dives in your lifetime log` },
            { value: totals.bottomMinutes ? shortTime(totals.bottomMinutes) : '–', label: 'Time', accessibilityLabel: totals.bottomMinutes ? `${formatMinutes(totals.bottomMinutes)} underwater in ScubaGo` : 'No bottom time yet' },
            { value: totals.deepest ? formatDepth(totals.deepest.depth) : '–', label: 'Deepest', accessibilityLabel: totals.deepest ? `Deepest dive ${formatDepth(totals.deepest.depth)}` : 'No depth yet' },
          ]}
        />
      ) : null}

      {/* Nothing to show until there is a first dive: badges and stamps start with it. */}
      {dives.length > 0 ? (
        <LinkRow icon="medal" title="Badges & collections" detail={rewards.ready ? rewardsLine : undefined} role="link" onPress={() => router.push('/rewards')} />
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
        <Paper padded={false}>
          <Pressable onPress={() => void requestSync()} accessibilityRole="button" accessibilityHint="Tries to sync now" style={styles.syncRow}>
            <Icon name="sync" size={18} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              {syncing
                ? 'Syncing…'
                : `${pending.count} ${pending.count === 1 ? 'change' : 'changes'} waiting to sync${syncProblem || pending.failing > 0 ? ' · will retry automatically' : ''} · `}
              {syncing ? null : <Text style={{ fontFamily: Type.bodyHeavy, color: theme.tint }}>Sync now</Text>}
            </ThemedText>
          </Pressable>
        </Paper>
      ) : null}
    </View>
  );
}

/**
 * The label on the front, framed like a bookplate: "Logbook", or the diver's name under a small
 * "LOGBOOK" when they are signed in.
 */
function CoverLabel({ name }: { name?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.label, { backgroundColor: theme.backgroundElement, borderColor: theme.text }]}>
      <View style={[styles.labelInner, { borderColor: theme.text }]} accessible accessibilityRole="header" accessibilityLabel={name ? `Logbook of ${name}` : 'Logbook'}>
        {name ? <ThemedText type="label">Logbook</ThemedText> : null}
        <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.title, { color: theme.text }]}>
          {name ?? 'Logbook'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cover: { flexGrow: 1, gap: 18 },
  top: { flexDirection: 'row', justifyContent: 'flex-end' },
  // The label sits in the middle of whatever room the rows leave.
  middle: { flexGrow: 1, minHeight: 150, justifyContent: 'center' },
  label: { alignSelf: 'center', width: '86%', maxWidth: 360, borderWidth: 1.5, borderRadius: Radius.md, padding: 5 },
  labelInner: { borderWidth: 1, borderRadius: Radius.sm, paddingVertical: 22, paddingHorizontal: 14, alignItems: 'center', gap: 4 },
  title: { fontFamily: Type.display, fontSize: 34, lineHeight: 40, textAlign: 'center' },
  syncRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
});
