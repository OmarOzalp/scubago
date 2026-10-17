import { StyleSheet, Text, View } from 'react-native';

import { PaperButton } from '@/components/journal/paper';
import { NewBadge } from '@/components/journal/stamp';
import { SpeciesArt } from '@/components/species-art';
import { Radius, Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { RARITY_COLOR, RARITY_LABEL, RARITY_TEXT } from '@/lib/rarity';
import type { Species } from '@/lib/types';

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
 * rarity colour. A species still to find is a pencil sketch.
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
    <PaperButton onPress={onPress} accessibilityLabel={label} style={[styles.card, { width, borderTopColor: seen ? RARITY_COLOR[species.rarity] : theme.rule }]}>
      <View style={styles.art}>
        <SpeciesArt species={species} width={width * 0.78} found={seen} />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={2} style={[styles.name, { color: theme.text }]}>
          {species.commonName}
        </Text>
        {seen ? (
          <Text numberOfLines={1} style={[styles.rarity, { color: RARITY_TEXT[scheme][species.rarity] }]}>
            {rarity}
            {count > 1 ? <Text style={{ color: theme.textSecondary }}>{`  ×${count}`}</Text> : null}
          </Text>
        ) : (
          <Text numberOfLines={1} style={[styles.unseen, { color: theme.textSecondary }]}>
            Not seen yet
          </Text>
        )}
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
  name: {
    fontFamily: Type.bodyHeavy,
    fontSize: 13,
    lineHeight: 16,
    minHeight: 32,
  },
  rarity: {
    fontFamily: Type.bodyHeavy,
    fontSize: 12,
    lineHeight: 15,
  },
  unseen: {
    fontFamily: Type.displayItalic,
    fontSize: 12,
    lineHeight: 15,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
});
