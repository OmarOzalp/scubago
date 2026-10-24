import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { PaperButton } from '@/components/journal/paper';
import { NewBadge } from '@/components/journal/stamp';
import { SpeciesArt } from '@/components/species-art';
import { Radius, Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { RARITY_COLOR, RARITY_LABEL, RARITY_TEXT } from '@/lib/rarity';
import type { Species } from '@/lib/types';

/** The space between cards, across and down. */
export const CARD_GAP = 10;

/**
 * How the cards of a grid sit in a column `inner` points wide: three a row on a phone, two when the
 * diver's text size is up by a third or more (a name at that size needs the room), and more on a
 * wide screen.
 */
export function useCardGrid(inner: number): { columns: number; cardWidth: number } {
  const { fontScale } = useWindowDimensions();
  const columns = Math.max(fontScale >= 1.3 ? 2 : 3, Math.min(6, Math.floor(inner / 150)));
  return { columns, cardWidth: Math.floor((inner - CARD_GAP * (columns - 1)) / columns) };
}

interface Props {
  species: Species;
  width: number;
  /** Times seen; 0 for a species still to find. */
  count: number;
  /** First seen recently: a "New" ribbon. */
  isNew?: boolean;
  onPress: () => void;
}

/**
 * A page of the field guide: the species' drawing, its name and rarity, edged along the top in the
 * rarity colour. A species still to find is a pencil sketch with no caption: its dashed plate and
 * paler name say so, the rarity colour on its top edge is a hint of what to hunt for, and the words
 * ("Rare, not seen yet") are in what a screen reader says.
 */
export function SpeciesCard({ species, width, count, isNew = false, onPress }: Props) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const seen = count > 0;
  const rarity = RARITY_LABEL[species.rarity];
  const label = `${species.commonName}, ${rarity.toLowerCase()}, ${
    seen ? (count > 1 ? `seen ${count} times` : 'seen once') : 'not seen yet'
  }${isNew ? ', new' : ''}`;
  return (
    <PaperButton onPress={onPress} accessibilityLabel={label} style={[styles.card, { width, borderTopColor: RARITY_COLOR[species.rarity] }]}>
      <View style={styles.art}>
        <SpeciesArt species={species} width={width * 0.78} found={seen} />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={2} style={[styles.name, { color: seen ? theme.text : theme.textSecondary }]}>
          {species.commonName}
        </Text>
        {seen ? (
          <Text numberOfLines={1} style={[styles.rarity, { color: RARITY_TEXT[scheme][species.rarity] }]}>
            {rarity}
            {count > 1 ? <Text style={{ color: theme.textSecondary }}>{`  ×${count}`}</Text> : null}
          </Text>
        ) : null}
      </View>
      {isNew ? <NewBadge style={styles.badge} /> : null}
    </PaperButton>
  );
}

const styles = StyleSheet.create({
  card: {
    borderTopWidth: 4,
    borderRadius: Radius.md,
    overflow: 'hidden',
    paddingBottom: 10,
  },
  art: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    paddingHorizontal: 8,
    gap: 2,
  },
  // 15 is the floor for a name that is the content; two lines, so the long ones ("Whitetip Reef Shark") still show.
  name: {
    fontFamily: Type.bodyHeavy,
    fontSize: 15,
    lineHeight: 19,
    minHeight: 38,
  },
  rarity: {
    fontFamily: Type.bodyHeavy,
    fontSize: 12,
    lineHeight: 15,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
});
