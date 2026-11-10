import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NewBadge } from '@/components/journal/stamp';
import { BadgeMedal } from '@/components/rewards/badge-medal';
import { longDate, TIER_LABEL } from '@/components/rewards/format';
import { Card } from '@/components/ui/card';
import { Radius, Size, Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { BadgeResult } from '@/lib/rewards';

/** What a screen reader says for a badge: "First shark, earned 12 March 2026". */
export function badgeLabel(badge: BadgeResult, isNew = false): string {
  const tier = badge.tier ? `, ${TIER_LABEL[badge.tier].toLowerCase()}` : '';
  if (badge.earned) return `${badge.title}${tier}, earned${badge.earnedOn ? ` ${longDate(badge.earnedOn)}` : ''}${isNew ? ', new' : ''}`;
  const { have, need } = badge.progress;
  return `${badge.title}${tier}, not earned yet${need > 1 ? `, ${have} of ${need}` : ''}${badge.hint ? `. ${badge.hint}` : ''}`;
}

/**
 * A badge on an album page: its medal and its name. Earned or not shows in the medal (colour or pencil)
 * and in the words a screen reader reads; the date waits on the badge's own page.
 */
export function BadgeTile({ badge, isNew = false, onPress, medal = 72 }: { badge: BadgeResult; isNew?: boolean; onPress?: () => void; medal?: number }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={badgeLabel(badge, isNew)}
      accessibilityHint={onPress ? 'Opens the badge' : undefined}
      style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
      <View>
        <BadgeMedal badge={badge} size={medal} />
        {isNew ? <NewBadge style={styles.new} /> : null}
      </View>
      <Text numberOfLines={3} style={[styles.title, { color: badge.earned ? theme.text : theme.textSecondary }]}>
        {badge.title}
      </Text>
      {/* A badge still to earn says its next step in plain words ("Log your first shark."). */}
      {!badge.earned && badge.hint ? (
        <Text numberOfLines={3} style={[styles.hint, { color: theme.textSecondary }]}>
          {badge.hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** A page of the album: badges laid out three to a row. */
export function BadgePage({ children }: { children: ReactNode }) {
  return <Card style={styles.page}>{children}</Card>;
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    gap: Space.s1,
    minHeight: Size.hit,
    paddingVertical: Space.s1,
    paddingHorizontal: Space.s1,
    borderRadius: Radius.sm,
  },
  title: {
    ...TypeScale.subheadStrong,
    textAlign: 'center',
    minHeight: 2 * TypeScale.subheadStrong.lineHeight,
  },
  hint: {
    ...TypeScale.footnote,
    textAlign: 'center',
  },
  new: {
    position: 'absolute',
    top: -4,
    right: -14,
  },
  page: {
    gap: Space.s3,
    paddingHorizontal: Space.s3,
  },
});
