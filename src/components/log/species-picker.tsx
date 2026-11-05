import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, type ListRenderItemInfo, type ViewInstance } from 'react-native';

import { BottomBar } from '@/components/dive/bottom-bar';
import { FormField } from '@/components/form-field';
import { Icon } from '@/components/icon';
import { Chip } from '@/components/journal/chip';
import { PaperButton } from '@/components/journal/paper';
import { OceanButton } from '@/components/ocean-button';
import { SpeciesArt } from '@/components/species-art';
import { CARD_GAP, onGridLayout, useCardGrid } from '@/components/species-card';
import { ThemedText } from '@/components/themed-text';
import { OnFill, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { DISMISS_ON_DRAG, useKeyboard } from '@/hooks/use-keyboard';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { CATALOG, CATALOG_BY_ID, UNLISTED_ID, speciesForSighting } from '@/lib/catalog';
import { CATEGORY_LABEL, CATEGORY_ORDER, RARITY_COLOR } from '@/lib/rarity';
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
  const [inner, setInner] = useState(Math.max(0, 393 - 2 * Spacing.three));
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
        <ThemedText type="smallBold" accessibilityRole="header" accessibilityLiveRegion={item.key === 'h:none' ? 'polite' : undefined} themeColor="textSecondary" style={styles.groupTitle}>
          {item.title}
        </ThemedText>
      );
    }
    if (item.kind === 'else') {
      return <SomethingElse name={somethingElseName} multi={multi} checked={selected.includes(UNLISTED_ID)} onPress={() => onToggle(UNLISTED_ID, somethingElseName)} />;
    }
    return (
      <View style={styles.cardRow}>
        {item.species.map((s) => (
          <PickCard key={s.id} species={s} width={cardWidth} multi={multi} checked={selected.includes(s.id)} onPress={() => onToggle(s.id)} />
        ))}
      </View>
    );
  };

  return (
    <View ref={lift} collapsable={false} style={{ flex: 1, paddingBottom: keyboard.overlap }}>
      <View style={styles.top}>
        <ThemedText type="heading" accessibilityRole="header">
          What did you see?
        </ThemedText>
        <FormField
          label="Search animals"
          labelHidden
          value={query}
          onChangeText={setQuery}
          placeholder="Search: manta, nudibranch, turtle…"
          autoCorrect={false}
          returnKeyType="search"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips} accessibilityLabel="Filter by group">
          {CATEGORY_ORDER.map((cat) => (
            <Chip
              key={cat}
              label={CATEGORY_LABEL[cat]}
              accessibilityLabel={`${CATEGORY_LABEL[cat]} only`}
              selected={category === cat}
              onPress={() => setCategory(category === cat ? null : cat)}
            />
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderItem}
        onLayout={onGridLayout((width) => setInner(width - 2 * Spacing.three))}
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
          <OceanButton title={nextTitle(count)} onPress={onDone} disabled={count === 0 && !allowNone} />
        </BottomBar>
      ) : null}
    </View>
  );
}

/** One animal: its drawing and common name, edged along the top in its rarity colour; a ring and a tick when chosen. */
function PickCard({ species, width, multi, checked, onPress }: { species: Species; width: number; multi: boolean; checked: boolean; onPress: () => void }) {
  const theme = useTheme();
  const scheme = useSchemeName();
  return (
    <PaperButton
      onPress={onPress}
      accessibilityRole={multi ? 'checkbox' : 'button'}
      aria-checked={multi ? checked : undefined}
      aria-selected={checked}
      accessibilityLabel={species.commonName}
      style={[
        styles.card,
        {
          width,
          borderTopColor: RARITY_COLOR[species.rarity],
          ...(checked ? { borderColor: theme.lagoon, borderWidth: 2, backgroundColor: `${theme.wash}40` } : null),
        },
      ]}>
      <View style={styles.art}>
        <SpeciesArt species={species} width={width * 0.78} />
      </View>
      <Text numberOfLines={2} style={[styles.name, { color: theme.text }]}>
        {species.commonName}
      </Text>
      {checked ? (
        <View style={[styles.tick, { backgroundColor: theme.lagoon }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Icon name="check" size={14} color={OnFill[scheme].lagoon} weight="bold" />
        </View>
      ) : null}
    </PaperButton>
  );
}

function SomethingElse({ name, multi, checked, onPress }: { name: string; multi: boolean; checked: boolean; onPress: () => void }) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const species = speciesForSighting({ speciesId: UNLISTED_ID, customName: name })!;
  const title = name ? `Something else: “${name}”` : 'Something else…';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multi ? 'checkbox' : 'button'}
      aria-checked={multi ? checked : undefined}
      aria-selected={checked}
      accessibilityLabel={`${title}. Not in the catalogue? Log it in your own words`}
      style={({ pressed }) => [
        styles.else,
        {
          backgroundColor: pressed ? theme.backgroundSelected : checked ? `${theme.wash}40` : theme.backgroundElement,
          borderColor: checked ? theme.lagoon : theme.cardBorder,
          boxShadow: Shadow[scheme].card,
        },
      ]}>
      <View style={[styles.elseIcon, { backgroundColor: theme.backgroundSelected }]}>
        <SpeciesArt species={species} width={44} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={2} style={[styles.elseTitle, { color: theme.text }]}>
          {title}
        </Text>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          Not in the catalogue? Name it yourself
        </ThemedText>
      </View>
      {multi ? (
        <View
          style={[styles.check, { borderColor: checked ? theme.lagoon : theme.rule, backgroundColor: checked ? theme.lagoon : theme.backgroundElement }]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden>
          {checked ? <Icon name="check" size={16} color={OnFill[scheme].lagoon} weight="bold" /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.two + 2 },
  chipsScroll: { marginHorizontal: -Spacing.three, flexGrow: 0 },
  chips: { gap: Spacing.two, paddingVertical: 2, paddingHorizontal: Spacing.three },
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: CARD_GAP },
  groupTitle: { marginTop: Spacing.two },
  cardRow: { flexDirection: 'row', gap: CARD_GAP },
  card: { borderTopWidth: 4, borderRadius: Radius.md, overflow: 'hidden', paddingBottom: 10 },
  art: { height: 80, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: Type.bodyHeavy, fontSize: 15, lineHeight: 19, minHeight: 38, paddingHorizontal: 8 },
  tick: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  else: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.md, borderWidth: 1.5, padding: 10, paddingRight: 12, minHeight: 64 },
  elseIcon: { width: 48, height: 48, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  elseTitle: { fontFamily: Type.bodyHeavy, fontSize: 15, lineHeight: 20 },
  check: { width: 28, height: 28, borderRadius: Radius.xs, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
