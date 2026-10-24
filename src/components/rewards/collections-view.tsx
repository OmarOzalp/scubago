import { StyleSheet, View } from 'react-native';

import { SectionHeader } from '@/components/journal/screen';
import { CollectionCard } from '@/components/rewards/collection-card';
import { ThemedText } from '@/components/themed-text';
import type { CollectionKind, CollectionResult } from '@/lib/rewards';

const KINDS: { kind: CollectionKind; title: string }[] = [
  { kind: 'area', title: 'Habitats' },
  { kind: 'family', title: 'Families' },
  { kind: 'curated', title: 'Special sets' },
];

/** Every collection as a card, by kind. */
export function CollectionsView({ collections, onOpen }: { collections: readonly CollectionResult[]; onOpen?: (collection: CollectionResult) => void }) {
  return (
    <View style={styles.view}>
      {KINDS.map(({ kind, title }) => {
        const ofKind = collections.filter((c) => c.kind === kind);
        if (ofKind.length === 0) return null;
        const done = ofKind.filter((c) => c.completed).length;
        return (
          <View key={kind} style={styles.kind}>
            <SectionHeader
              title={title}
              accessory={
                <ThemedText type="label" accessibilityLabel={`${done} of ${ofKind.length} complete`}>
                  {done} / {ofKind.length}
                </ThemedText>
              }
            />
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
