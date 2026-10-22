import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { Tag } from '@/components/journal/tag';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { BadgeMedal } from '@/components/rewards/badge-medal';
import { longDate, stampDate } from '@/components/rewards/format';
import { ThemedText } from '@/components/themed-text';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { BadgeResult } from '@/lib/rewards';
import { hashSeed } from '@/lib/wash';

/** The most medals shown by name; any more are counted. */
const MOST_SHOWN = 5;

/** One line for a screen reader: "New badge: First shark. Earned 12 March 2026." */
export function newBadgesSummary(badges: readonly BadgeResult[]): string {
  if (badges.length === 0) return '';
  if (badges.length === 1) {
    const [b] = badges;
    return `New badge: ${b.title}.${b.earnedOn ? ` Earned ${longDate(b.earnedOn)}.` : ''}`;
  }
  return `${badges.length} new badges: ${badges.map((b) => b.title).join(', ')}.`;
}

/** A glint that pops beside a new medal, once. Nothing moves under Reduce Motion. */
function Glint({ style, delay, size }: { style: ViewStyle; delay: number; size: number }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const motion = reduced
    ? {}
    : ({
        animationName: {
          '0%': { opacity: 0, transform: [{ scale: 0.2 }, { rotate: '-30deg' }] },
          '60%': { opacity: 1, transform: [{ scale: 1.2 }, { rotate: '8deg' }] },
          '100%': { opacity: 0.9, transform: [{ scale: 1 }, { rotate: '0deg' }] },
        },
        animationDuration: '600ms',
        animationDelay: `${delay}ms`,
        animationTimingFunction: 'ease-out',
        animationFillMode: 'both',
      } as ViewStyle);
  return (
    <Animated.View aria-hidden style={[{ position: 'absolute', pointerEvents: 'none' }, style, motion]}>
      <Icon name="sparkle" size={size} color={theme.text} weight="duotone" wash={theme.sun} washOpacity={1} />
    </Animated.View>
  );
}

/**
 * What the diver has just earned, on the page after saving: the medal drops in on a sun wash, with
 * its name and the day, and a way to the rest. Several badges are shown together, one after another.
 * Empty when there is nothing new.
 */
export function NewBadgesBanner({ badges, onOpenAll }: { badges: readonly BadgeResult[]; onOpenAll?: () => void }) {
  const theme = useTheme();
  if (badges.length === 0) return null;
  const single = badges.length === 1 ? badges[0] : null;
  const shown = badges.slice(0, MOST_SHOWN);
  return (
    <View accessibilityLiveRegion="polite" style={styles.wrap}>
      <Paper tone="sand" style={styles.card}>
        <ThemedText type="label" accessibilityRole="header" style={styles.center}>
          {single ? 'New badge' : `${badges.length} new badges`}
        </ThemedText>
        {single ? (
          <View style={styles.single} accessible accessibilityLabel={newBadgesSummary(badges)}>
            <View style={styles.stage}>
              <Wash width={210} height={170} color={theme.sun} seed={hashSeed(single.id)} opacity={0.55} style={styles.halo} />
              <BadgeMedal badge={single} size={112} ribbon reveal delay={250} />
              <Glint size={22} delay={900} style={{ left: 12, top: 20 }} />
              <Glint size={16} delay={1050} style={{ right: 6, top: 52 }} />
              <Glint size={18} delay={1200} style={{ left: 30, bottom: 36 }} />
            </View>
            <Text style={[styles.title, { color: theme.text }]}>{single.title}</Text>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {single.description}
            </ThemedText>
            {single.earnedOn ? <Text style={[styles.date, { color: theme.textSecondary }]}>EARNED {stampDate(single.earnedOn)}</Text> : null}
          </View>
        ) : (
          <View style={styles.many}>
            <View style={styles.medals}>
              {shown.map((badge, index) => (
                <BadgeMedal key={badge.id} badge={badge} size={shown.length > 3 ? 52 : 76} reveal delay={250 + index * 220} />
              ))}
              {badges.length > shown.length ? <Text style={[styles.more, { color: theme.textSecondary }]}>+{badges.length - shown.length}</Text> : null}
            </View>
            <View accessible accessibilityLabel={newBadgesSummary(badges)} style={styles.list}>
              {badges.length <= 2 ? (
                badges.map((badge) => (
                  <View key={badge.id} style={styles.item}>
                    <Text style={[styles.itemTitle, { color: theme.text }]}>{badge.title}</Text>
                    <ThemedText type="small" themeColor="textSecondary">
                      {badge.description}
                    </ThemedText>
                  </View>
                ))
              ) : (
                // A whole page of firsts at once: the names are enough.
                <View style={styles.names}>
                  {badges.map((b) => (
                    <Tag key={b.id} label={b.title} text={theme.text} />
                  ))}
                </View>
              )}
            </View>
          </View>
        )}
        {onOpenAll ? <OceanButton title="See all badges" variant="secondary" icon="medal" onPress={onOpenAll} style={styles.button} /> : null}
      </Paper>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
  },
  card: {
    gap: 10,
    alignSelf: 'stretch',
    paddingVertical: 18,
  },
  center: {
    textAlign: 'center',
  },
  single: {
    alignItems: 'center',
    gap: 6,
  },
  stage: {
    width: 210,
    height: 150,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  halo: {
    position: 'absolute',
    top: -8,
    left: 0,
  },
  title: {
    fontFamily: Type.display,
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
  },
  date: {
    fontFamily: Type.label,
    fontSize: 12,
    letterSpacing: 1.3,
    marginTop: 2,
  },
  many: {
    gap: 12,
  },
  medals: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  list: {
    gap: 8,
  },
  item: {
    gap: 1,
  },
  names: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  more: {
    alignSelf: 'center',
    fontFamily: Type.display,
    fontSize: 20,
    marginLeft: 2,
  },
  itemTitle: {
    fontFamily: Type.bodyHeavy,
    fontSize: 15,
    lineHeight: 20,
  },
  button: {
    alignSelf: 'stretch',
    marginTop: 4,
  },
});

/**
 * The celebration for a screen to drop in: it shows the badges that are `fresh` and, once they are
 * on the page, reports them seen (the screen's `useNewBadges().markSeen`). It keeps showing them
 * after that, so they stay on the page they were earned on.
 */
export function NewBadgesCelebration({ fresh, onSeen, onOpenAll }: { fresh: readonly BadgeResult[]; onSeen: (ids: string[]) => void; onOpenAll?: () => void }) {
  const [shown, setShown] = useState<readonly BadgeResult[]>(fresh);
  const missing = fresh.filter((b) => !shown.some((s) => s.id === b.id));
  if (missing.length > 0) setShown([...shown, ...missing]);
  useEffect(() => {
    if (fresh.length > 0) onSeen(fresh.map((b) => b.id));
  }, [fresh, onSeen]);
  return <NewBadgesBanner badges={shown} onOpenAll={onOpenAll} />;
}
