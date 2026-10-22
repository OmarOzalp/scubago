import { StyleSheet, View } from 'react-native';

import { SectionHeader } from '@/components/journal/screen';
import { CollectionCard } from '@/components/rewards/collection-card';
import { ThemedText } from '@/components/themed-text';
import type { CollectionKind, CollectionResult } from '@/lib/rewards';

const KINDS: { kind: CollectionKind; title: string; note: string }[] = [
  { kind: 'area', title: 'Habitats', note: 'Everyone who lives in each corner of the archipelago' },
  { kind: 'family', title: 'Families', note: 'Every animal of a kind in the field guide' },
  { kind: 'curated', title: 'Special sets', note: 'Small sets worth chasing' },
];

/** Every collection as a card, by kind. */
export function CollectionsView({ collections, onOpen }: { collections: readonly CollectionResult[]; onOpen?: (collection: CollectionResult) => void }) {
  return (
    <View style={styles.view}>
      {KINDS.map(({ kind, title, note }) => {
        const ofKind = collections.filter((c) => c.kind === kind);
        if (ofKind.length === 0) return null;
        const done = ofKind.filter((c) => c.completed).length;
        return (
          <View key={kind} style={styles.kind}>
            <SectionHeader title={title} eyebrow={`${done} of ${ofKind.length} complete`} />
            <ThemedText type="caption" themeColor="textSecondary">
              {note}
            </ThemedText>
            {ofKind.map((c) => (
              <CollectionCard key={c.id} collection={c} onPress={onOpen ? () => onOpen(c) : undefined} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  view: {
    gap: 22,
  },
  kind: {
    gap: 10,
  },
});
