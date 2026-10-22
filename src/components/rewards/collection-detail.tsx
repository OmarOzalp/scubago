import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Paper } from '@/components/journal/paper';
import { ProgressRing } from '@/components/journal/progress-ring';
import { SectionHeader } from '@/components/journal/screen';
import { Stamp } from '@/components/journal/stamp';
import { longDate } from '@/components/rewards/format';
import { SpeciesCard } from '@/components/species-card';
import { ThemedText } from '@/components/themed-text';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
import type { CollectionKind, CollectionResult } from '@/lib/rewards';
import type { Species } from '@/lib/types';

const GAP = 10;
const KIND_LABEL: Record<CollectionKind, string> = { area: 'Habitat', family: 'Family', curated: 'Special set' };

/** One collection in full: where the diver stands, then the animals found and the ones still to find. */
export function CollectionDetailView({
  collection,
  counts,
  onOpenSpecies,
}: {
  collection: CollectionResult;
  /** Times each species has been logged, so a plate can say "seen 3 times". */
  counts: ReadonlyMap<string, number>;
  onOpenSpecies?: (speciesId: string) => void;
}) {
  const theme = useTheme();
  // The column's width, measured: a phone's to begin with (the static web render has no window).
  const [inner, setInner] = useState(358);
  const columns = Math.max(3, Math.min(6, Math.floor(inner / 150)));
  const cardWidth = Math.floor((inner - GAP * (columns - 1)) / columns);
  const species = (ids: readonly string[]) => ids.map((id) => CATALOG_BY_ID.get(id)).filter((s): s is Species => !!s);
  // Each section keeps the collection's own order (`memberIds`).
  const foundIds = new Set(collection.foundIds);
  const found = species(collection.memberIds.filter((id) => foundIds.has(id)));
  const missing = species(collection.memberIds.filter((id) => !foundIds.has(id)));
  return (
    <View style={styles.view}>
      <View style={styles.head}>
        <View style={styles.titles}>
          <ThemedText type="label">{KIND_LABEL[collection.kind]}</ThemedText>
          <ThemedText type="display" accessibilityRole="header">
            {collection.title}
          </ThemedText>
        </View>
      </View>
      <ThemedText>{collection.description}</ThemedText>

      <Paper raised style={styles.standing}>
        <ProgressRing
          fraction={collection.total > 0 ? collection.found / collection.total : 0}
          size={76}
          color={collection.completed ? theme.sun : undefined}
          accessibilityLabel={`${collection.found} of ${collection.total} found`}
        />
        <View style={styles.standingText}>
          <Text style={[styles.count, { color: theme.text }]}>
            {collection.found} of {collection.total} found
          </Text>
          {collection.completed ? (
            <ThemedText type="small" themeColor="textSecondary">
              {collection.completedOn ? `Completed ${longDate(collection.completedOn)}.` : 'Completed.'}
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {collection.hint ? `${collection.hint[0].toUpperCase()}${collection.hint.slice(1)} to go.` : ''}
            </ThemedText>
          )}
        </View>
        {collection.completed ? <Stamp lines={['Complete']} color={theme.tint} rotate={-8} animate /> : null}
      </Paper>

      <View onLayout={(e) => setInner(Math.floor(e.nativeEvent.layout.width))} style={styles.sections}>
        {found.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Found" eyebrow={`${found.length} of ${collection.total}`} />
            <View style={styles.grid}>
              {found.map((s) => (
                <SpeciesCard key={s.id} species={s} width={cardWidth} count={Math.max(1, counts.get(s.id) ?? 1)} onPress={() => onOpenSpecies?.(s.id)} />
              ))}
            </View>
          </View>
        ) : null}
        {missing.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Still to find" eyebrow={`${missing.length} to go`} />
            <ThemedText type="caption" themeColor="textSecondary">
              The pencil sketches are painted in once you log them.
            </ThemedText>
            <View style={styles.grid}>
              {missing.map((s) => (
                <SpeciesCard key={s.id} species={s} width={cardWidth} count={0} onPress={() => onOpenSpecies?.(s.id)} />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  view: {
    gap: 18,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  standing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  standingText: {
    flex: 1,
    gap: 2,
  },
  count: {
    fontFamily: Type.display,
    fontSize: 22,
    lineHeight: 28,
  },
  sections: {
    gap: 20,
  },
  section: {
    gap: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
});
