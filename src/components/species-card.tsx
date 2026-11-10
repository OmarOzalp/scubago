import { Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { SpeciesArt } from '@/components/species-art';
import { mix } from '@/components/ui/color';
import { usePressScale } from '@/components/ui/press';
import { continuous } from '@/components/ui/surface';
import { Tag } from '@/components/ui/tag';
import { Radius, Space, TypeScale } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { RARITY_COLOR, RARITY_LABEL } from '@/lib/rarity';
import type { Species } from '@/lib/types';

/** The space between cards, across and down (the design system's 12 between siblings). */
export const CARD_GAP = Space.s3;

/**
 * How the cards of a grid sit in a column `inner` points wide: three a row on a phone, two when the
 * diver's text size is up by a third or more (a name at that size needs the room), and more on a
 * wide screen.
 */
export function useCardGrid(inner: number): { columns: number; cardWidth: number } {
  const { fontScale } = useWindowDimensions();
  const columns = Math.max(fontScale >= 1.3 ? 2 : 3, Math.min(6, Math.floor(inner / 150)));
  return { columns, cardWidth: cardWidthFor(inner, columns) };
}

/** The width of each of `columns` cards across `inner` points: never less than nothing, however narrow. */
export function cardWidthFor(inner: number, columns: number): number {
  return Math.max(0, Math.floor((inner - CARD_GAP * (columns - 1)) / columns));
}

/**
 * An `onLayout` that hands on the width a grid of cards has. A screen covered by another (the web hides
 * it, and it then measures 0 wide) keeps the width it had: at 0 every card of the field guide was drawn
 * narrower than nothing, 120 "<svg> attribute width: A negative value is not valid (-5.46)" errors, and
 * all of them redrawn for a screen nobody could see.
 */
export function onGridLayout(setInner: (width: number) => void): (event: LayoutChangeEvent) => void {
  return (event) => {
    const width = Math.floor(event.nativeEvent.layout.width);
    if (width > 0) setInner(width);
  };
}

interface Props {
  species: Species;
  width: number;
  /** Times seen; 0 for a species still to find. */
  count: number;
  /** First seen recently: a "New" tag on the tile. */
  isNew?: boolean;
  /** Lines the name may take before it ends in an ellipsis: 2, or 3 where the card is narrow (a long two-word name). */
  nameLines?: 2 | 3;
  onPress: () => void;
}

/** How strongly a seen species' tile takes its rarity colour, per scheme. */
const TINT = { light: 0.14, dark: 0.18 };

/**
 * A species in a grid: its drawing on a square tile (seen: a soft tint of its rarity colour; still to find:
 * a white surface with a hairline and a pencil outline), and its name under it, two lines at most, always the same
 * height so a grid's rows line up. Rarity is the small dot in the tile's corner and nothing else; the words
 * ("Rare, not seen yet", "seen 3 times") are in what a screen reader says.
 */
export function SpeciesCard({ species, width, count, isNew = false, nameLines = 2, onPress }: Props) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const scale = usePressScale();
  const seen = count > 0;
  const rarity = RARITY_LABEL[species.rarity];
  const colour = RARITY_COLOR[species.rarity];
  const label = `${species.commonName}, ${rarity.toLowerCase()}, ${seen ? (count > 1 ? `seen ${count} times` : 'seen once') : 'not seen yet'}${isNew ? ', new' : ''}`;
  // The plates are drawn in ink for paper: at night a seen species still sits on a pale tile (a muted one, so it
  // doesn't glare), or a dark animal like a manta would vanish into the navy. Still to find stays sunken.
  const paper = scheme === 'dark' ? mix(theme.text, theme.backgroundElement, 0.3) : theme.backgroundElement;
  // Seen: the soft tint of its rarity colour. Still to find: a plain white surface with a hairline (never a grey fill,
  // which reads as a tile still loading); the pencil outline on it is what says "not yet".
  const tile = seen ? mix(paper, colour, TINT[scheme]) : theme.backgroundElement;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.card, { width }, scale(pressed)]}>
      <View style={[styles.tile, { width, height: width, backgroundColor: tile }, !seen && { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: theme.cardBorder }]}>
        <SpeciesArt species={species} width={Math.round(width * 0.86)} found={seen} paper={tile} />
        <View testID="rarity-dot" style={[styles.dot, { backgroundColor: colour, borderColor: tile }]} />
      </View>
      {isNew ? <Tag label="New" tone="sun" style={styles.new} /> : null}
      <Text numberOfLines={nameLines} ellipsizeMode="tail" maxFontSizeMultiplier={1.5} style={[styles.name, { color: seen ? theme.text : theme.textSecondary }]}>
        {species.commonName}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Space.s2,
  },
  tile: {
    borderRadius: Radius.md,
    ...continuous,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dot: {
    position: 'absolute',
    top: Space.s2,
    left: Space.s2,
    width: 10,
    height: 10,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  // Overlaps the tile's top-right corner.
  new: {
    position: 'absolute',
    top: -6,
    right: -4,
  },
  // Two lines are always kept, so every card in a grid is the same height.
  name: {
    ...TypeScale.subheadStrong,
    minHeight: 2 * TypeScale.subheadStrong.lineHeight,
  },
});
