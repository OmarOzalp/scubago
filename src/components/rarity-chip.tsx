import { StyleSheet, Text, View } from 'react-native';

import { RARITY_COLOR, RARITY_LABEL } from '@/lib/rarity';
import type { Rarity } from '@/lib/types';

/** Small colored pill naming the rarity tier. */
export function RarityChip({ rarity, small = false }: { rarity: Rarity; small?: boolean }) {
  const color = RARITY_COLOR[rarity];
  return (
    <View style={[styles.chip, { backgroundColor: `${color}22`, borderColor: color }]}>
      <Text style={[styles.label, { color, fontSize: small ? 10 : 12 }]}>
        {RARITY_LABEL[rarity]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: '700',
  },
});
