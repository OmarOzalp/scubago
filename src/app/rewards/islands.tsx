import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Disclosure } from '@/components/journal/disclosure';
import { Screen, ScreenHeader } from '@/components/journal/screen';
import { IslandsView } from '@/components/rewards/islands-view';
import { ThemedText } from '@/components/themed-text';
import { WhenReady } from '@/components/when-ready';
import { useRewards } from '@/hooks/use-rewards';
import { HOME_ISLAND } from '@/lib/archipelago';

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
      <View style={styles.about}>
        <Disclosure label="About islands" hint="Shows what raises an island">
          <ThemedText type="small" themeColor="textSecondary">
            Your home island is always there. Every other island rises with the first animal you log from its habitat.
          </ThemedText>
        </Disclosure>
      </View>
      {/* The explorer opens on the island asked for (`?island=`), as from Home's pills; Home's own island is where it opens without one. */}
      <IslandsView
        islands={islands}
        onOpenIsland={(id) => router.push(id === HOME_ISLAND ? '/explore' : { pathname: '/explore', params: { island: id } })}
        onOpenSpecies={(id) => router.push(`/species/${id}`)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The row is 44 points to hit; its margins take back the room it does not draw in.
  about: {
    marginVertical: -8,
  },
});
