import { router } from 'expo-router';

import { Ledger } from '@/components/journal/ledger';
import { Screen, ScreenHeader } from '@/components/journal/screen';
import { plural } from '@/components/rewards/format';
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
  const stamps = passport.reduce((n, g) => n + g.stamps.length, 0);
  const dives = passport.reduce((n, g) => n + g.stamps.reduce((m, s) => m + s.dives, 0), 0);
  return (
    <Screen>
      <ScreenHeader eyebrow="Your dive passport" title="Site passport" />
      {passport.length > 0 ? (
        <>
          <ThemedText themeColor="textSecondary">One stamp for every dive site you have logged a dive or a sighting at, on the page of the place it belongs to.</ThemedText>
          <Ledger
            items={[
              { value: String(stamps), label: stamps === 1 ? 'Site' : 'Sites', accessibilityLabel: plural(stamps, 'site stamped') },
              { value: String(passport.length), label: passport.length === 1 ? 'Place' : 'Places', accessibilityLabel: plural(passport.length, 'place') },
              { value: String(dives), label: dives === 1 ? 'Dive' : 'Dives', accessibilityLabel: `${plural(dives, 'dive')} at stamped sites` },
            ]}
          />
        </>
      ) : null}
      <PassportView groups={passport} onOpenSite={(id) => router.push(`/site/${id}`)} onLog={() => router.push('/log/new')} />
    </Screen>
  );
}
