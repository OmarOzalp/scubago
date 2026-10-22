import { router } from 'expo-router';

import { Screen, ScreenHeader } from '@/components/journal/screen';
import { IslandsView } from '@/components/rewards/islands-view';
import { ThemedText } from '@/components/themed-text';
import { WhenReady } from '@/components/when-ready';
import { useRewards } from '@/hooks/use-rewards';

/** The archipelago's islands: which have risen, who lives there, and who to look for next. */
export default function IslandsRoute() {
  return (
    <WhenReady>
      <IslandsScreen />
    </WhenReady>
  );
}

function IslandsScreen() {
  const { islands } = useRewards();
  const raised = islands.filter((i) => i.unlocked).length;
  return (
    <Screen>
      <ScreenHeader eyebrow={`${raised} of ${islands.length} raised`} title="Islands" />
      <ThemedText themeColor="textSecondary">
        Your home island is always there. Every other island rises from the sea with the first animal you log from its habitat.
      </ThemedText>
      <IslandsView islands={islands} onOpenSpecies={(id) => router.push(`/species/${id}`)} />
    </Screen>
  );
}
