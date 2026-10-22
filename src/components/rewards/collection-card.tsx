import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PaperButton } from '@/components/journal/paper';
import { ProgressRing } from '@/components/journal/progress-ring';
import { Stamp } from '@/components/journal/stamp';
import { longDate, stampDate } from '@/components/rewards/format';
import { SpeciesArt } from '@/components/species-art';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
import type { CollectionResult } from '@/lib/rewards';
import { artFor } from '@/lib/species-art';

/** What a screen reader says for a collection card. */
export function collectionLabel(c: CollectionResult): string {
  const standing = c.completed ? `complete${c.completedOn ? `, ${longDate(c.completedOn)}` : ''}` : `${c.found} of ${c.total} found`;
  return `${c.title}, ${standing}${c.hint ? `. ${c.hint}` : ''}`;
}

/** The animal's plate on a small tile: painted in once found, a dashed pencil outline until then. */
export function PlateChip({ speciesId, found, size = 46 }: { speciesId: string; found: boolean; size?: number }) {
  const theme = useTheme();
  const species = CATALOG_BY_ID.get(speciesId);
  if (!species) return null;
  const { wash } = artFor(species);
  return (
    <View
      aria-hidden
      style={[
        styles.chip,
        {
          width: size,
          height: size,
          backgroundColor: found ? `${wash}26` : 'transparent',
          borderColor: found ? theme.cardBorder : theme.textSecondary,
          borderStyle: found ? 'solid' : 'dashed',
          opacity: found ? 1 : 0.85,
        },
      ]}>
      <SpeciesArt species={species} width={size * 0.9} found={found} paper={theme.backgroundElement} />
    </View>
  );
}

const MOST_PLATES = 11;

/** A collection as a card: its ring, how many are found, and the animals as small plates, found ones first. */
export function CollectionCard({ collection, onPress }: { collection: CollectionResult; onPress?: () => void }) {
  const theme = useTheme();
  const { found, total, completed } = collection;
  const members = [...collection.foundIds.map((id) => ({ id, found: true })), ...collection.missingIds.map((id) => ({ id, found: false }))];
  const shown = members.length > MOST_PLATES + 1 ? members.slice(0, MOST_PLATES) : members;
  return (
    <PaperButton
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={collectionLabel(collection)}
      accessibilityHint="Opens the collection"
      style={styles.card}>
      <View style={styles.head}>
        <ProgressRing
          fraction={total > 0 ? found / total : 0}
          size={58}
          color={completed ? theme.sun : undefined}
          accessibilityLabel={`${found} of ${total} found`}
        />
        <View style={styles.titles}>
          <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>
            {collection.title}
          </Text>
          {completed ? (
            <Text style={[styles.label, { color: theme.textSecondary }]}>COMPLETE{collection.completedOn ? ` · ${stampDate(collection.completedOn)}` : ''}</Text>
          ) : (
            <Text style={[styles.sub, { color: theme.textSecondary }]}>
              <Text style={{ fontFamily: Type.bodyHeavy, color: theme.text }}>{found}</Text> of {total} found
              {collection.hint ? ` · ${collection.hint}` : ''}
            </Text>
          )}
        </View>
        {completed ? <Stamp lines={['Complete']} color={theme.tint} rotate={-8} style={styles.stamp} /> : <Icon name="chevronRight" size={18} color={theme.textSecondary} weight="bold" />}
      </View>
      <View style={styles.plates}>
        {shown.map((m) => (
          <PlateChip key={m.id} speciesId={m.id} found={m.found} />
        ))}
        {shown.length < members.length ? (
          <View style={[styles.more, { borderColor: theme.rule }]}>
            <Text style={[styles.moreText, { color: theme.textSecondary }]}>+{members.length - shown.length}</Text>
          </View>
        ) : null}
      </View>
    </PaperButton>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    gap: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: Type.display,
    fontSize: 19,
    lineHeight: 24,
  },
  sub: {
    fontFamily: Type.body,
    fontSize: 14,
    lineHeight: 19,
  },
  label: {
    fontFamily: Type.label,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
  },
  stamp: {
    alignSelf: 'center',
  },
  plates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  more: {
    width: 46,
    height: 46,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontFamily: Type.bodyHeavy,
    fontSize: 13,
  },
});
