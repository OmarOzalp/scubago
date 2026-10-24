import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Disclosure } from '@/components/journal/disclosure';
import { Screen, ScreenHeader } from '@/components/journal/screen';
import { PassportView } from '@/components/rewards/passport-view';
import { ThemedText } from '@/components/themed-text';
import { WhenReady } from '@/components/when-ready';
import { useRewards } from '@/hooks/use-rewards';

/** The site passport: a page for each place the diver has dived, with a stamp for every site. */
export default function PassportRoute() {
  return (
    <WhenReady>
      <PassportScreen />
    </WhenReady>
  );
}

function PassportScreen() {
  const { passport } = useRewards();
  return (
    <Screen>
      <ScreenHeader title="Site passport" />
      {passport.length > 0 ? (
        <View style={styles.about}>
          <Disclosure label="About the passport" hint="Shows what earns a stamp">
            <ThemedText type="small" themeColor="textSecondary">
              A site gets a stamp when you log a dive or a sighting there. It sits on the page of its place and shows the day of your first visit.
            </ThemedText>
          </Disclosure>
        </View>
      ) : null}
      <PassportView groups={passport} onOpenSite={(id) => router.push(`/site/${id}`)} onLog={() => router.push('/log/new')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The row is 44 points to hit; its margins take back the room it does not draw in.
  about: {
    marginVertical: -8,
  },
});
