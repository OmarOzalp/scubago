import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Tag } from '@/components/journal/tag';
import { SpeciesAvatar } from '@/components/species-avatar';
import { StatusChip } from '@/components/status-chip';
import { Radius, Shadow, Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import type { DiveSite, Sighting, Species } from '@/lib/types';
import { STATUS_LABEL } from '@/lib/verification';

interface Props {
  sighting: Sighting;
  species: Species;
  site?: DiveSite;
  /** Show who logged it (used on site details); the logbook hides it. */
  showUsername?: boolean;
  /** The diver's change hasn't reached the server yet (the logbook, when signed in). */
  pending?: boolean;
  /** Leave the date out (the logbook already groups entries under their date). */
  hideDate?: boolean;
  /** Said under the name in place of the site and date, for a list whose rows share both (a dive's page). Empty says nothing. */
  detail?: string;
  /** Every row on the page is the diver's own, so "Only you" says nothing: it stays in the screen-reader label only. */
  quiet?: boolean;
  onPress?: () => void;
}

/** One entry in a log: the species' plate, its name, where and when. */
export function SightingRow({ sighting, species, site, showUsername = false, pending = false, hideDate = false, detail, quiet = false, onPress }: Props) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const showStatus = !!sighting.status && sighting.status !== 'unverified' && !pending;
  // Only the diver who logged a private sighting ever has it.
  const hidden = sighting.visibility === 'private';
  // One sentence for screen readers instead of five separate bits of text.
  const label = [
    species.commonName,
    showUsername && !sighting.isDemo ? `logged by @${sighting.username}` : null,
    ...(detail === undefined ? [site?.name, formatDate(sighting.sightedOn)] : [detail]),
    sighting.photoUri ? 'with photo' : null,
    hidden ? 'only you can see it' : null,
    sighting.isDemo ? 'example data, not a real sighting' : null,
    pending ? (sighting.syncError ? 'not synced yet' : 'waiting to sync') : null,
    showStatus ? STATUS_LABEL[sighting.status!] : null,
  ]
    .filter(Boolean)
    .join(', ');
  const where =
    detail ??
    [showUsername && !sighting.isDemo ? `@${sighting.username}` : null, site?.name, hideDate ? null : formatDate(sighting.sightedOn)]
      .filter(Boolean)
      .join(' · ');
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: theme.cardBorder,
          boxShadow: Shadow[scheme].card,
          transform: [{ translateY: pressed ? 1 : 0 }],
        },
      ]}>
      <SpeciesAvatar species={species} size={52} showRarityRing />
      <View style={styles.body}>
        <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>
          {species.commonName}
        </Text>
        {where ? (
          <Text numberOfLines={1} style={[styles.where, { color: theme.textSecondary }]}>
            {where}
          </Text>
        ) : null}
        {sighting.isDemo || (hidden && !quiet) || showStatus || pending ? (
          <View style={styles.tags}>
            {/* Demo community data (local-only builds): never passed off as another diver's report. */}
            {sighting.isDemo ? <Tag label="Example" small accessibilityLabel="Example data, not a real sighting" /> : null}
            {hidden && !quiet ? <Tag label="Only you" small /> : null}
            {/* Unverified is the usual case, so only the others are named here. */}
            {showStatus ? <StatusChip status={sighting.status!} small /> : null}
            {pending ? <Tag label={sighting.syncError ? 'Not synced' : 'Waiting to sync'} dashed small /> : null}
          </View>
        ) : null}
      </View>
      {sighting.photoUri ? <Icon name="camera" size={20} color={theme.textSecondary} /> : null}
      {onPress ? <Icon name="chevronRight" size={18} color={theme.textSecondary} weight="bold" /> : null}
    </Pressable>
  );
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** A logbook date heading: "Saturday 12 October", with the year when it isn't this year's. */
export function formatEntryDate(isoDate: string, thisYear = new Date().getFullYear()): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: y === thisYear ? undefined : 'numeric',
    timeZone: 'UTC',
  });
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    paddingRight: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontFamily: Type.bodyHeavy,
    fontSize: 16,
    lineHeight: 21,
  },
  where: {
    fontFamily: Type.body,
    fontSize: 14,
    lineHeight: 19,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 3,
  },
});
