import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { BadgeLadder } from '@/components/rewards/badge-ladder';
import { KIND_TITLE } from '@/components/rewards/badge-groups';
import { BadgeMedal } from '@/components/rewards/badge-medal';
import { badgeLabel } from '@/components/rewards/badge-tile';
import { longDate, TIER_LABEL } from '@/components/rewards/format';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { List, ListRow } from '@/components/ui/list';
import { ProgressBar } from '@/components/ui/progress';
import { Tag } from '@/components/ui/tag';
import { Space, TypeScale } from '@/constants/theme';
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
      {/* The hero: the medal (on a sun wash once earned), its name, what earns it, and the day it was earned. */}
      <Card padded={false} style={[styles.stage, badge.earned && { backgroundColor: theme.sunSoft }]}>
        <View accessible accessibilityLabel={badgeLabel(badge)} style={styles.medal}>
          <BadgeMedal badge={badge} size={150} ribbon={badge.earned} />
        </View>
        <View style={styles.tags}>
          <Tag label={KIND_TITLE[badge.kind].replace(/s$/, '')} />
          {badge.tier ? <Tag label={TIER_LABEL[badge.tier]} /> : null}
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
            <Icon name="verified" size={22} color={theme.tint} />
            <Text style={[TypeScale.bodyStrong, { color: theme.text }]}>{badge.earnedOn ? `Earned ${longDate(badge.earnedOn)}` : 'Earned'}</Text>
          </View>
        ) : null}
      </Card>

      {badge.earned ? null : (
        <Card style={styles.status}>
          <ThemedText type="footnoteStrong" themeColor="textSecondary">
            Not earned yet
          </ThemedText>
          {need > 1 ? (
            <>
              <Text style={[TypeScale.figure, { color: theme.text }]}>
                {have} of {need}
              </Text>
              <ProgressBar fraction={have / need} max={need} now={have} accessibilityLabel={`${have} of ${need}`} />
            </>
          ) : null}
          {badge.hint ? <ThemedText type="callout">{badge.hint}</ThemedText> : null}
        </Card>
      )}

      {rungs && rungs.length > 1 && badge.ladder ? (
        <Card>
          <BadgeLadder ladder={badge.ladder} rungs={rungs} onPress={onOpenBadge} />
        </Card>
      ) : null}

      {collectionId && onOpenCollection ? (
        <List>
          <ListRow leading="fieldGuide" title="See the collection" onPress={() => onOpenCollection(collectionId)} />
        </List>
      ) : null}
      {badge.kind === 'place' && onOpenPassport ? (
        <List>
          <ListRow leading="stamp" title="See your stamps" onPress={onOpenPassport} />
        </List>
      ) : null}
      {!badge.earned && badge.kind !== 'collection' && onLog ? <Button title="Log a dive" variant="log" icon="plus" onPress={onLog} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  view: {
    gap: Space.s4,
  },
  stage: {
    alignItems: 'center',
    gap: Space.s3,
    paddingVertical: Space.s6,
    paddingHorizontal: Space.s4,
  },
  medal: {
    marginBottom: Space.s1,
  },
  tags: {
    flexDirection: 'row',
    gap: Space.s2,
  },
  center: {
    textAlign: 'center',
  },
  status: {
    gap: Space.s2,
  },
  earned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s2,
  },
});
