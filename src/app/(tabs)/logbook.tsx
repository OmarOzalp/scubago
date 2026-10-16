import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { IconButton } from '@/components/journal/icon-button';
import { Ledger } from '@/components/journal/ledger';
import { LinkRow } from '@/components/journal/link-row';
import { Paper } from '@/components/journal/paper';
import { Screen, ScreenHeader, SectionHeader } from '@/components/journal/screen';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { formatEntryDate, SightingRow } from '@/components/sighting-row';
import { ThemedText } from '@/components/themed-text';
import { Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { CATALOG, CATALOG_BY_ID, speciesForSighting } from '@/lib/catalog';
import { deriveDex } from '@/lib/dex';
import { RARITY_LABEL, RARITY_TEXT } from '@/lib/rarity';
import { useAllSites, useAppStore, useMySightings, usePendingChanges } from '@/lib/store';
import type { Sighting } from '@/lib/types';

/** The diver's own log: totals, then every sighting under the day it was made. */
export default function LogbookScreen() {
  const user = useAppStore((s) => s.user);
  const backendEnabled = useAppStore((s) => s.backendEnabled);
  const mySightings = useMySightings();
  const pending = usePendingChanges();
  const syncing = useAppStore((s) => s.syncing);
  const syncProblem = useAppStore((s) => s.syncProblem);
  const requestSync = useAppStore((s) => s.requestSync);
  const sites = useAllSites();
  const sitesById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const theme = useTheme();
  const scheme = useSchemeName();

  const dex = useMemo(() => deriveDex(mySightings, CATALOG_BY_ID), [mySightings]);
  const rarest = dex[0];

  // Newest day first; within a day, the latest logged first.
  const days = useMemo(() => {
    const sorted = [...mySightings].sort((a, b) =>
      b.sightedOn === a.sightedOn ? b.createdAt.localeCompare(a.createdAt) : b.sightedOn.localeCompare(a.sightedOn),
    );
    const groups: { date: string; sightings: Sighting[] }[] = [];
    for (const s of sorted) {
      const last = groups[groups.length - 1];
      if (last?.date === s.sightedOn) last.sightings.push(s);
      else groups.push({ date: s.sightedOn, sightings: [s] });
    }
    return groups;
  }, [mySightings]);

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
              {mySightings.length > 0
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
          { value: String(mySightings.length), label: mySightings.length === 1 ? 'Sighting' : 'Sightings' },
          { value: String(dex.length), label: `of ${CATALOG.length} species`, accessibilityLabel: `${dex.length} of ${CATALOG.length} species seen` },
          rarest
            ? {
                value: rarest.species.commonName,
                label: `Rarest · ${RARITY_LABEL[rarest.species.rarity]}`,
                color: RARITY_TEXT[scheme][rarest.species.rarity],
                accessibilityLabel: `Rarest find: ${rarest.species.commonName}, ${RARITY_LABEL[rarest.species.rarity].toLowerCase()}`,
              }
            : { value: '–', label: 'Rarest find', accessibilityLabel: 'No rarest find yet' },
        ]}
      />

      {backendEnabled ? (
        <LinkRow
          icon="verified"
          title="Confirm a buddy’s sighting"
          detail="Got a code from a buddy? Enter it here."
          role="link"
          onPress={() => router.push('/verify')}
        />
      ) : null}

      <SectionHeader
        title="Entries"
        accessory={
          <Pressable onPress={() => router.push('/field-guide')} accessibilityRole="link" style={styles.textLink}>
            <ThemedText type="smallBold" themeColor="tint">
              Field guide ›
            </ThemedText>
          </Pressable>
        }
      />

      {days.length === 0 ? (
        <EmptyState />
      ) : (
        days.map(({ date, sightings }) => (
          <View key={date} style={styles.day}>
            <View style={styles.dayHeader}>
              <ThemedText type="label" accessibilityRole="header">
                {formatEntryDate(date)}
              </ThemedText>
              <View style={[styles.dayRule, { backgroundColor: theme.rule }]} />
            </View>
            {sightings.map((s) => {
              const species = speciesForSighting(s);
              if (!species) return null;
              return (
                <SightingRow
                  key={s.id}
                  sighting={s}
                  species={species}
                  site={sitesById.get(s.siteId)}
                  pending={!!user && !s.synced}
                  hideDate
                  onPress={() => router.push(`/sighting/${s.id}`)}
                />
              );
            })}
          </View>
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
  day: {
    gap: 8,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  dayRule: {
    flex: 1,
    height: 1,
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
