import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NewBadge } from '@/components/journal/stamp';
import { BadgeMedal } from '@/components/rewards/badge-medal';
import { badgeLabel } from '@/components/rewards/badge-tile';
import { ladderTitle } from '@/components/rewards/format';
import { ThemedText } from '@/components/themed-text';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { BadgeResult } from '@/lib/rewards';

/** "Next: 3 more dive sites", or the top rung's praise. */
export function ladderNote(rungs: readonly BadgeResult[]): string {
  const next = rungs.find((r) => !r.earned);
  if (!next) return 'Every rung climbed';
  const { have, need } = next.progress;
  return `Next: ${next.hint ?? next.title}${need > 1 ? ` · ${have} of ${need}` : ''}`;
}

/** One ladder as one row: its rungs along a line, climbed ones as medals and the rest in pencil. */
export function BadgeLadder({
  ladder,
  rungs,
  newIds,
  onPress,
  medal,
}: {
  ladder: string;
  rungs: readonly BadgeResult[];
  newIds?: ReadonlySet<string>;
  onPress?: (badge: BadgeResult) => void;
  medal?: number;
}) {
  const theme = useTheme();
  const climbed = rungs.filter((r) => r.earned).length;
  const note = ladderNote(rungs);
  // Seven rungs fit a phone's width only a little smaller.
  const size = medal ?? (rungs.length > 5 ? 40 : 46);
  return (
    <View style={styles.ladder}>
      <View style={styles.head}>
        <ThemedText type="heading" accessibilityRole="header" style={styles.title}>
          {ladderTitle(ladder)}
        </ThemedText>
        <Text accessibilityLabel={`${climbed} of ${rungs.length} rungs climbed`} style={[styles.count, { color: theme.textSecondary }]}>
          {climbed} OF {rungs.length}
        </Text>
      </View>
      <View style={styles.row}>
        {/* The line the rungs sit on. */}
        <View style={[styles.line, { backgroundColor: theme.rule, top: size / 2 - 1, left: `${50 / rungs.length}%`, right: `${50 / rungs.length}%` }]} />
        {rungs.map((rung) => {
          const isNew = !!newIds?.has(rung.id);
          return (
            <Pressable
              key={rung.id}
              onPress={onPress ? () => onPress(rung) : undefined}
              disabled={!onPress}
              accessibilityRole={onPress ? 'button' : undefined}
              accessibilityLabel={badgeLabel(rung, isNew)}
              accessibilityHint={onPress ? 'Opens the badge' : undefined}
              style={({ pressed }) => [styles.rung, { opacity: pressed ? 0.6 : 1 }]}>
              <View>
                <BadgeMedal badge={rung} size={size} />
                {isNew ? <NewBadge style={styles.new} /> : null}
              </View>
              <Text style={[styles.step, { color: rung.earned ? theme.text : theme.textSecondary }]}>{rung.progress.need.toLocaleString('en')}</Text>
            </Pressable>
          );
        })}
      </View>
      <ThemedText type="caption" themeColor="textSecondary">
        {note}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  ladder: {
    gap: 8,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
  },
  count: {
    fontFamily: Type.label,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  line: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
  },
  rung: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    minHeight: 44,
  },
  step: {
    fontFamily: Type.display,
    fontSize: 15,
    lineHeight: 19,
  },
  new: {
    position: 'absolute',
    top: -8,
    right: -12,
  },
});
