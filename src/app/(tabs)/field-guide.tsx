import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Chip } from '@/components/journal/chip';
import { Screen, SectionHeader } from '@/components/journal/screen';
import { BadgesTab, SetsTab } from '@/components/rewards/collection-tabs';
import { Segmented } from '@/components/segmented';
import { CARD_GAP, onGridLayout, SpeciesCard, useCardGrid } from '@/components/species-card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import { deriveDex } from '@/lib/dex';
import { CATEGORY_LABEL, CATEGORY_ORDER, rarityRank } from '@/lib/rarity';
import { localIsoDate, shiftIsoDate } from '@/lib/sighting-edit';
import { useMySightings } from '@/lib/store';
import { searchSpecies } from '@/lib/text-search';
import type { Category, Species } from '@/lib/types';

/** First seen within this many days: a "New" ribbon. */
const NEW_DAYS = 7;

/** The three views of one collection. */
type View_ = 'animals' | 'sets' | 'badges';
const VIEWS: { value: View_; label: string }[] = [
  { value: 'animals', label: 'Animals' },
  { value: 'sets', label: 'Sets' },
  { value: 'badges', label: 'Badges' },
];
const asView = (v: unknown): View_ => (v === 'sets' || v === 'badges' ? v : 'animals');

/** One row of chips: the animals you have seen, all of them, or one group. */
type Filter = 'seen' | 'all' | Category;

/**
 * The field guide: Animals (every species in the catalogue, by group: drawn in colour once seen, in pencil
 * until then), Sets (collections of animals) and Badges. `?view=sets` or `?view=badges` opens on one of them.
 */
export default function FieldGuideScreen() {
  const { view: asked } = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<View_>(asView(asked));
  // The guide is a tab, kept mounted: a link to one of its views (the old Rewards screen's) arrives as a new param.
  const [seenAsk, setSeenAsk] = useState(asked);
  if (asked !== seenAsk) {
    setSeenAsk(asked);
    if (asked !== undefined) setView(asView(asked));
  }
  return view === 'animals' ? <AnimalsView view={view} onView={setView} /> : <OtherView view={view} onView={setView} />;
}

function Heading({ view, onView, species }: { view: View_; onView: (v: View_) => void; species: number }) {
  return (
    <>
      <ThemedText type="display" accessibilityRole="header">
        {`${species} of ${CATALOG.length} species`}
      </ThemedText>
      <Segmented accessibilityLabel="Show" value={view} onChange={onView} options={VIEWS} />
    </>
  );
}

/** Sets and Badges, under the same heading. */
function OtherView({ view, onView }: { view: View_; onView: (v: View_) => void }) {
  const mySightings = useMySightings();
  const seen = useMemo(() => deriveDex(mySightings, CATALOG_BY_ID).length, [mySightings]);
  return (
    <Screen tab>
      <Heading view={view} onView={onView} species={seen} />
      {view === 'sets' ? <SetsTab /> : <BadgesTab />}
    </Screen>
  );
}

function AnimalsView({ view, onView }: { view: View_; onView: (v: View_) => void }) {
  const mySightings = useMySightings();
  // The column's width, measured: a phone's to begin with (the static web render has no window).
  const [inner, setInner] = useState(358);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

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

  // The group chips, the seen toggle and the search narrow together. A search lists what it found in
  // one grid, best match first: once the diver has typed a name, the groups' order is no use to them.
  const typed = query.trim();
  const keep = (s: Species) => (filter === 'all' ? true : filter === 'seen' ? dexById.has(s.id) : s.category === filter);
  const found = typed ? searchSpecies(CATALOG, typed).filter(keep) : null;
  const sections = found
    ? []
    : groups.map(({ cat, species }) => ({ cat, species, listed: species.filter(keep) })).filter((g) => g.listed.length > 0);
  const listedCount = found ? found.length : sections.reduce((n, g) => n + g.listed.length, 0);
  const narrowed = typed !== '' || filter !== 'all';

  // Three cards a row on a phone (two at a large text size), more on a wide screen.
  const { cardWidth } = useCardGrid(inner);

  const card = (s: Species) => {
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
  };

  return (
    <Screen tab keyboardDismissMode="on-drag">
      <Heading view={view} onView={onView} species={dex.length} />

      <View style={styles.controls}>
        <SearchField value={query} onChange={setQuery} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel="Filter animals"
          style={styles.chipsScroll}
          contentContainerStyle={styles.chips}>
          {/* One row: Seen, All, then the groups. A chip that is on turns off (to All) when it is tapped again. */}
          <Chip label="Seen" selected={filter === 'seen'} onPress={() => setFilter(filter === 'seen' ? 'all' : 'seen')} />
          <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
          {groups.map(({ cat }) => (
            <Chip
              key={cat}
              label={CATEGORY_LABEL[cat]}
              selected={filter === cat}
              accessibilityHint={filter === cat ? 'Shows every group again' : undefined}
              onPress={() => setFilter(filter === cat ? 'all' : cat)}
            />
          ))}
        </ScrollView>
      </View>

      {dex.length === 0 && !narrowed ? (
        <ThemedText type="small" themeColor="textSecondary">
          Animals you log appear here.
        </ThemedText>
      ) : null}

      {/* Said aloud as it changes, so someone who can't see the grid hears what the filters did. */}
      {narrowed ? (
        <ThemedText type="caption" themeColor="textSecondary" accessibilityLiveRegion="polite">
          {listedCount === 0 ? emptyMessage(typed, filter) : `Showing ${listedCount} of ${CATALOG.length} species`}
        </ThemedText>
      ) : null}

      <View style={styles.sections} onLayout={onGridLayout(setInner)}>
        {found ? <View style={styles.grid}>{found.map(card)}</View> : null}
        {sections.map(({ cat, species, listed }) => {
          // The count is of the whole group, not of what the filters leave of it.
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
              <View style={styles.grid}>{listed.map(card)}</View>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

/** What the guide says when the filters leave nothing: the search first, else the Seen chip (the group chips always have species). */
function emptyMessage(typed: string, filter: Filter): string {
  if (typed) return `Nothing matches “${typed}”${filter === 'seen' ? ' among the animals you have seen' : ''}.`;
  return 'You haven’t seen any of these yet. Log a dive and the ones you meet show up here.';
}

/** A search box over the species: a magnifier, the field, and a button to clear it (44pt, since the field is small). */
function SearchField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: focused ? theme.tint : theme.rule }]}>
      <Icon name="search" size={20} color={focused ? theme.tint : theme.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel="Search the field guide"
        placeholder="Search by name"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={[styles.searchInput, { color: theme.text }]}
      />
      {value ? (
        <Pressable
          onPress={() => onChange('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={({ pressed }) => [styles.clear, { opacity: pressed ? 0.6 : 1 }]}>
          <Icon name="close" size={16} color={theme.textSecondary} weight="bold" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The search and the chips belong together, so they sit closer than the page's other blocks.
  controls: {
    gap: 10,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingLeft: 14,
    paddingRight: 4,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    fontFamily: Type.body,
    fontSize: 16,
    // The box round it takes the lagoon edge while typing, which is its focus ring: the web's own
    // would draw a second, black one inside it.
    outlineWidth: 0,
  },
  clear: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    gap: CARD_GAP,
  },
});
