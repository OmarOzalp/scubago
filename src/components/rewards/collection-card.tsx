import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Stamp } from '@/components/journal/stamp';
import { longDate } from '@/components/rewards/format';
import { SpeciesArt } from '@/components/species-art';
import { Card } from '@/components/ui/card';
import { mix } from '@/components/ui/color';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Radius, Size, Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
import type { CollectionResult } from '@/lib/rewards';
import { artFor } from '@/lib/species-art';

/** What a screen reader says for a collection card. */
export function collectionLabel(c: CollectionResult): string {
  const standing = c.completed ? `complete${c.completedOn ? `, ${longDate(c.completedOn)}` : ''}` : `${c.found} of ${c.total} found`;
  return `${c.title}, ${standing}${c.hint ? `. ${c.hint}` : ''}`;
}

/** The animal's plate on a small tile: painted in once found, a pencil outline on a white tile until then. */
export function PlateChip({ speciesId, found, size = Size.thumb }: { speciesId: string; found: boolean; size?: number }) {
  const theme = useTheme();
  const species = CATALOG_BY_ID.get(speciesId);
  if (!species) return null;
  const { wash } = artFor(species);
  const tile = found ? mix(theme.backgroundElement, wash, 0.15) : theme.backgroundElement;
  return (
    <View
      aria-hidden
      style={[styles.chip, { width: size, height: size, backgroundColor: tile }, !found && { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: theme.cardBorder }]}>
      <SpeciesArt species={species} width={size * 0.9} found={found} paper={tile} />
    </View>
  );
}

const MOST_PLATES = 11;

/** A collection as a card: its ring, how many are found, and the animals as small plates in the collection's own order, the found ones painted and the rest in pencil. */
export function CollectionCard({ collection, onPress }: { collection: CollectionResult; onPress?: () => void }) {
  const theme = useTheme();
  const { found, total, completed } = collection;
  const foundIds = new Set(collection.foundIds);
  const members = collection.memberIds.map((id) => ({ id, found: foundIds.has(id) }));
  const shown = members.length > MOST_PLATES + 1 ? members.slice(0, MOST_PLATES) : members;
  const fraction = total > 0 ? found / total : 0;
  return (
    <Card
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={collectionLabel(collection)}
      accessibilityHint={onPress ? 'Opens the collection' : undefined}
      style={styles.card}>
      <View style={styles.head}>
        <ProgressRing
          fraction={fraction}
          size={56}
          color={completed ? theme.sun : undefined}
          label={`${Math.round(fraction * 100)}%`}
          accessibilityLabel={`${found} of ${total} found`}
        />
        <View style={styles.titles}>
          <Text numberOfLines={2} style={[TypeScale.headline, { color: theme.text }]}>
            {collection.title}
          </Text>
          {completed ? (
            <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>Complete{collection.completedOn ? ` · ${longDate(collection.completedOn)}` : ''}</Text>
          ) : (
            // "3 of 10", then the next step in plain words ("2 more reef sharks").
            <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>
              <Text style={[TypeScale.subheadStrong, { color: theme.text }]}>{found}</Text> of {total}
              {collection.hint ? ` · ${collection.hint}` : ''}
            </Text>
          )}
        </View>
        {completed ? <Stamp lines={['Complete']} color={theme.tint} rotate={-8} style={styles.stamp} /> : <Icon name="chevronRight" size={16} color={theme.textTertiary} weight="bold" />}
      </View>
      <View style={styles.plates}>
        {shown.map((m) => (
          <PlateChip key={m.id} speciesId={m.id} found={m.found} />
        ))}
        {shown.length < members.length ? (
          <View style={[styles.chip, styles.more, { backgroundColor: theme.backgroundSelected }]}>
            <Text style={[TypeScale.footnoteStrong, { color: theme.textSecondary }]}>+{members.length - shown.length}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Space.s3,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s3,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  stamp: {
    alignSelf: 'center',
  },
  plates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.s2,
  },
  chip: {
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  more: {
    width: Size.thumb,
    height: Size.thumb,
  },
});
