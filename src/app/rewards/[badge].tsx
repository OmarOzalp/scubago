import { Stack, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/journal/screen';
import { Wash } from '@/components/journal/wash';
import { BadgeDetailView } from '@/components/rewards/badge-detail';
import { ladderOf } from '@/components/rewards/badge-groups';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WhenReady } from '@/components/when-ready';
import { useRewards } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
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
  const theme = useTheme();
  const badge = badges.find((b) => b.id === id);
  if (!badge) {
    return (
      <ThemedView style={styles.missing}>
        <View style={styles.missingArt}>
          <Wash width={120} height={84} color={theme.wash} seed={31} style={StyleSheet.absoluteFill} />
          <Icon name="medal" size={40} />
        </View>
        <ThemedText type="heading">Badge not found.</ThemedText>
      </ThemedView>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: badge.title }} />
      <Screen>
        <BadgeDetailView
          badge={badge}
          rungs={ladderOf(badges, badge)}
          onOpenBadge={(b) => router.replace({ pathname: '/rewards/[badge]', params: { badge: b.id } })}
          onOpenCollection={(collectionId) => router.push({ pathname: '/rewards/collections/[id]', params: { id: collectionId } })}
          onOpenPassport={() => router.push('/rewards/passport')}
          onLog={() => router.push('/log/new')}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  missingArt: { width: 120, height: 84, alignItems: 'center', justifyContent: 'center' },
});
