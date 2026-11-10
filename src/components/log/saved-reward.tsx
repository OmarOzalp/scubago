import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomBar } from '@/components/dive/bottom-bar';
import { Bookplate } from '@/components/dive/marks';
import { Stamp } from '@/components/journal/stamp';
import { NewBadgesCelebration } from '@/components/rewards/new-badges';
import { CARD_GAP, SpeciesCard, onGridLayout, useCardGrid } from '@/components/species-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress';
import { MaxContentWidth, Size, Space, TypeScale } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { UNLISTED_ID } from '@/lib/catalog';
import { formatDiveNumber, milestoneAt } from '@/lib/dives';
import { leave } from '@/lib/leave';
import { islandGrowth, rarityFind } from '@/lib/log-reward';
import { RARITY_TEXT } from '@/lib/rarity';
import type { BadgeResult } from '@/lib/rewards';
import type { Species } from '@/lib/types';

/** What a save did: how many sightings went in, the species that were new to the diver, and the page. */
export type LogResult = {
  count: number;
  siteName: string;
  /** The animals logged, in the order they were ticked (catalogue species, and "something else" under its name). */
  animals: Species[];
  /** First-time species: the ones in `animals` the diver had never logged. */
  newSpecies: Species[];
  /** How many species the field guide holds now. */
  dexNumber: number;
  /** The page written (a new dive) or added to. */
  dive?: { id: string; number: number; written: boolean };
};

/**
 * After saving: a reward, not a receipt. The animals just added (as picture cards, with the rarity now
 * said), which of them are new to the field guide, how much the island grew, and any badge earned. Then
 * Done, or See your island. The stamp stays as a small touch. Nothing moves under Reduce Motion.
 * (More on the page itself, such as asking a buddy to sign, is on the dive's page.)
 */
export function SavedReward({
  result,
  newBadges,
  onBadgesSeen,
  endOnPage = false,
  onLogMore,
}: {
  result: LogResult;
  newBadges: BadgeResult[];
  onBadgesSeen: (ids: string[]) => void;
  /** The page isn't underneath this screen (it replaced the page's saved screen): going to the page opens it. */
  endOnPage?: boolean;
  /** Start another page (only after writing a new one). */
  onLogMore?: () => void;
}) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const { animals, newSpecies, count, siteName, dive, dexNumber } = result;
  const milestone = dive?.written ? milestoneAt(dive.number) : null;
  const growth = islandGrowth(dexNumber - newSpecies.length, dexNumber);
  const newIds = new Set(newSpecies.map((s) => s.id));
  const [inner, setInner] = useState(393 - 2 * Space.s4);
  // Three across, two at large text sizes (as the picker does), so long names fit.
  const { cardWidth } = useCardGrid(Math.min(inner, 400));

  // The page is underneath when sightings were added from it, and then it is gone back to; a page just written, or one
  // whose saved screen this replaced ("Add what you saw"), is opened in this screen's place.
  const openPage = dive ? () => (dive.written || endOnPage ? router.replace(`/dive/${dive.id}`) : leave(`/dive/${dive.id}`)) : undefined;
  const done = dive && (!dive.written || endOnPage) ? openPage! : () => leave('/');
  // A dive written without animals can have them added now: the same steps, on its page.
  const addWhatYouSaw = dive?.written && count === 0 ? () => router.replace({ pathname: '/log/new', params: { dive: dive.id, then: 'page' } }) : undefined;
  const title = dive?.written ? 'Dive saved' : dive ? `Added to ${formatDiveNumber(dive.number)}` : 'Saved';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* The form's own back arrow steps back through its steps; here the navigator's leaves. */}
      <Stack.Screen options={{ title: 'Saved', headerLeft: undefined }} />
      <ScrollView contentContainerStyle={styles.scroll} onLayout={onGridLayout((width) => setInner(width - 2 * Space.s4))}>
        <View style={styles.head}>
          <Stamp
            lines={dive?.written ? [formatDiveNumber(dive.number).toUpperCase(), siteName.toUpperCase().slice(0, 22)] : ['Logged', siteName.toUpperCase().slice(0, 22)]}
            animate
            delay={150}
            rotate={-6}
            style={styles.stampCentre}
          />
          <Text accessibilityRole="header" style={[TypeScale.hero, styles.center, { color: theme.text }]}>
            {title}
          </Text>
          <Text style={[TypeScale.body, styles.center, { color: theme.textSecondary }]}>{siteName}</Text>
        </View>

        {animals.length > 0 ? (
          <View style={styles.section}>
            <Text accessibilityRole="header" style={[TypeScale.headline, { color: theme.text }]}>
              {animals.length === 1 ? 'You added' : `You added ${animals.length} animals`}
            </Text>
            <View style={styles.grid}>
              {animals.map((s) => {
                const find = s.id === UNLISTED_ID ? null : rarityFind(s.rarity);
                return (
                  <SpeciesCard
                    key={s.id}
                    species={s}
                    width={cardWidth}
                    count={1}
                    isNew={newIds.has(s.id)}
                    note={find ? { text: find, color: RARITY_TEXT[scheme][s.rarity] } : undefined}
                    accessibilityLabel={`${s.commonName}${find ? `, ${find.toLowerCase()}` : ''}${newIds.has(s.id) ? ', new in your field guide' : ''}`}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        {growth ? <IslandGrowth growth={growth} /> : null}
        {milestone ? <Bookplate at={milestone} siteName={siteName} style={styles.stretch} /> : null}
        <NewBadgesCelebration fresh={newBadges} onSeen={onBadgesSeen} />

        {count === 0 ? (
          <View style={styles.section}>
            <Text style={[TypeScale.body, { color: theme.textSecondary }]}>No animals this time.</Text>
            {addWhatYouSaw ? <Button title="Add what you saw" icon="plus" variant="secondary" onPress={addWhatYouSaw} /> : null}
          </View>
        ) : null}
      </ScrollView>
      <BottomBar maxWidth={440}>
        <Button title="Done" onPress={done} />
        <Button title="See your island" variant="secondary" icon="home" onPress={() => router.dismissTo('/(tabs)')} />
        {onLogMore ? (
          <Pressable onPress={onLogMore} accessibilityRole="button" accessibilityLabel="Log another dive" style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
            <Text style={[TypeScale.bodyStrong, { color: theme.tint }]}>Log another dive</Text>
          </Pressable>
        ) : null}
      </BottomBar>
    </View>
  );
}

/** "Your island grew: 2 more animals to the next level", with the bar filling to where it now is. */
function IslandGrowth({ growth }: { growth: NonNullable<ReturnType<typeof islandGrowth>> }) {
  const theme = useTheme();
  return (
    <Card style={styles.growth}>
      <Text accessibilityLiveRegion="polite" style={[TypeScale.headline, { color: theme.text }]}>
        {growth.text}
      </Text>
      {growth.unlock ? <Text style={[TypeScale.callout, { color: theme.textSecondary }]}>{growth.unlock}</Text> : null}
      {growth.bar ? <ProgressBar fraction={growth.fraction} from={growth.from} accessibilityLabel="Progress to the next island level" max={100} now={Math.round(growth.fraction * 100)} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: Space.s4, paddingBottom: Space.s6, gap: Space.s6, width: '100%', maxWidth: Math.min(440, MaxContentWidth), alignSelf: 'center' },
  head: { alignItems: 'center', gap: Space.s2, paddingTop: Space.s2 },
  center: { textAlign: 'center' },
  // The stamp's own alignSelf is flex-start: centre it over the title.
  stampCentre: { alignSelf: 'center', marginBottom: Space.s2 },
  stretch: { alignSelf: 'stretch' },
  section: { gap: Space.s3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  growth: { gap: Space.s2 },
  link: { minHeight: Size.hit, alignItems: 'center', justifyContent: 'center' },
});
