import { useMemo, useRef, useState } from 'react';
import { FlatList, Text, View, StyleSheet, type ListRenderItemInfo, type ViewInstance } from 'react-native';

import { BottomBar } from '@/components/dive/bottom-bar';
import { Icon } from '@/components/icon';
import { SpeciesArt } from '@/components/species-art';
import { CARD_GAP, SpeciesCard, onGridLayout, useCardGrid } from '@/components/species-card';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import { List, ListRow } from '@/components/ui/list';
import { SearchField } from '@/components/ui/text-field';
import { OnFill, Radius, Size, Space, TypeScale } from '@/constants/theme';
import { DISMISS_ON_DRAG, useKeyboard } from '@/hooks/use-keyboard';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { CATALOG, CATALOG_BY_ID, UNLISTED_ID, speciesForSighting } from '@/lib/catalog';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/rarity';
import { searchSpecies } from '@/lib/text-search';
import type { Category, DiveSite, Species } from '@/lib/types';

type Row =
  | { kind: 'heading'; key: string; title: string }
  | { kind: 'cards'; key: string; species: Species[] }
  | { kind: 'else'; key: string };

/** "Next", and how many animals are ticked once some are. */
export function nextTitle(count: number): string {
  return count === 0 ? 'Next' : `Next · ${count} ${count === 1 ? 'animal' : 'animals'}`;
}

/**
 * What did you see: the animals as picture cards, three across, common names only. Tap a card to tick
 * it. How rare an animal is shows only in the colour of the card's top edge (the field guide's own);
 * the word is kept for the page after saving. What is usually seen at the site comes first, then what
 * the diver logs often, then everything; "Something else…" is last. The footer always says Next.
 */
export function SpeciesPicker({
  multi,
  selected,
  customName,
  site,
  recentIds,
  allowNone = false,
  onToggle,
  onDone,
}: {
  /** Several can be ticked (a new log, or sightings added to a page); false picks the one animal of an edit. */
  multi: boolean;
  selected: string[];
  customName: string;
  site?: DiveSite;
  recentIds: string[];
  /** A dive can be logged without any animals: "Next" works with nothing ticked. */
  allowNone?: boolean;
  onToggle: (id: string, customName?: string) => void;
  onDone: () => void;
}) {
  // The bar with "Next" is at the foot of this view, and the view is lifted clear of the keyboard.
  const lift = useRef<ViewInstance>(null);
  const keyboard = useKeyboard(lift);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const theme = useTheme();
  const [inner, setInner] = useState(Math.max(0, 393 - 2 * Space.s4));
  const { columns, cardWidth } = useCardGrid(inner);
  const searching = query.trim().length > 0;

  const results = useMemo(() => {
    const pool = category ? CATALOG.filter((s) => s.category === category) : CATALOG;
    return searchSpecies(pool, query);
  }, [query, category]);

  const somethingElseName = searching ? query.trim() : customName;
  const rows = useMemo<Row[]>(() => {
    // Without a search: what's usually seen at this site, then what the diver logs often, then everything.
    const likely = !searching && !category && site ? site.notableSpecies.map((id) => CATALOG_BY_ID.get(id)).filter((s): s is Species => !!s) : [];
    const likelyIds = new Set(likely.map((s) => s.id));
    const recent = !searching && !category ? recentIds.filter((id) => !likelyIds.has(id)).map((id) => CATALOG_BY_ID.get(id)!).filter(Boolean) : [];
    const shownAbove = new Set([...likelyIds, ...recent.map((s) => s.id)]);
    const rest = searching || category ? results : results.filter((s) => !shownAbove.has(s.id));
    const out: Row[] = [];
    const add = (key: string, title: string | null, list: Species[]) => {
      if (list.length === 0) return;
      if (title) out.push({ kind: 'heading', key: `h:${key}`, title });
      for (let i = 0; i < list.length; i += columns) out.push({ kind: 'cards', key: `${key}:${i}`, species: list.slice(i, i + columns) });
    };
    add('likely', site ? `Often seen at ${site.name}` : null, likely);
    add('recent', 'You’ve logged recently', recent);
    add('rest', likely.length > 0 || recent.length > 0 ? 'All animals' : null, rest);
    if (searching && rest.length === 0) out.push({ kind: 'heading', key: 'h:none', title: `Nothing in the catalogue matches “${query.trim()}”.` });
    out.push({ kind: 'else', key: 'else' });
    return out;
  }, [searching, category, site, recentIds, results, columns, query]);

  const count = selected.length;
  const renderItem = ({ item }: ListRenderItemInfo<Row>) => {
    if (item.kind === 'heading') {
      return (
        <Text
          accessibilityRole="header"
          accessibilityLiveRegion={item.key === 'h:none' ? 'polite' : undefined}
          style={[item.key === 'h:none' ? styles.none : styles.groupTitle, { color: item.key === 'h:none' ? theme.textSecondary : theme.text }]}>
          {item.title}
        </Text>
      );
    }
    if (item.kind === 'else') {
      return <SomethingElse name={somethingElseName} multi={multi} checked={selected.includes(UNLISTED_ID)} onPress={() => onToggle(UNLISTED_ID, somethingElseName)} />;
    }
    return (
      <View style={styles.cardRow}>
        {item.species.map((s) => (
          <SpeciesCard
            key={s.id}
            species={s}
            width={cardWidth}
            count={1}
            role={multi ? 'checkbox' : 'button'}
            selected={selected.includes(s.id)}
            accessibilityLabel={s.commonName}
            onPress={() => onToggle(s.id)}
          />
        ))}
      </View>
    );
  };

  return (
    <View ref={lift} collapsable={false} style={{ flex: 1, paddingBottom: keyboard.overlap }}>
      <View style={styles.top}>
        <Text accessibilityRole="header" style={[styles.question, { color: theme.text }]}>
          What did you see?
        </Text>
        <SearchField
          accessibilityLabel="Search animals"
          value={query}
          onChangeText={setQuery}
          placeholder="Search: manta, nudibranch, turtle…"
        />
        <ChipRow accessibilityLabel="Filter by group">
          {CATEGORY_ORDER.map((cat) => (
            <Chip
              key={cat}
              label={CATEGORY_LABEL[cat]}
              accessibilityLabel={`${CATEGORY_LABEL[cat]} only`}
              selected={category === cat}
              onPress={() => setCategory(category === cat ? null : cat)}
            />
          ))}
        </ChipRow>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderItem}
        onLayout={onGridLayout((width) => setInner(width - 2 * Space.s4))}
        extraData={selected}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={DISMISS_ON_DRAG}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={9}
        contentContainerStyle={styles.list}
      />
      {multi ? (
        <BottomBar keyboardOpen={keyboard.open}>
          <Button title={nextTitle(count)} onPress={onDone} disabled={count === 0 && !allowNone} />
        </BottomBar>
      ) : null}
    </View>
  );
}

function SomethingElse({ name, multi, checked, onPress }: { name: string; multi: boolean; checked: boolean; onPress: () => void }) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const species = speciesForSighting({ speciesId: UNLISTED_ID, customName: name })!;
  const title = name ? `Something else: “${name}”` : 'Something else…';
  return (
    <List>
      <ListRow
        title={title}
        titleLines={2}
        subtitle="Not in the catalogue? Name it yourself"
        subtitleLines={2}
        accessibilityLabel={`${title}. Not in the catalogue? Log it in your own words`}
        accessibilityRole={multi ? 'checkbox' : 'button'}
        selected={checked}
        leading={
          <View style={[styles.elseIcon, { backgroundColor: theme.backgroundSelected }]}>
            <SpeciesArt species={species} width={Size.thumb} />
          </View>
        }
        trailing={
          multi ? (
            <View
              style={[styles.check, { borderColor: checked ? theme.lagoon : theme.textTertiary, backgroundColor: checked ? theme.lagoon : 'transparent' }]}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden>
              {checked ? <Icon name="check" size={14} color={OnFill[scheme].lagoon} weight="bold" /> : null}
            </View>
          ) : (
            'chevron'
          )
        }
        onPress={onPress}
      />
    </List>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: Space.s4, paddingTop: Space.s4, paddingBottom: Space.s2, gap: Space.s3 },
  question: { ...TypeScale.headline },
  list: { paddingHorizontal: Space.s4, paddingBottom: Space.s4, gap: CARD_GAP },
  groupTitle: { ...TypeScale.headline, marginTop: Space.s5 },
  none: { ...TypeScale.callout, marginTop: Space.s2 },
  cardRow: { flexDirection: 'row', gap: CARD_GAP },
  elseIcon: { width: Size.thumb, height: Size.thumb, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  check: { width: 24, height: 24, borderRadius: Radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
