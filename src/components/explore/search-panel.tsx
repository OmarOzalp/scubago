import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { OceanButton } from '@/components/ocean-button';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import type { DiveSite, Species } from '@/lib/types';

import { SEARCH_EXAMPLES, sectionLimit, type ExploreItem, type ExploreResults, type ExploreSection, type Place, type SectionKind } from './search';

/** How a section's matches are counted and named. */
const NOUNS: Record<SectionKind, [one: string, many: string]> = {
  sites: ['dive site', 'dive sites'],
  places: ['place', 'places'],
  animals: ['animal', 'animals'],
};
const count = (n: number, kind: SectionKind) => `${n} ${NOUNS[kind][n === 1 ? 0 : 1]}`;

const EXAMPLE_ICONS: Record<SectionKind, IconName> = { sites: 'pin', places: 'map', animals: 'fieldGuide' };

/** A line of the results: a heading, a match, or the way to see the rest of a section. */
type ListRow =
  | { kind: 'header'; key: string; section: ExploreSection; expanded: boolean }
  | { kind: 'item'; key: string; item: ExploreItem; first: boolean; ruled: boolean }
  | { kind: 'more'; key: string; section: ExploreSection; expanded: boolean };

/**
 * The search results, in sections (dive sites, places, animals), the best-matching section first.
 * Each section shows its first few matches and a "Show all N" row; the first row of all is tinted,
 * as it is the one Return picks. With nothing typed it suggests a search of each kind, and with no
 * match it says so and offers to add the site.
 *
 * The rows are one windowed list (headings, matches and "show all" lines), so "Show all 241 dive
 * sites" in Egypt costs no more than a few.
 */
export function SearchPanel({
  results,
  maxHeight,
  onPickSite,
  onPickPlace,
  onPickSpecies,
  onTry,
  onAddSite,
}: {
  /** What was found, or null while nothing is typed. */
  results: ExploreResults | null;
  maxHeight: number;
  onPickSite: (site: DiveSite) => void;
  onPickPlace: (place: Place) => void;
  onPickSpecies: (species: Species) => void;
  /** A suggestion was tapped: search for it. */
  onTry: (query: string) => void;
  /** "Add it as a dive site", from the no-match message, with what was typed. */
  onAddSite: (name: string) => void;
}) {
  // Which sections are showing all their matches: for the query they were opened on.
  const [opened, setOpened] = useState<{ query: string; kinds: SectionKind[] }>({ query: '', kinds: [] });
  const expandedKinds = results && opened.query === results.query ? opened.kinds : NONE;

  const rows = useMemo<ListRow[]>(() => {
    if (!results) return [];
    const out: ListRow[] = [];
    let first = true;
    results.sections.forEach((section, index) => {
      const expanded = expandedKinds.includes(section.kind);
      const limit = sectionLimit(index, results.sections.length);
      out.push({ kind: 'header', key: `header:${section.kind}`, section, expanded });
      section.items.slice(0, expanded ? undefined : limit).forEach((item, i) => {
        out.push({ kind: 'item', key: `${section.kind}:${item.id}`, item, first, ruled: i > 0 });
        first = false;
      });
      if (section.items.length > limit) out.push({ kind: 'more', key: `more:${section.kind}`, section, expanded });
    });
    return out;
  }, [results, expandedKinds]);

  const headerIndices = useMemo(() => rows.flatMap((row, i) => (row.kind === 'header' ? [i] : [])), [rows]);

  // Read the outcome aloud once typing pauses; sighted divers see the same in the headings.
  const summary = results
    ? results.sections.length > 0
      ? results.sections.map((s) => count(s.items.length, s.kind)).join(', ')
      : `No match for ${results.query.trim()}`
    : null;
  useEffect(() => {
    if (!summary) return;
    const timer = setTimeout(() => announce(summary), 700);
    return () => clearTimeout(timer);
  }, [summary]);

  const toggle = useCallback(
    (kind: SectionKind) => {
      if (!results) return;
      setOpened((prev) => {
        const kinds = prev.query === results.query ? prev.kinds : [];
        return { query: results.query, kinds: kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind] };
      });
    },
    [results],
  );

  const renderItem = useCallback(
    ({ item: row }: ListRenderItemInfo<ListRow>) => {
      if (row.kind === 'header') return <SectionHeading section={row.section} expanded={row.expanded} onToggle={toggle} />;
      if (row.kind === 'more') return <ShowAllRow section={row.section} expanded={row.expanded} onToggle={toggle} />;
      return <MatchRow item={row.item} first={row.first} ruled={row.ruled} onPickSite={onPickSite} onPickPlace={onPickPlace} onPickSpecies={onPickSpecies} />;
    },
    [toggle, onPickSite, onPickPlace, onPickSpecies],
  );

  if (!results) {
    return (
      <Paper raised padded={false} style={[styles.panel, { maxHeight }]}>
        <Suggestions onTry={onTry} />
      </Paper>
    );
  }

  if (results.sections.length === 0) {
    const typed = results.query.trim();
    return (
      <Paper raised padded={false} style={[styles.panel, { maxHeight }]}>
        <View style={styles.empty}>
          <ThemedText type="small" accessibilityLiveRegion="polite">
            Nothing matches “{typed}”.
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            Try a dive site, a place like the Red Sea, or an animal.
          </ThemedText>
          <OceanButton title={`Add “${typed}” as a dive site`} icon="addSite" variant="secondary" onPress={() => onAddSite(typed)} />
        </View>
      </Paper>
    );
  }

  return (
    <Paper raised padded={false} style={[styles.panel, { maxHeight }]}>
      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={rowKey}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={headerIndices}
        initialNumToRender={24}
        maxToRenderPerBatch={12}
        windowSize={7}
      />
    </Paper>
  );
}

const NONE: SectionKind[] = [];
const rowKey = (row: ListRow) => row.key;

/**
 * "Dive sites", with how many matched (or, for animals, the old search's question). A heading to a
 * screen reader. While a section is open in full it carries the way to close it, and sticks to the
 * top as the rows scroll under it, so "Show fewer" is never 200 rows away.
 */
const SectionHeading = memo(function SectionHeading({
  section,
  expanded,
  onToggle,
}: {
  section: ExploreSection;
  expanded: boolean;
  onToggle: (kind: SectionKind) => void;
}) {
  const theme = useTheme();
  const total = section.items.length;
  const matches = `${total} ${total === 1 ? 'match' : 'matches'}`;
  const animals = section.kind === 'animals';
  return (
    <View style={[styles.heading, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="label" accessibilityRole="header" accessibilityLabel={`${section.title}, ${animals ? 'where can I see a, ' : ''}${matches}`}>
        {section.title}
      </ThemedText>
      {expanded ? (
        <Pressable
          onPress={() => onToggle(section.kind)}
          accessibilityRole="button"
          accessibilityLabel={`Show fewer ${NOUNS[section.kind][1]}`}
          accessibilityState={{ expanded }}
          style={styles.fewer}>
          <Text style={[styles.moreText, { color: theme.tint }]}>Show fewer</Text>
        </Pressable>
      ) : (
        // The old search's question stays as the animals' subtitle. The heading's label says it all.
        <ThemedText
          type="caption"
          themeColor="textSecondary"
          numberOfLines={1}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.headingNote}>
          {animals ? 'Where can I see a…' : matches}
        </ThemedText>
      )}
    </View>
  );
});

/** One match: a dive site, a place or an animal. */
const MatchRow = memo(function MatchRow({
  item,
  first,
  ruled,
  onPickSite,
  onPickPlace,
  onPickSpecies,
}: {
  item: ExploreItem;
  first: boolean;
  ruled: boolean;
  onPickSite: (site: DiveSite) => void;
  onPickPlace: (place: Place) => void;
  onPickSpecies: (species: Species) => void;
}) {
  if (item.kind === 'site') {
    const { site } = item;
    return (
      <ResultRow
        first={first}
        ruled={ruled}
        leading={<Tile icon="pin" />}
        title={site.name}
        subtitle={`${site.region}, ${site.country}`}
        trailing="chevronRight"
        accessibilityLabel={`${site.name}, ${site.region}, ${site.country}`}
        accessibilityHint="Selects this dive site"
        onPress={() => onPickSite(site)}
      />
    );
  }
  if (item.kind === 'place') {
    const { place } = item;
    const sites = count(place.siteIds.length, 'sites');
    return (
      <ResultRow
        first={first}
        ruled={ruled}
        leading={<Tile icon="map" />}
        title={place.name}
        subtitle={`${place.detail} · ${sites}`}
        trailing="chevronRight"
        accessibilityLabel={`${place.name}, ${place.detail}, ${sites}`}
        accessibilityHint={`Shows only the dive sites in ${place.name}`}
        onPress={() => onPickPlace(place)}
      />
    );
  }
  const { species } = item;
  return (
    <ResultRow
      first={first}
      ruled={ruled}
      leading={<SpeciesAvatar species={species} size={40} showRarityRing />}
      title={species.commonName}
      subtitle={species.scientificName}
      italicSubtitle
      trailing="pin"
      accessibilityLabel={`${species.commonName}. Show where it’s seen`}
      onPress={() => onPickSpecies(species)}
    />
  );
});

function ResultRow({
  first,
  ruled,
  leading,
  title,
  subtitle,
  italicSubtitle = false,
  trailing,
  accessibilityLabel,
  accessibilityHint,
  onPress,
}: {
  first: boolean;
  ruled: boolean;
  leading: ReactNode;
  title: string;
  subtitle: string;
  italicSubtitle?: boolean;
  trailing: IconName;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.row,
        ruled && { borderTopWidth: 1, borderTopColor: theme.rule },
        // The first row is the one Return picks.
        first && { backgroundColor: `${theme.backgroundSelected}99` },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      {leading}
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.text }]}>
          {title}
        </Text>
        {italicSubtitle ? (
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.rowSub}>
            {subtitle}
          </ThemedText>
        ) : (
          // Two lines: two sites can share a name (Cod Hole) and differ only in the region.
          <Text numberOfLines={2} style={[styles.rowWhere, { color: theme.textSecondary }]}>
            {subtitle}
          </Text>
        )}
      </View>
      <Icon
        name={trailing}
        size={trailing === 'pin' ? 18 : 16}
        color={theme.textSecondary}
        weight={trailing === 'pin' ? 'duotone' : 'bold'}
        wash={trailing === 'pin' ? theme.coral : undefined}
        washOpacity={0.35}
      />
    </Pressable>
  );
}

/** The 40-point square a dive site or place sits in, where an animal has its plate. */
function Tile({ icon }: { icon: IconName }) {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: theme.backgroundSelected }]}>
      <Icon name={icon} size={20} />
    </View>
  );
}

/** "Show all 43 dive sites" under a section's first few, and "Show fewer" once it is open. */
const ShowAllRow = memo(function ShowAllRow({
  section,
  expanded,
  onToggle,
}: {
  section: ExploreSection;
  expanded: boolean;
  onToggle: (kind: SectionKind) => void;
}) {
  const theme = useTheme();
  const title = expanded ? 'Show fewer' : `Show all ${count(section.items.length, section.kind)}`;
  return (
    <Pressable
      onPress={() => onToggle(section.kind)}
      accessibilityRole="button"
      accessibilityLabel={expanded ? `Show fewer ${NOUNS[section.kind][1]}` : title}
      accessibilityState={{ expanded }}
      style={({ pressed }) => [styles.more, { borderTopColor: theme.rule }, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <Text style={[styles.moreText, { color: theme.tint }]}>{title}</Text>
      <Icon name="chevronDown" size={16} color={theme.tint} weight="bold" style={expanded ? styles.flipped : undefined} />
    </Pressable>
  );
});

/** Shown while nothing is typed: one search of each kind to tap. */
function Suggestions({ onTry }: { onTry: (query: string) => void }) {
  const theme = useTheme();
  return (
    <View>
      <View style={styles.heading}>
        <ThemedText type="label" accessibilityRole="header">
          Try searching for
        </ThemedText>
      </View>
      {SEARCH_EXAMPLES.map((example, i) => (
        <Pressable
          key={example.query}
          onPress={() => onTry(example.query)}
          accessibilityRole="button"
          accessibilityLabel={`${example.query}. ${example.note}`}
          style={({ pressed }) => [
            styles.row,
            i > 0 && { borderTopWidth: 1, borderTopColor: theme.rule },
            pressed && { backgroundColor: theme.backgroundSelected },
          ]}>
          <Tile icon={EXAMPLE_ICONS[example.kind]} />
          <View style={styles.rowText}>
            <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.text }]}>
              {example.query}
            </Text>
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.rowSub}>
              {example.note}
            </ThemedText>
          </View>
          <Icon name="search" size={16} color={theme.textSecondary} weight="bold" />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: 'hidden',
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 32,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headingNote: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  // 44 points to press, in a heading that is 32 high.
  fewer: {
    minHeight: 44,
    minWidth: 44,
    marginVertical: -6,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: Type.bodyHeavy,
    fontSize: 15,
    lineHeight: 20,
  },
  rowSub: {
    fontSize: 14,
    lineHeight: 19,
  },
  rowWhere: {
    fontFamily: Type.body,
    fontSize: 14,
    lineHeight: 19,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingLeft: 66,
    paddingRight: 14,
    borderTopWidth: 1,
  },
  moreText: {
    fontFamily: Type.bodyBold,
    fontSize: 14,
  },
  flipped: {
    transform: [{ rotate: '180deg' }],
  },
  empty: {
    gap: 8,
    padding: 16,
  },
});
