import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { SectionHeader } from '@/components/journal/screen';
import { BadgeLadder } from '@/components/rewards/badge-ladder';
import { countEarned, itemsOfKind, KIND_ORDER, KIND_TITLE, type BadgeItem } from '@/components/rewards/badge-groups';
import { BadgePage, BadgeTile } from '@/components/rewards/badge-tile';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { BadgeResult } from '@/lib/rewards';

interface Props {
  badges: readonly BadgeResult[];
  /** Badges earned and not yet celebrated: they wear a "New" ribbon. */
  newIds?: ReadonlySet<string>;
  onOpenBadge?: (badge: BadgeResult) => void;
}

/** Every badge, on album pages by kind. Earned ones are in colour; the rest say their next step. */
export function BadgesView({ badges, newIds, onOpenBadge }: Props) {
  return (
    <View style={styles.view}>
      {KIND_ORDER.map((kind) => {
        const items = itemsOfKind(badges, kind);
        if (items.length === 0) return null;
        const ofKind = badges.filter((b) => b.kind === kind);
        const earned = countEarned(ofKind);
        return (
          <View key={kind} style={styles.kind}>
            <SectionHeader
              title={KIND_TITLE[kind]}
              accessory={
                <ThemedText type="small" themeColor="textSecondary" accessibilityLabel={`${earned} of ${ofKind.length} earned`}>
                  {earned} of {ofKind.length}
                </ThemedText>
              }
            />
            <BadgePage>
              <Blocks items={items} newIds={newIds} onOpenBadge={onOpenBadge} />
            </BadgePage>
          </View>
        );
      })}
    </View>
  );
}

/** Ladders, and runs of lone badges laid out three to a row, ruled off from each other. */
function Blocks({ items, newIds, onOpenBadge }: { items: BadgeItem[]; newIds?: ReadonlySet<string>; onOpenBadge?: (badge: BadgeResult) => void }) {
  const theme = useTheme();
  const blocks: ({ type: 'ladder'; key: string; rungs: BadgeResult[] } | { type: 'grid'; badges: BadgeResult[] })[] = [];
  for (const item of items) {
    const last = blocks[blocks.length - 1];
    if (item.type === 'ladder') blocks.push(item);
    else if (last?.type === 'grid') last.badges.push(item.badge);
    else blocks.push({ type: 'grid', badges: [item.badge] });
  }
  return (
    <>
      {blocks.map((block, index) => (
        <Fragment key={block.type === 'ladder' ? block.key : `grid-${index}`}>
          {index > 0 ? <View style={[styles.rule, { backgroundColor: theme.rule }]} /> : null}
          {block.type === 'ladder' ? (
            <BadgeLadder ladder={block.key} rungs={block.rungs} newIds={newIds} onPress={onOpenBadge} />
          ) : (
            <View style={styles.grid}>
              {block.badges.map((badge) => (
                <View key={badge.id} style={styles.cell}>
                  <BadgeTile badge={badge} isNew={!!newIds?.has(badge.id)} onPress={onOpenBadge ? () => onOpenBadge(badge) : undefined} />
                </View>
              ))}
            </View>
          )}
        </Fragment>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  view: {
    gap: 22,
  },
  kind: {
    gap: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 6,
  },
  cell: {
    width: '33.333%',
    paddingHorizontal: 3,
  },
  rule: {
    height: 1,
  },
});
