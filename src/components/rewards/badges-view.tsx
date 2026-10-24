import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { SectionHeader } from '@/components/journal/screen';
import { NewBadge } from '@/components/journal/stamp';
import { BadgeLadder } from '@/components/rewards/badge-ladder';
import { countEarned, itemsOfKind, KIND_ORDER, KIND_TITLE, latestEarned, type BadgeItem } from '@/components/rewards/badge-groups';
import { BadgeMedal } from '@/components/rewards/badge-medal';
import { BadgePage, BadgeTile, badgeLabel } from '@/components/rewards/badge-tile';
import { stampDate } from '@/components/rewards/format';
import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { BadgeResult } from '@/lib/rewards';

interface Props {
  badges: readonly BadgeResult[];
  /** Badges earned and not yet celebrated: they wear a "New" ribbon. */
  newIds?: ReadonlySet<string>;
  onOpenBadge?: (badge: BadgeResult) => void;
  /** Offered when nothing has been earned yet. */
  onLog?: () => void;
}

/** Every badge, on album pages by kind, with the latest three on show above. */
export function BadgesView({ badges, newIds, onOpenBadge, onLog }: Props) {
  const latest = latestEarned(badges, 3);
  return (
    <View style={styles.view}>
      {latest.length > 0 ? <Latest badges={latest} newIds={newIds} onOpenBadge={onOpenBadge} /> : <NothingYet onLog={onLog} />}
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
                <ThemedText type="label" accessibilityLabel={`${earned} of ${ofKind.length} earned`}>
                  {earned} / {ofKind.length}
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

/** The badges earned most recently, as large medals on a sand page. */
function Latest({ badges, newIds, onOpenBadge }: { badges: BadgeResult[]; newIds?: ReadonlySet<string>; onOpenBadge?: (badge: BadgeResult) => void }) {
  const theme = useTheme();
  return (
    <Paper tone="sand" style={styles.latest}>
      <ThemedText type="label" accessibilityRole="header">
        Latest
      </ThemedText>
      <View style={styles.latestRow}>
        {badges.map((badge) => {
          const isNew = !!newIds?.has(badge.id);
          return (
            <Pressable
              key={badge.id}
              onPress={onOpenBadge ? () => onOpenBadge(badge) : undefined}
              disabled={!onOpenBadge}
              accessibilityRole={onOpenBadge ? 'button' : undefined}
              accessibilityLabel={badgeLabel(badge, isNew)}
              accessibilityHint={onOpenBadge ? 'Opens the badge' : undefined}
              style={({ pressed }) => [styles.latestItem, { opacity: pressed ? 0.6 : 1 }]}>
              <View>
                <BadgeMedal badge={badge} size={78} ribbon />
                {isNew ? <NewBadge style={styles.latestNew} /> : null}
              </View>
              <Text numberOfLines={3} style={[styles.latestTitle, { color: theme.text }]}>
                {badge.title}
              </Text>
              <Text style={[styles.latestDate, { color: theme.textSecondary }]}>{badge.earnedOn ? stampDate(badge.earnedOn) : ''}</Text>
            </Pressable>
          );
        })}
      </View>
    </Paper>
  );
}

function NothingYet({ onLog }: { onLog?: () => void }) {
  const theme = useTheme();
  return (
    <Paper tone="sand" style={styles.empty}>
      <View style={[styles.emptyRing, { borderColor: theme.textSecondary }]}>
        <Icon name="medal" size={34} color={theme.textSecondary} weight="regular" wash={theme.textSecondary} washOpacity={0.15} />
      </View>
      <ThemedText type="heading" style={styles.center}>
        No badges yet
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        Log a sighting and your first badge is pinned here.
      </ThemedText>
      {onLog ? <OceanButton title="Log a dive" variant="log" icon="plus" onPress={onLog} style={styles.cta} /> : null}
    </Paper>
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
  latest: {
    gap: 10,
    paddingBottom: 12,
  },
  latestRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    gap: 4,
  },
  latestItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    minHeight: 44,
  },
  latestTitle: {
    fontFamily: Type.bodyHeavy,
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
    minHeight: 36,
  },
  latestDate: {
    fontFamily: Type.label,
    fontSize: 12,
    letterSpacing: 1,
    textAlign: 'center',
  },
  latestNew: {
    position: 'absolute',
    top: -4,
    right: -12,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 22,
  },
  emptyRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.6,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  center: {
    textAlign: 'center',
  },
  cta: {
    alignSelf: 'stretch',
    marginTop: 6,
  },
});
