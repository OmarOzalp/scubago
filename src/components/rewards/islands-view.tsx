import { StyleSheet, View } from 'react-native';

import { IslandCard } from '@/components/rewards/island-card';
import type { IslandResult } from '@/lib/rewards';

/** Every island of the archipelago, the raised ones first. */
export function IslandsView({
  islands,
  onOpenIsland,
  onOpenSpecies,
}: {
  islands: readonly IslandResult[];
  onOpenIsland?: (islandId: IslandResult['id']) => void;
  onOpenSpecies?: (speciesId: string) => void;
}) {
  const ordered = [...islands.filter((i) => i.unlocked), ...islands.filter((i) => !i.unlocked)];
  return (
    <View style={styles.view}>
      {ordered.map((island) => (
        <IslandCard key={island.id} island={island} onOpen={onOpenIsland} onOpenSpecies={onOpenSpecies} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  view: {
    gap: 16,
  },
});
