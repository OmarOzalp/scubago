import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LinkRow } from '@/components/journal/link-row';
import { Screen, ScreenHeader } from '@/components/journal/screen';
import { Segmented } from '@/components/segmented';
import { WhenReady } from '@/components/when-ready';
import { BadgesView } from '@/components/rewards/badges-view';
import { CollectionsView } from '@/components/rewards/collections-view';
import { countEarned } from '@/components/rewards/badge-groups';
import { plural } from '@/components/rewards/format';
import { useNewBadges } from '@/hooks/use-new-badges';
import { useRewards } from '@/hooks/use-rewards';
import { useMyUserId } from '@/lib/store';

type Tab = 'badges' | 'collections';

/** Badges and collections: what the diver has earned, and what is waiting to be. */
export default function RewardsRoute() {
  return (
    <WhenReady>
      <RewardsScreen />
    </WhenReady>
  );
}

function RewardsScreen() {
  const { tab: asked } = useLocalSearchParams<{ tab?: string }>();
  const { badges, collections, passport, islands, ready } = useRewards();
  const { fresh, markSeen } = useNewBadges({ owner: useMyUserId(), badges, ready });
  const [tab, setTab] = useState<Tab>(asked === 'collections' ? 'collections' : 'badges');
  const newIds = useMemo(() => new Set(fresh.map((b) => b.id)), [fresh]);
  // Once the page has been looked at, what was new on it is not new any more.
  useEffect(() => () => markSeen(), [markSeen]);

  const earned = countEarned(badges);
  const complete = collections.filter((c) => c.completed).length;
  const stamps = passport.reduce((n, g) => n + g.stamps.length, 0);
  const raised = islands.filter((i) => i.unlocked).length;

  return (
    <Screen>
      <ScreenHeader title="Badges & collections" />
      <View style={styles.links}>
        <LinkRow
          compact
          icon="stamp"
          title="Site passport"
          detail={stamps > 0 ? plural(stamps, 'stamp') : 'No stamps yet'}
          role="link"
          onPress={() => router.push('/rewards/passport')}
        />
        <LinkRow compact icon="island" title="Islands" detail={`${raised} of ${islands.length} raised`} role="link" onPress={() => router.push('/rewards/islands')} />
      </View>
      {/* The counts are in the tab names, so the page has no row of figures above them. */}
      <Segmented
        accessibilityLabel="Show"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'badges', label: `Badges ${earned}/${badges.length}`, accessibilityLabel: `Badges, ${earned} of ${badges.length} earned` },
          { value: 'collections', label: `Collections ${complete}/${collections.length}`, accessibilityLabel: `Collections, ${complete} of ${collections.length} complete` },
        ]}
      />
      {tab === 'badges' ? (
        <BadgesView
          badges={badges}
          newIds={newIds}
          onOpenBadge={(badge) => router.push({ pathname: '/rewards/[badge]', params: { badge: badge.id } })}
          onLog={() => router.push('/log/new')}
        />
      ) : (
        <CollectionsView collections={collections} onOpen={(c) => router.push({ pathname: '/rewards/collections/[id]', params: { id: c.id } })} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The two ways into other pages sit together, closer than the page's other blocks.
  links: {
    gap: 8,
  },
});
