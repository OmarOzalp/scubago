import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Paper } from '@/components/journal/paper';
import { NewBadge } from '@/components/journal/stamp';
import { BadgeMedal } from '@/components/rewards/badge-medal';
import { longDate, TIER_LABEL } from '@/components/rewards/format';
import { Type } from '@/constants/theme';
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
      style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.6 : 1 }]}>
      <View>
        <BadgeMedal badge={badge} size={medal} />
        {isNew ? <NewBadge style={styles.new} /> : null}
      </View>
      <Text numberOfLines={2} style={[styles.title, { color: badge.earned ? theme.text : theme.textSecondary }]}>
        {badge.title}
      </Text>
    </Pressable>
  );
}

/** A page of the album: badges laid out three to a row. */
export function BadgePage({ children }: { children: ReactNode }) {
  return <Paper style={styles.page}>{children}</Paper>;
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
    paddingVertical: 4,
  },
  title: {
    fontFamily: Type.bodyHeavy,
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
    minHeight: 36,
  },
  new: {
    position: 'absolute',
    top: -4,
    right: -14,
  },
  page: {
    gap: 14,
    paddingHorizontal: 12,
  },
});
