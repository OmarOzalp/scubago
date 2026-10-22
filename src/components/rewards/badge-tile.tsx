import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Paper } from '@/components/journal/paper';
import { NewBadge } from '@/components/journal/stamp';
import { BadgeMedal } from '@/components/rewards/badge-medal';
import { longDate, stampDate, TIER_LABEL } from '@/components/rewards/format';
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

/** The short line under a medal: the day it was earned, or how far along it is. */
export function badgeCaption(badge: BadgeResult): string {
  if (badge.earned) return badge.earnedOn ? stampDate(badge.earnedOn) : 'EARNED';
  const { have, need } = badge.progress;
  return need > 1 ? `${have} OF ${need}` : 'NOT YET';
}

/** A badge on an album page: its medal, its name, and when it was earned or how far along it is. */
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
      <Text style={[styles.caption, { color: theme.textSecondary }]}>{badgeCaption(badge)}</Text>
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
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
    minHeight: 32,
  },
  caption: {
    fontFamily: Type.label,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1,
    textAlign: 'center',
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
