import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { CATEGORY_EMOJI, RARITY_COLOR } from '@/lib/rarity';
import type { Species } from '@/lib/types';

interface Props {
  species: Species;
  size?: number;
  /** Draw the rarity-colored ring (used in the dex and pickers). */
  showRarityRing?: boolean;
  /** Grey out (unseen dex entries). */
  muted?: boolean;
}

/** Circular species image with emoji fallback and optional rarity ring. */
export function SpeciesAvatar({ species, size = 48, showRarityRing = false, muted = false }: Props) {
  const theme = useTheme();
  const emoji = species.emoji ?? CATEGORY_EMOJI[species.category];
  const ring = showRarityRing ? RARITY_COLOR[species.rarity] : 'transparent';

  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: muted ? theme.backgroundSelected : ring,
          borderWidth: showRarityRing ? 2 : 0,
        },
      ]}>
      {species.photoUrl && !muted ? (
        <Image
          source={{ uri: species.photoUrl }}
          style={{ width: '100%', height: '100%', borderRadius: size / 2 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            { backgroundColor: theme.backgroundElement, borderRadius: size / 2 },
          ]}>
          <Text style={{ fontSize: size * 0.5, opacity: muted ? 0.35 : 1 }}>{emoji}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
