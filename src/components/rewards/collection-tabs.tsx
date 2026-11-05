import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { BadgesView } from '@/components/rewards/badges-view';
import { CollectionsView } from '@/components/rewards/collections-view';
import { useNewBadges } from '@/hooks/use-new-badges';
import { useRewards } from '@/hooks/use-rewards';
import { useMyUserId } from '@/lib/store';

/** The Field guide's Sets view: every collection, each with "x of y" and its next step; one opens its page. */
export function SetsTab() {
  const { collections } = useRewards();
  return <CollectionsView collections={collections} onOpen={(c) => router.push({ pathname: '/rewards/collections/[id]', params: { id: c.id } })} />;
}

/** The Field guide's Badges view: every badge, earned ones in colour, the rest with their next step; one opens its page. */
export function BadgesTab() {
  const { badges, ready } = useRewards();
  const { fresh, markSeen } = useNewBadges({ owner: useMyUserId(), badges, ready });
  const newIds = useMemo(() => new Set(fresh.map((b) => b.id)), [fresh]);
  // Once the badges have been looked at, what was new on them is not new any more.
  useEffect(() => () => markSeen(), [markSeen]);
  return <BadgesView badges={badges} newIds={newIds} onOpenBadge={(badge) => router.push({ pathname: '/rewards/[badge]', params: { badge: badge.id } })} />;
}
