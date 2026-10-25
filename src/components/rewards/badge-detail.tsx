import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { LinkRow } from '@/components/journal/link-row';
import { Paper } from '@/components/journal/paper';
import { ProgressBar } from '@/components/journal/progress-bar';
import { Tag } from '@/components/journal/tag';
import { BadgeLadder } from '@/components/rewards/badge-ladder';
import { KIND_TITLE } from '@/components/rewards/badge-groups';
import { BadgeMedal } from '@/components/rewards/badge-medal';
import { badgeLabel } from '@/components/rewards/badge-tile';
import { longDate, TIER_LABEL } from '@/components/rewards/format';
import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { BadgeResult } from '@/lib/rewards';

/** The collection a collection badge is for (`collection-<id>`), or undefined for any other badge. */
export function collectionIdOfBadge(badge: Pick<BadgeResult, 'id' | 'kind'>): string | undefined {
  return badge.kind === 'collection' ? badge.id.replace(/^collection-/, '') : undefined;
}

/** One badge in full: a large medal, what earns it, and the day it was earned or how far there is to go. */
export function BadgeDetailView({
  badge,
  rungs,
  onOpenBadge,
  onOpenCollection,
  onOpenPassport,
  onLog,
}: {
  badge: BadgeResult;
  /** Every rung of its ladder (itself included), if it is on one. */
  rungs?: readonly BadgeResult[];
  onOpenBadge?: (badge: BadgeResult) => void;
  onOpenCollection?: (collectionId: string) => void;
  onOpenPassport?: () => void;
  onLog?: () => void;
}) {
  const theme = useTheme();
  const collectionId = collectionIdOfBadge(badge);
  const { have, need } = badge.progress;
  return (
    <View style={styles.view}>
      <Paper tone={badge.earned ? 'sand' : 'card'} raised style={styles.stage}>
        <View accessible accessibilityLabel={badgeLabel(badge)} style={styles.medal}>
          <BadgeMedal badge={badge} size={150} ribbon={badge.earned} />
        </View>
        <View style={styles.tags}>
          <Tag label={KIND_TITLE[badge.kind].replace(/s$/, '')} small />
          {badge.tier ? <Tag label={TIER_LABEL[badge.tier]} small /> : null}
        </View>
        <ThemedText type="display" accessibilityRole="header" style={styles.center}>
          {badge.title}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {badge.description}
        </ThemedText>
        {/* The day it was earned is one line on the medal's own card, not a card of its own. */}
        {badge.earned ? (
          <View style={styles.earned}>
            <Icon name="verified" size={22} color={theme.tint} wash={theme.turquoise} />
            <Text style={[styles.earnedOn, { color: theme.text }]}>{badge.earnedOn ? `Earned ${longDate(badge.earnedOn)}` : 'Earned'}</Text>
          </View>
        ) : null}
      </Paper>

      {badge.earned ? null : (
        <Paper style={styles.status}>
          <View style={styles.flex}>
            <ThemedText type="label">Not earned yet</ThemedText>
            {need > 1 ? (
              <>
                <Text style={[styles.date, { color: theme.text }]}>
                  {have} of {need}
                </Text>
                <ProgressBar fraction={have / need} max={need} now={have} accessibilityLabel={`${have} of ${need}`} />
              </>
            ) : null}
            {badge.hint ? <ThemedText type="small">{badge.hint}</ThemedText> : null}
          </View>
        </Paper>
      )}

      {rungs && rungs.length > 1 && badge.ladder ? (
        <Paper>
          <BadgeLadder ladder={badge.ladder} rungs={rungs} onPress={onOpenBadge} />
        </Paper>
      ) : null}

      {collectionId && onOpenCollection ? (
        <LinkRow icon="fieldGuide" title="See the collection" onPress={() => onOpenCollection(collectionId)} />
      ) : null}
      {badge.kind === 'place' && onOpenPassport ? (
        <LinkRow icon="stamp" title="Open your passport" onPress={onOpenPassport} />
      ) : null}
      {!badge.earned && badge.kind !== 'collection' && onLog ? <OceanButton title="Log a dive" variant="log" icon="plus" onPress={onLog} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  view: {
    gap: 16,
  },
  stage: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  medal: {
    marginBottom: 6,
  },
  tags: {
    flexDirection: 'row',
    gap: 6,
  },
  center: {
    textAlign: 'center',
  },
  status: {
    gap: 8,
  },
  earned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  earnedOn: {
    fontFamily: Type.bodyHeavy,
    fontSize: 16,
    lineHeight: 22,
  },
  flex: {
    flex: 1,
    gap: 4,
  },
  date: {
    fontFamily: Type.display,
    fontSize: 24,
    lineHeight: 30,
  },
});
