import { Stack, router, useLocalSearchParams } from 'expo-router';

import { BadgeDetailView } from '@/components/rewards/badge-detail';
import { ladderOf } from '@/components/rewards/badge-groups';
import { EmptyState } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { WhenReady } from '@/components/when-ready';
import { useRewards } from '@/hooks/use-rewards';
import { BADGES } from '@/lib/rewards';

/** The web build pre-renders a page for every badge. */
export function generateStaticParams(): { badge: string }[] {
  return BADGES.map((b) => ({ badge: b.id }));
}

/** One badge in full. */
export default function BadgeRoute() {
  return (
    <WhenReady>
      <BadgeScreen />
    </WhenReady>
  );
}

function BadgeScreen() {
  const { badge: id } = useLocalSearchParams<{ badge: string }>();
  const { badges } = useRewards();
  const badge = badges.find((b) => b.id === id);
  if (!badge) {
    return (
      <Screen>
        <EmptyState icon="medal" title="Badge not found." />
      </Screen>
    );
  }
  return (
    <>
      {/* The medal's card has the title in large type, so the header is the back arrow alone (the title stays the page's name). */}
      <Stack.Screen options={{ title: badge.title, headerTitle: '' }} />
      <Screen>
        <BadgeDetailView
          badge={badge}
          rungs={ladderOf(badges, badge)}
          onOpenBadge={(b) => router.replace({ pathname: '/rewards/[badge]', params: { badge: b.id } })}
          onOpenCollection={(collectionId) => router.push({ pathname: '/rewards/collections/[id]', params: { id: collectionId } })}
          onOpenPassport={() => router.navigate({ pathname: '/map', params: { show: 'dived' } })}
          onLog={() => router.push('/log/new')}
        />
      </Screen>
    </>
  );
}
