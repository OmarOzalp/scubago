import { View } from 'react-native';

import { SpeciesArt } from '@/components/species-art';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { RARITY_COLOR } from '@/lib/rarity';
import { artFor } from '@/lib/species-art';
import type { Species } from '@/lib/types';

interface Props {
  species: Species;
  size?: number;
  /** Edge the plate in the species' rarity colour (the field guide and pickers). */
  showRarityRing?: boolean;
  /** A species still to find: a pencil outline on bare paper. */
  muted?: boolean;
}

/** A small field-guide plate: the species' drawing on a pale wash of its colour. Decorative. */
export function SpeciesAvatar({ species, size = 48, showRarityRing = false, muted = false }: Props) {
  const theme = useTheme();
  const { wash } = artFor(species);
  const paper = muted ? theme.backgroundElement : `${wash}26`;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: Math.min(Radius.md, size * 0.28),
        backgroundColor: paper,
        borderWidth: showRarityRing ? 2 : 1,
        borderColor: showRarityRing && !muted ? RARITY_COLOR[species.rarity] : theme.cardBorder,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
      <SpeciesArt species={species} width={size * 0.86} found={!muted} paper={muted ? theme.backgroundElement : undefined} />
    </View>
  );
}
