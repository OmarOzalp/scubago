import { View } from 'react-native';

import { SpeciesArt } from '@/components/species-art';
import { mix } from '@/components/ui/color';
import { continuous } from '@/components/ui/surface';
import { Radius } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { RARITY_COLOR } from '@/lib/rarity';
import { artFor } from '@/lib/species-art';
import type { Species } from '@/lib/types';

interface Props {
  species: Species;
  size?: number;
  /** Edge the plate in the species' rarity colour (the field guide and pickers). */
  showRarityRing?: boolean;
  /** A species still to find: a pencil outline on a white tile. */
  muted?: boolean;
}

/** A small field-guide plate: the species' drawing on a pale tint of its colour (still to find: white with a hairline). Decorative. */
export function SpeciesAvatar({ species, size = 48, showRarityRing = false, muted = false }: Props) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const { wash } = artFor(species);
  // Plates are inked for paper: at night a seen species still sits on a pale, muted tile.
  const base = scheme === 'dark' ? mix(theme.text, theme.backgroundElement, 0.3) : theme.backgroundElement;
  const paper = muted ? theme.backgroundElement : mix(base, wash, 0.15);
  const ring = showRarityRing && !muted;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: Math.min(Radius.md, size * 0.28),
        ...continuous,
        backgroundColor: paper,
        ...(ring ? { borderWidth: 2, borderColor: RARITY_COLOR[species.rarity] } : muted ? { borderWidth: 1, borderColor: theme.cardBorder } : null),
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
      <SpeciesArt species={species} width={size * 0.86} found={!muted} paper={paper} />
    </View>
  );
}
