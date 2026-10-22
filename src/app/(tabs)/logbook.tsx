import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DiveRow } from '@/components/dive/dive-row';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/journal/icon-button';
import { Ledger } from '@/components/journal/ledger';
import { LinkRow } from '@/components/journal/link-row';
import { Paper, PaperButton } from '@/components/journal/paper';
import { Screen, ScreenHeader, SectionHeader } from '@/components/journal/screen';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { badgesLine, summarize } from '@/components/rewards/summary';
import { ThemedText } from '@/components/themed-text';
import { OnFill, Radius, Type } from '@/constants/theme';
import { useRewards } from '@/hooks/use-rewards';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { CATALOG, CATALOG_BY_ID, speciesForSighting } from '@/lib/catalog';
import { deriveDex } from '@/lib/dex';
import { formatDepth, formatDiveNumber, formatMinutes, logTotals, nextMilestone, milestoneName, sortDives } from '@/lib/dives';
import { useAppStore, useDivesBefore, useMyDives, useMySightings, useNextDiveNumber, usePendingChanges, useSiteById } from '@/lib/store';
import type { Species } from '@/lib/types';

/** The diver's own log: lifetime totals, then every page, newest first. */
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
  const next = useNextDiveNumber();
  const rewards = useRewards();
  const rewardsLine = useMemo(() => badgesLine(summarize(rewards)), [rewards]);

  const dex = useMemo(() => deriveDex(mySightings, CATALOG_BY_ID), [mySightings]);
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
  const ahead = nextMilestone(next);

  return (
    <Screen tab>
      <ScreenHeader
        eyebrow={backendEnabled && user ? `@${user.username}` : 'Your logbook'}
        title="Logbook"
        accessory={
          backendEnabled ? (
            <IconButton
              icon="account"
              onPress={() => router.push('/auth')}
              accessibilityLabel={user ? `Account, signed in as ${user.username}` : 'Sign in or create an account'}
            />
          ) : null
        }
      />

      {/* Signed out, the log lives only in this phone's storage: say so, and offer the way to keep it. */}
      {backendEnabled && !user ? (
        <Paper tone="sand" style={styles.backup}>
          <View style={styles.backupTitle}>
            <Icon name="warning" size={22} wash={theme.sun} />
            <ThemedText type="smallBold" style={{ flex: 1 }}>
              {dives.length > 0
                ? `${dives.length} ${dives.length === 1 ? 'page is' : 'pages are'} only on this phone`
                : mySightings.length > 0
                  ? `${mySightings.length} ${mySightings.length === 1 ? 'sighting is' : 'sightings are'} only on this phone`
                  : 'Back up your log'}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {mySightings.length > 0
              ? 'Sign in or create a free account to back them up and see them on any device.'
              : 'Sign in to see a log you’ve already backed up, or create an account so new sightings are kept safe.'}
          </ThemedText>
          <OceanButton
            title={mySightings.length > 0 ? 'Back up my log' : 'Sign in or create an account'}
            variant={mySightings.length > 0 ? 'primary' : 'secondary'}
            onPress={() => router.push('/auth')}
          />
        </Paper>
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
          { value: totals.bottomMinutes ? formatMinutes(totals.bottomMinutes) : '–', label: 'Time', accessibilityLabel: totals.bottomMinutes ? `${formatMinutes(totals.bottomMinutes)} underwater in ScubaGo` : 'No bottom time yet' },
          { value: totals.deepest ? formatDepth(totals.deepest.depth) : '–', label: 'Deepest', accessibilityLabel: totals.deepest ? `Deepest dive ${formatDepth(totals.deepest.depth)}` : 'No depth yet' },
          { value: String(dex.length), label: `of ${CATALOG.length} species`, accessibilityLabel: `${dex.length} of ${CATALOG.length} species seen` },
        ]}
      />

      {/* The next page, waiting to be written. */}
      <PaperButtonRow
        number={next}
        title={`Begin entry ${formatDiveNumber(next)}`}
        detail={
          ahead && ahead.remaining === 0
            ? `Your ${milestoneName(ahead.at)} dive!`
            : ahead && ahead.remaining <= 5
              ? `${ahead.remaining + 1} dives to your ${milestoneName(ahead.at)}`
              : dives.length === 0
                ? 'Your first page in ScubaGo'
                : `${totals.sites} ${totals.sites === 1 ? 'site' : 'sites'} · ${totals.signed} signed`
        }
        onPress={() => router.push('/log/new')}
      />

      <LinkRow icon="medal" title="Badges & passport" detail={rewards.ready ? rewardsLine : undefined} role="link" onPress={() => router.push('/rewards')} />

      <LinkRow
        icon="logbook"
        title="Dives before ScubaGo"
        detail={divesBefore > 0 ? `${divesBefore.toLocaleString('en')} logged elsewhere; your pages are numbered after them` : 'Logged dives elsewhere? Number your pages from there'}
        onPress={() => router.push('/dive/count')}
      />

      {backendEnabled ? (
        <LinkRow
          icon="verified"
          title="Buddy code"
          detail="Confirm a buddy’s sighting or sign their dive"
          role="link"
          onPress={() => router.push('/verify')}
        />
      ) : null}

      <SectionHeader
        title="Pages"
        eyebrow={dives.length ? `${dives.length} in ScubaGo` : undefined}
        accessory={
          <Pressable onPress={() => router.push('/field-guide')} accessibilityRole="link" style={styles.textLink}>
            <ThemedText type="smallBold" themeColor="tint">
              Field guide ›
            </ThemedText>
          </Pressable>
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

/** The next page as a card in the margin style of the index: its number, and a line about it. */
function PaperButtonRow({ number, title, detail, onPress }: { number: number; title: string; detail: string; onPress: () => void }) {
  const theme = useTheme();
  const scheme = useSchemeName();
  return (
    <PaperButton onPress={onPress} accessibilityLabel={`${title}. ${detail}`} style={styles.nextRow}>
      <View style={[styles.nextNumber, { backgroundColor: theme.coral, borderColor: theme.text }]}>
        <Text style={[styles.nextNo, { color: OnFill[scheme].coral }]}>NO.</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.nextValue, { color: OnFill[scheme].coral }]}>
          {number.toLocaleString('en')}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text style={[styles.nextTitle, { color: theme.text }]}>{title}</Text>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      <Icon name="plus" size={20} color={theme.tint} weight="bold" />
    </PaperButton>
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
        Log a dive and what you saw, and it is written in here, ready for the next one.
      </ThemedText>
      <OceanButton title="Log a dive" variant="log" icon="plus" onPress={() => router.push('/log/new')} style={{ alignSelf: 'stretch' }} />
    </Paper>
  );
}

const styles = StyleSheet.create({
  backup: {
    gap: 10,
  },
  backupTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textLink: {
    minHeight: 44,
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    paddingRight: 14,
  },
  nextNumber: {
    width: 64,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    paddingVertical: 6,
  },
  nextNo: {
    fontFamily: Type.label,
    fontSize: 12,
    letterSpacing: 1,
  },
  nextValue: {
    fontFamily: Type.display,
    fontSize: 24,
    lineHeight: 28,
  },
  nextTitle: {
    fontFamily: Type.bodyHeavy,
    fontSize: 16,
    lineHeight: 21,
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
