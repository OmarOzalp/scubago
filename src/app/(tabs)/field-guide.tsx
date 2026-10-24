import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Chip } from '@/components/journal/chip';
import { Screen, SectionHeader } from '@/components/journal/screen';
import { Segmented } from '@/components/segmented';
import { CARD_GAP, SpeciesCard, useCardGrid } from '@/components/species-card';
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

type Status = 'all' | 'seen' | 'unseen';
const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'seen', label: 'Seen' },
  { value: 'unseen', label: 'Not yet seen' },
];

/** Every species in the catalogue, by group: drawn in colour once seen, in pencil until then. */
export default function FieldGuideScreen() {
  const mySightings = useMySightings();
  // The column's width, measured: a phone's to begin with (the static web render has no window).
  const [inner, setInner] = useState(358);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [status, setStatus] = useState<Status>('all');
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
  const keep = (s: Species) => (filter === 'all' || s.category === filter) && (status === 'all' || dexById.has(s.id) === (status === 'seen'));
  const found = typed ? searchSpecies(CATALOG, typed).filter(keep) : null;
  const sections = found
    ? []
    : groups.map(({ cat, species }) => ({ cat, species, listed: species.filter(keep) })).filter((g) => g.listed.length > 0);
  const listedCount = found ? found.length : sections.reduce((n, g) => n + g.listed.length, 0);
  const narrowed = typed !== '' || filter !== 'all' || status !== 'all';

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
      <View style={styles.head}>
        <CollectionsLink />
        <ThemedText type="display" accessibilityRole="header">
          {`${dex.length} of ${CATALOG.length} species`}
        </ThemedText>
      </View>

      <View style={styles.controls}>
        <SearchField value={query} onChange={setQuery} />
        <Segmented accessibilityLabel="Show species" kind="choice" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel="Filter by group"
          style={styles.chipsScroll}
          contentContainerStyle={styles.chips}>
          {/* No "All" chip: the toggle above has one. A chip that is on turns off when it is tapped again. */}
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
        <ThemedText type="caption" themeColor="textSecondary">
          Species you log are painted in.
        </ThemedText>
      ) : null}

      {/* Said aloud as it changes, so someone who can't see the grid hears what the filters did. */}
      {narrowed ? (
        <ThemedText type="caption" themeColor="textSecondary" accessibilityLiveRegion="polite">
          {listedCount === 0 ? emptyMessage(typed, status) : `Showing ${listedCount} of ${CATALOG.length} species`}
        </ThemedText>
      ) : null}

      <View style={styles.sections} onLayout={(e) => setInner(Math.floor(e.nativeEvent.layout.width))}>
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

/**
 * The way to the collections, where the page's eyebrow used to be: a small link at the top right.
 * It is 44 points to hit, and its margins give the extra back, so it costs the page one line.
 */
function CollectionsLink() {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/rewards', params: { tab: 'collections' } })}
      accessibilityRole="link"
      accessibilityLabel="Collections"
      accessibilityHint="Opens your collections"
      style={({ pressed }) => [styles.collections, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold" themeColor="tint">
        Collections
      </ThemedText>
      <Icon name="chevronRight" size={14} color={theme.tint} weight="bold" />
    </Pressable>
  );
}

/** What the guide says when the filters leave nothing: the search first, else the seen toggle (the group chips always have species). */
function emptyMessage(typed: string, status: Status): string {
  if (typed) return `Nothing matches “${typed}”${status === 'all' ? '' : ` among the ${status === 'seen' ? 'seen' : 'unseen'} species`}.`;
  return status === 'seen' ? 'You haven’t seen any of these yet. Log a dive and the ones you meet show up here.' : 'You’ve seen every one of these.';
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
  head: {
    gap: 2,
  },
  collections: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    marginVertical: -12,
    paddingLeft: 12,
    paddingRight: 4,
    borderRadius: Radius.sm,
  },
  // The search, the toggle and the chips belong together, so they sit closer than the page's other blocks.
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
