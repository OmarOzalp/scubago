import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { LinkRow } from '@/components/journal/link-row';
import { Ledger } from '@/components/journal/ledger';
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
      <ScreenHeader eyebrow="Badges, sets and stamps" title="Rewards" />
      <Ledger
        items={[
          { value: String(earned), unit: ` / ${badges.length}`, label: 'Badges', accessibilityLabel: `${earned} of ${badges.length} badges earned` },
          { value: String(complete), unit: ` / ${collections.length}`, label: 'Sets', accessibilityLabel: `${complete} of ${collections.length} collections complete` },
          { value: String(stamps), label: stamps === 1 ? 'Stamp' : 'Stamps', accessibilityLabel: `${plural(stamps, 'passport stamp')}` },
          { value: String(raised), unit: ` / ${islands.length}`, label: 'Islands', accessibilityLabel: `${raised} of ${islands.length} islands raised` },
        ]}
      />
      <LinkRow
        icon="stamp"
        title="Site passport"
        detail={stamps > 0 ? `${plural(stamps, 'site')} stamped in ${plural(passport.length, 'place')}` : 'A stamp for every site you dive'}
        role="link"
        onPress={() => router.push('/rewards/passport')}
      />
      <LinkRow
        icon="island"
        title="Islands"
        detail={`${raised} of ${islands.length} raised from the animals you have found`}
        role="link"
        onPress={() => router.push('/rewards/islands')}
      />
      <Segmented
        accessibilityLabel="Show"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'badges', label: 'Badges' },
          { value: 'collections', label: 'Collections' },
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
