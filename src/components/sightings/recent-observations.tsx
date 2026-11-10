import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { distanceLabel, inatUrl, isIsoDate, photoUrl, RECENT_SHOWN } from '@/components/sightings/format';
import { formatDate } from '@/components/sighting-row';
import { List, ListRow } from '@/components/ui/list';
import { Radius, Size, Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
import type { RecentSighting } from '@/lib/external-sightings/types';

const THUMB = 72;

/**
 * The newest openly licensed iNaturalist observations: what was seen, on which day, how near, and
 * whose observation it is. Each one opens on iNaturalist. A photo appears only with its own credit.
 */
export function RecentObservations({
  recent,
  onOpenUrl,
  shown = RECENT_SHOWN,
}: {
  recent: RecentSighting[];
  onOpenUrl: (url: string) => void;
  shown?: number;
}) {
  const rows = recent.slice(0, shown);
  return (
    <List>
      {rows.map((item, index) => (
        <ObservationRow key={item.observationId} item={item} first={index === 0} onOpenUrl={onOpenUrl} />
      ))}
    </List>
  );
}

function ObservationRow({ item, first, onOpenUrl }: { item: RecentSighting; first: boolean; onOpenUrl: (url: string) => void }) {
  const theme = useTheme();
  const [photoFailed, setPhotoFailed] = useState(false);
  const species = CATALOG_BY_ID.get(item.speciesId);
  const link = inatUrl(item.url);
  if (!species || !link || !isIsoDate(item.observedOn)) return null;

  const when = formatDate(item.observedOn);
  const near = distanceLabel(item);
  // A photo is drawn only with its credit; if it does not load, the credit goes with it.
  const src = item.photo ? photoUrl(item.photo.url) : undefined;
  const photo = item.photo && src && !photoFailed ? { ...item.photo, url: src } : undefined;
  const label = [species.commonName, `observed ${when}`, near, item.credit, photo ? `photo ${photo.attribution}` : null].filter(Boolean).join(', ');

  return (
    <ListRow
      title={species.commonName}
      titleLines={2}
      subtitle={`Observed ${when}${near ? ` · ${near}` : ''}`}
      subtitleLines={2}
      below={
        <View style={styles.below}>
          <Text style={[TypeScale.footnote, { color: theme.textSecondary }]}>{item.credit}</Text>
          {photo ? <Text style={[TypeScale.footnote, { color: theme.textSecondary }]}>{`Photo: ${photo.attribution}`}</Text> : null}
          <View style={styles.open}>
            <Text style={[TypeScale.subheadStrong, styles.openText, { color: theme.tint }]}>View on iNaturalist</Text>
            <Icon name="external" size={15} color={theme.tint} />
          </View>
        </View>
      }
      trailing={
        photo ? (
          <Image
            source={{ uri: photo.url }}
            alt={`Photo of a ${species.commonName}, ${photo.attribution}`}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setPhotoFailed(true)}
            style={[styles.thumb, { backgroundColor: theme.backgroundSelected }]}
          />
        ) : (
          'none'
        )
      }
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Opens the observation on iNaturalist"
      separator={!first}
      inGroup
      onPress={() => onOpenUrl(link)}
    />
  );
}

const styles = StyleSheet.create({
  below: {
    gap: 0,
  },
  open: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s2,
    marginTop: Space.s1,
  },
  openText: {
    textDecorationLine: 'underline',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.sm,
    minWidth: Size.thumb,
  },
});
