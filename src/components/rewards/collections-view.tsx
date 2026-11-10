import { StyleSheet, View } from 'react-native';

import { CollectionCard } from '@/components/rewards/collection-card';
import { ThemedText } from '@/components/themed-text';
import { Section } from '@/components/ui/screen';
import { Space } from '@/constants/theme';
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
      {KINDS.map(({ kind, title }, index) => {
        const ofKind = collections.filter((c) => c.kind === kind);
        if (ofKind.length === 0) return null;
        const done = ofKind.filter((c) => c.completed).length;
        return (
          <Section
            key={kind}
            title={title}
            flush={index === 0}
            accessory={
              <ThemedText type="footnote" themeColor="textSecondary" accessibilityLabel={`${done} of ${ofKind.length} complete`}>
                {done} of {ofKind.length}
              </ThemedText>
            }>
            {ofKind.map((c) => (
              <CollectionCard key={c.id} collection={c} onPress={onOpen ? () => onOpen(c) : undefined} />
            ))}
          </Section>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  view: {
    gap: Space.s4,
  },
});
