import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { SpeciesAvatar } from '@/components/species-avatar';
import { StatusChip } from '@/components/status-chip';
import { List, ListRow } from '@/components/ui/list';
import { Tag } from '@/components/ui/tag';
import { Size, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DiveSite, Sighting, Species } from '@/lib/types';
import { STATUS_LABEL, isServerCatchingUp } from '@/lib/verification';

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
  /** Set by List when the row is one of a group's. On its own the row is a card of one. */
  separator?: boolean;
  inGroup?: boolean;
}

/** One entry in a log: the species' plate, its name, where and when. */
export function SightingRow({ sighting, species, site, showUsername = false, pending = false, hideDate = false, detail, quiet = false, onPress, separator, inGroup = false }: Props) {
  const theme = useTheme();
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
    pending ? (sighting.syncError && !isServerCatchingUp(sighting.syncError) ? 'not synced yet' : 'waiting to sync') : null,
    showStatus ? STATUS_LABEL[sighting.status!] : null,
  ]
    .filter(Boolean)
    .join(', ');
  const where =
    detail ??
    [showUsername && !sighting.isDemo ? `@${sighting.username}` : null, site?.name, hideDate ? null : formatDate(sighting.sightedOn)]
      .filter(Boolean)
      .join(' · ');
  const tags =
    sighting.isDemo || (hidden && !quiet) || showStatus || pending ? (
      <View style={styles.tags}>
        {/* Demo community data (local-only builds): never passed off as another diver's report. */}
        {sighting.isDemo ? <Tag label="Example" accessibilityLabel="Example data, not a real sighting" /> : null}
        {hidden && !quiet ? <Tag label="Only you" /> : null}
        {/* Unverified is the usual case, so only the others are named here. */}
        {showStatus ? <StatusChip status={sighting.status!} small /> : null}
        {pending ? <Tag label={sighting.syncError && !isServerCatchingUp(sighting.syncError) ? 'Not synced' : 'Waiting to sync'} dashed /> : null}
      </View>
    ) : null;
  const row = (
    <ListRow
      title={species.commonName}
      titleLines={2}
      subtitle={where || undefined}
      below={tags}
      accessibilityLabel={label}
      separator={separator}
      inGroup
      leading={<SpeciesAvatar species={species} size={Size.thumb} showRarityRing />}
      trailing={
        sighting.photoUri ? (
          <View style={styles.end}>
            <Icon name="camera" size={20} color={theme.textSecondary} />
            {onPress ? <Icon name="chevronRight" size={16} color={theme.textTertiary} weight="bold" /> : null}
          </View>
        ) : undefined
      }
      onPress={onPress}
    />
  );
  return inGroup ? row : <List>{row}</List>;
}
/** A List hands a SightingRow its place in the group, as it does a ListRow. */
SightingRow.groupRow = true;

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
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.s2,
    marginTop: Space.s1,
  },
  end: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s3,
  },
});
