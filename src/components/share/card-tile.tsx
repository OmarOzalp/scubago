import { StyleSheet, Text, View } from 'react-native';

import { Wash } from '@/components/journal/wash';
import { Type } from '@/constants/theme';
import { lighten } from '@/lib/art-color';
import { RARITY_COLOR, RARITY_LABEL, RARITY_TEXT } from '@/lib/rarity';
import { artFor } from '@/lib/species-art';
import type { Species } from '@/lib/types';

import { CardSpeciesArt } from './card-art';
import { CARD_COLORS, useCardPalette } from './card-kit';

const NAME_HEIGHT = 72;
const TIER_HEIGHT = 34;

/**
 * A small plate with its name: the drawing on a wash of its own colour, in a tile edged in its rarity
 * colour. `tier` adds the tier's name under it, in the tier's colour.
 */
export function PlateTile({ species, width, height, tier = false }: { species: Pick<Species, 'id' | 'commonName' | 'category' | 'rarity'>; width: number; height: number; tier?: boolean }) {
  const palette = useCardPalette();
  const { wash, seed } = artFor(species);
  const artHeight = height - NAME_HEIGHT - (tier ? TIER_HEIGHT : 0) - 14;
  const artWidth = width - 8;
  const plate = Math.max(60, Math.min(width - 28, Math.floor(((artHeight - 6) * 200) / 128)));
  return (
    <View style={[styles.tile, { width, height, borderColor: RARITY_COLOR[species.rarity] }]}>
      <View style={{ width: artWidth, height: artHeight, alignItems: 'center', justifyContent: 'center' }}>
        <Wash width={artWidth - 24} height={artHeight - 8} color={lighten(wash, 0.5)} seed={seed} opacity={0.55} style={{ position: 'absolute', left: 12, top: 4 }} />
        <CardSpeciesArt species={species} width={plate} />
      </View>
      <Text allowFontScaling={false} numberOfLines={2} style={styles.name}>
        {species.commonName}
      </Text>
      {tier ? (
        <Text allowFontScaling={false} style={[styles.tier, { color: RARITY_TEXT[palette.rarityText][species.rarity] }]}>
          {RARITY_LABEL[species.rarity]}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderWidth: 4, borderRadius: 26, backgroundColor: CARD_COLORS.sheet, overflow: 'hidden', alignItems: 'center', paddingTop: 4 },
  name: { fontFamily: Type.bodyBold, fontSize: 28, lineHeight: 33, color: CARD_COLORS.ink, textAlign: 'center', paddingHorizontal: 10, marginTop: 6, height: NAME_HEIGHT - 6, overflow: 'hidden' },
  tier: { fontFamily: Type.bodyHeavy, fontSize: 25, lineHeight: 30, letterSpacing: 3, textTransform: 'uppercase', height: TIER_HEIGHT },
});
