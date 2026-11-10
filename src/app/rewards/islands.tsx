import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Disclosure } from '@/components/journal/disclosure';
import { IslandsView } from '@/components/rewards/islands-view';
import { ThemedText } from '@/components/themed-text';
import { Screen, ScreenTitle } from '@/components/ui/screen';
import { Space } from '@/constants/theme';
import { WhenReady } from '@/components/when-ready';
import { useRewards } from '@/hooks/use-rewards';
import { ORIGIN } from '@/components/home/explorer-origin';
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
      <ScreenTitle title="Your islands" subtitle={`${raised} of ${islands.length} raised`} />
      <View style={styles.about}>
        <Disclosure label="About islands" hint="Shows what raises an island">
          <ThemedText type="subhead" themeColor="textSecondary">
            Your home island is always there. Every other island rises with the first animal you log from its habitat.
          </ThemedText>
        </Disclosure>
      </View>
      {/* The explorer opens on the island asked for (`?island=`), as from Home's pills; Home's own island is where it opens without one. It is a tab (kept
          mounted when closed), so this goes to that tab, over the Islands screen that is left behind, instead of a second explorer opened over them; `from` has closing put them back. */}
      <IslandsView
        islands={islands}
        onOpenIsland={(id) => router.dismissTo({ pathname: '/explore', params: id === HOME_ISLAND ? { from: ORIGIN.islands } : { island: id, from: ORIGIN.islands } })}
        onOpenSpecies={(id) => router.push(`/species/${id}`)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The row is 44 points to hit; its margins take back the room it does not draw in.
  about: {
    marginVertical: -Space.s2,
  },
});
