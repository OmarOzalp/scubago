import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { distanceLabel, inatUrl, isIsoDate, photoUrl, RECENT_SHOWN } from '@/components/sightings/format';
import { formatDate } from '@/components/sighting-row';
import { Radius, Type } from '@/constants/theme';
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
    <Paper padded={false} style={styles.paper}>
      {rows.map((item, index) => (
        <ObservationRow key={item.observationId} item={item} first={index === 0} onOpenUrl={onOpenUrl} />
      ))}
    </Paper>
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
  const label = [
    species.commonName,
    `observed ${when}`,
    near,
    item.credit,
    photo ? `photo ${photo.attribution}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={() => onOpenUrl(link)}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Opens the observation on iNaturalist"
      style={({ pressed }) => [
        styles.row,
        { borderTopColor: theme.rule, borderTopWidth: first ? 0 : 1, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
      ]}>
      <View style={styles.body}>
        <Text style={[styles.name, { color: theme.text }]}>{species.commonName}</Text>
        <Text style={[styles.meta, { color: theme.text }]}>{`Observed ${when}${near ? ` · ${near}` : ''}`}</Text>
        <Text style={[styles.credit, { color: theme.textSecondary }]}>{item.credit}</Text>
        {photo ? <Text style={[styles.credit, { color: theme.textSecondary }]}>{`Photo: ${photo.attribution}`}</Text> : null}
        <View style={styles.open}>
          <Text style={[styles.openText, { color: theme.tint }]}>View on iNaturalist</Text>
          <Icon name="external" size={15} color={theme.tint} />
        </View>
      </View>
      {photo ? (
        <Image
          source={{ uri: photo.url }}
          alt={`Photo of a ${species.commonName}, ${photo.attribution}`}
          contentFit="cover"
          cachePolicy="memory-disk"
          onError={() => setPhotoFailed(true)}
          style={[styles.thumb, { borderColor: theme.rule, backgroundColor: theme.backgroundSelected }]}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  paper: {
    overflow: 'hidden',
  },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  body: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontFamily: Type.bodyHeavy,
    fontSize: 16,
    lineHeight: 21,
  },
  meta: {
    fontFamily: Type.body,
    fontSize: 14,
    lineHeight: 19,
  },
  credit: {
    fontFamily: Type.body,
    fontSize: 13,
    lineHeight: 18,
  },
  open: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  openText: {
    fontFamily: Type.bodyBold,
    fontSize: 14,
    lineHeight: 19,
    textDecorationLine: 'underline',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
});
