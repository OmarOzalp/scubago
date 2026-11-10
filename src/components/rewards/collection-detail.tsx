import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Stamp } from '@/components/journal/stamp';
import { longDate } from '@/components/rewards/format';
import { CARD_GAP, onGridLayout, SpeciesCard, useCardGrid } from '@/components/species-card';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Section } from '@/components/ui/screen';
import { Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
import type { CollectionKind, CollectionResult } from '@/lib/rewards';
import type { Species } from '@/lib/types';

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
  const { cardWidth } = useCardGrid(inner);
  const species = (ids: readonly string[]) => ids.map((id) => CATALOG_BY_ID.get(id)).filter((s): s is Species => !!s);
  // Each section keeps the collection's own order (`memberIds`).
  const foundIds = new Set(collection.foundIds);
  const found = species(collection.memberIds.filter((id) => foundIds.has(id)));
  const missing = species(collection.memberIds.filter((id) => !foundIds.has(id)));
  const fraction = collection.total > 0 ? collection.found / collection.total : 0;
  return (
    <View style={styles.view}>
      <View style={styles.titles}>
        <ThemedText type="footnoteStrong" themeColor="textSecondary">
          {KIND_LABEL[collection.kind]}
        </ThemedText>
        <ThemedText type="display" accessibilityRole="header">
          {collection.title}
        </ThemedText>
      </View>
      <ThemedText>{collection.description}</ThemedText>

      <Card style={styles.standing}>
        <ProgressRing
          fraction={fraction}
          size={72}
          color={collection.completed ? theme.sun : undefined}
          label={`${Math.round(fraction * 100)}%`}
          accessibilityLabel={`${collection.found} of ${collection.total} found${collection.hint && !collection.completed ? `, ${collection.hint} to go` : ''}`}
        />
        <View style={styles.standingText}>
          <Text style={[TypeScale.figure, { color: theme.text }]}>
            {collection.found} of {collection.total} found
          </Text>
          {collection.completed ? (
            <ThemedText type="subhead" themeColor="textSecondary">
              {collection.completedOn ? `Completed ${longDate(collection.completedOn)}.` : 'Completed.'}
            </ThemedText>
          ) : null}
        </View>
        {collection.completed ? <Stamp lines={['Complete']} color={theme.tint} rotate={-8} animate /> : null}
      </Card>

      <View onLayout={onGridLayout(setInner)} style={styles.sections}>
        {found.length > 0 ? (
          <Section title="Found">
            <View style={styles.grid}>
              {found.map((s) => (
                <SpeciesCard key={s.id} species={s} width={cardWidth} count={Math.max(1, counts.get(s.id) ?? 1)} onPress={() => onOpenSpecies?.(s.id)} />
              ))}
            </View>
          </Section>
        ) : null}
        {missing.length > 0 ? (
          <Section title="Still to find">
            <View style={styles.grid}>
              {missing.map((s) => (
                <SpeciesCard key={s.id} species={s} width={cardWidth} count={0} onPress={() => onOpenSpecies?.(s.id)} />
              ))}
            </View>
          </Section>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  view: {
    gap: Space.s4,
  },
  titles: {
    gap: Space.s1,
  },
  standing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s4,
  },
  standingText: {
    flex: 1,
    gap: Space.s1,
  },
  sections: {
    gap: Space.s4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
});
