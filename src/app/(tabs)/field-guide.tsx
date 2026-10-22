import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/journal/chip';
import { LinkRow } from '@/components/journal/link-row';
import { ProgressRing } from '@/components/journal/progress-ring';
import { Screen, ScreenHeader, SectionHeader } from '@/components/journal/screen';
import { collectionsLine, summarize } from '@/components/rewards/summary';
import { SpeciesCard } from '@/components/species-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useRewards } from '@/hooks/use-rewards';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import { deriveDex } from '@/lib/dex';
import { CATEGORY_LABEL, CATEGORY_ORDER, rarityRank } from '@/lib/rarity';
import { localIsoDate, shiftIsoDate } from '@/lib/sighting-edit';
import { useMySightings } from '@/lib/store';
import type { Category, Species } from '@/lib/types';

const GAP = 10;
/** First seen within this many days: a "New" ribbon. */
const NEW_DAYS = 7;

/** Every species in the catalogue, by group: drawn in colour once seen, in pencil until then. */
export default function FieldGuideScreen() {
  const mySightings = useMySightings();
  const rewards = useRewards();
  const setsLine = useMemo(() => collectionsLine(summarize(rewards)), [rewards]);
  // The column's width, measured: a phone's to begin with (the static web render has no window).
  const [inner, setInner] = useState(358);
  const [filter, setFilter] = useState<Category | 'all'>('all');

  const dex = useMemo(() => deriveDex(mySightings, CATALOG_BY_ID), [mySightings]);
  const dexById = useMemo(() => new Map(dex.map((d) => [d.species.id, d])), [dex]);
  const newSince = shiftIsoDate(localIsoDate(new Date()), -NEW_DAYS);

  const groups = useMemo(() => {
    const byCategory = new Map<Category, Species[]>();
    for (const cat of CATEGORY_ORDER) byCategory.set(cat, []);
    for (const s of CATALOG) byCategory.get(s.category)?.push(s);
    for (const list of byCategory.values()) list.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
    return CATEGORY_ORDER.map((cat) => ({ cat, species: byCategory.get(cat) ?? [] })).filter((g) => g.species.length > 0);
  }, []);
  const shown = filter === 'all' ? groups : groups.filter((g) => g.cat === filter);

  // Three cards a row on a phone, more on a wide screen.
  const columns = Math.max(3, Math.min(6, Math.floor(inner / 150)));
  const cardWidth = Math.floor((inner - GAP * (columns - 1)) / columns);

  return (
    <Screen tab>
      <ScreenHeader
        eyebrow="Your field guide"
        title={`${dex.length} of ${CATALOG.length} species`}
        accessory={<ProgressRing fraction={dex.length / CATALOG.length} accessibilityLabel={`${Math.round((dex.length / CATALOG.length) * 100)} percent of the field guide seen`} />}
      />

      <LinkRow icon="medal" title="Collections" detail={rewards.ready ? setsLine : undefined} role="link" onPress={() => router.push({ pathname: '/rewards', params: { tab: 'collections' } })} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel="Filter by group"
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}>
        <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        {groups.map(({ cat }) => (
          <Chip key={cat} label={CATEGORY_LABEL[cat]} selected={filter === cat} onPress={() => setFilter(cat)} />
        ))}
      </ScrollView>

      {dex.length === 0 ? (
        <ThemedText type="caption" themeColor="textSecondary">
          Every species starts as a pencil sketch. Log a dive and the ones you meet are painted in.
        </ThemedText>
      ) : null}

      <View style={styles.sections} onLayout={(e) => setInner(Math.floor(e.nativeEvent.layout.width))}>
        {shown.map(({ cat, species }) => {
          const seenCount = species.filter((s) => dexById.has(s.id)).length;
          return (
            <View key={cat} style={styles.section}>
              <SectionHeader
                title={CATEGORY_LABEL[cat]}
                accessory={
                  <ThemedText type="label" accessibilityLabel={`${seenCount} of ${species.length} seen`}>
                    {seenCount} / {species.length}
                  </ThemedText>
                }
              />
              <View style={styles.grid}>
                {species.map((s) => {
                  const entry = dexById.get(s.id);
                  return (
                    <SpeciesCard
                      key={s.id}
                      species={s}
                      width={cardWidth}
                      count={entry?.count ?? 0}
                      isNew={!!entry && entry.firstSeenOn > newSince}
                      onPress={() => router.push(`/species/${s.id}`)}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipsScroll: {
    marginHorizontal: -Spacing.three,
    flexGrow: 0,
  },
  chips: {
    gap: 8,
    paddingHorizontal: Spacing.three,
  },
  sections: {
    gap: 18,
  },
  section: {
    gap: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
});
