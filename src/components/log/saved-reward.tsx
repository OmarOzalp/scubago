import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { BottomBar } from '@/components/dive/bottom-bar';
import { Bookplate } from '@/components/dive/marks';
import { Paper } from '@/components/journal/paper';
import { NewBadge, Stamp } from '@/components/journal/stamp';
import { OceanButton } from '@/components/ocean-button';
import { NewBadgesCelebration } from '@/components/rewards/new-badges';
import { SpeciesArt } from '@/components/species-art';
import { CARD_GAP, onGridLayout, useCardGrid } from '@/components/species-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { UNLISTED_ID } from '@/lib/catalog';
import { formatDiveNumber, milestoneAt } from '@/lib/dives';
import { leave } from '@/lib/leave';
import { islandGrowth, rarityFind } from '@/lib/log-reward';
import { RARITY_COLOR, RARITY_TEXT } from '@/lib/rarity';
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
  const { animals, newSpecies, count, siteName, dive, dexNumber } = result;
  const milestone = dive?.written ? milestoneAt(dive.number) : null;
  const growth = islandGrowth(dexNumber - newSpecies.length, dexNumber);
  const newIds = new Set(newSpecies.map((s) => s.id));
  const [inner, setInner] = useState(393 - 2 * Spacing.three);
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
    <ThemedView style={styles.container}>
      {/* The form's own back arrow steps back through its steps; here the navigator's leaves. */}
      <Stack.Screen options={{ title: 'Saved', headerLeft: undefined }} />
      <ScrollView contentContainerStyle={styles.scroll} onLayout={onGridLayout((width) => setInner(width - 2 * Spacing.three))}>
        <View style={styles.head}>
          <Stamp
            lines={dive?.written ? [formatDiveNumber(dive.number).toUpperCase(), siteName.toUpperCase().slice(0, 22)] : ['Logged', siteName.toUpperCase().slice(0, 22)]}
            animate
            delay={150}
            rotate={-6}
          />
          <ThemedText type="display" accessibilityRole="header" style={styles.center}>
            {title}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {siteName}
          </ThemedText>
        </View>

        {animals.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="heading" accessibilityRole="header">
              {animals.length === 1 ? 'You added' : `You added ${animals.length} animals`}
            </ThemedText>
            <View style={styles.grid}>
              {animals.map((s) => (
                <AnimalCard key={s.id} species={s} width={cardWidth} isNew={newIds.has(s.id)} />
              ))}
            </View>
          </View>
        ) : null}

        {growth ? <IslandGrowth growth={growth} /> : null}
        {milestone ? <Bookplate at={milestone} siteName={siteName} style={styles.stretch} /> : null}
        <NewBadgesCelebration fresh={newBadges} onSeen={onBadgesSeen} />

        {count === 0 ? (
          <View style={styles.section}>
            <ThemedText themeColor="textSecondary">No animals this time.</ThemedText>
            {addWhatYouSaw ? <OceanButton title="Add what you saw" icon="plus" variant="secondary" onPress={addWhatYouSaw} style={styles.stretch} /> : null}
          </View>
        ) : null}
      </ScrollView>
      <BottomBar maxWidth={440}>
        <OceanButton title="Done" onPress={done} style={styles.stretch} />
        <OceanButton title="See your island" variant="secondary" icon="home" onPress={() => router.dismissTo('/(tabs)')} style={styles.stretch} />
        {onLogMore ? (
          <Pressable onPress={onLogMore} accessibilityRole="button" accessibilityLabel="Log another dive" style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
            <Text style={[styles.linkText, { color: theme.tint }]}>Log another dive</Text>
          </Pressable>
        ) : null}
      </BottomBar>
    </ThemedView>
  );
}

/** One animal just added: its drawing, common name and rarity (said now), edged in the rarity colour; "New" when it is a first. */
function AnimalCard({ species, width, isNew }: { species: Species; width: number; isNew: boolean }) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const find = species.id === UNLISTED_ID ? null : rarityFind(species.rarity);
  return (
    <View
      accessible
      accessibilityLabel={`${species.commonName}${find ? `, ${find.toLowerCase()}` : ''}${isNew ? ', new in your field guide' : ''}`}
      style={[styles.card, { width, backgroundColor: theme.backgroundElement, borderColor: theme.cardBorder, borderTopColor: find ? RARITY_COLOR[species.rarity] : theme.cardBorder }]}>
      <View style={styles.art}>
        <SpeciesArt species={species} width={width * 0.78} />
      </View>
      <Text numberOfLines={2} style={[styles.name, { color: theme.text }]}>
        {species.commonName}
      </Text>
      {find ? <Text style={[styles.find, { color: RARITY_TEXT[scheme][species.rarity] }]}>{find}</Text> : null}
      {isNew ? <NewBadge style={styles.badge} /> : null}
    </View>
  );
}

/** "Your island grew: 2 more animals to the next level", with the bar filling to where it now is. */
function IslandGrowth({ growth }: { growth: NonNullable<ReturnType<typeof islandGrowth>> }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const to = `${Math.round(growth.fraction * 100)}%` as const;
  const fill: ViewStyle = reduced
    ? { width: to }
    : ({
        width: to,
        animationName: { '0%': { width: `${Math.round(growth.from * 100)}%` }, '100%': { width: to } },
        animationDuration: '700ms',
        animationDelay: '350ms',
        animationTimingFunction: 'ease-out',
        animationFillMode: 'both',
      } as ViewStyle);
  return (
    <Paper style={styles.growth}>
      <ThemedText type="smallBold" style={{ fontFamily: Type.bodyHeavy, fontSize: 16, lineHeight: 22 }} accessibilityLiveRegion="polite">
        {growth.text}
      </ThemedText>
      {growth.unlock ? <ThemedText themeColor="textSecondary">{growth.unlock}</ThemedText> : null}
      {growth.bar ? (
        <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Animated.View style={[styles.fill, { backgroundColor: theme.lagoon }, fill]} />
        </View>
      ) : null}
    </Paper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: Spacing.three, paddingBottom: Spacing.four, gap: Spacing.four, width: '100%', maxWidth: 440, alignSelf: 'center' },
  head: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.two },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  section: { gap: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  card: { borderWidth: 1, borderTopWidth: 4, borderRadius: Radius.md, overflow: 'hidden', paddingBottom: 10 },
  art: { height: 80, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: Type.bodyHeavy, fontSize: 15, lineHeight: 19, minHeight: 38, paddingHorizontal: 8 },
  find: { fontFamily: Type.bodyHeavy, fontSize: 13, lineHeight: 16, paddingHorizontal: 8 },
  badge: { position: 'absolute', top: 6, right: 6 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontFamily: Type.bodyBold, fontSize: 15, lineHeight: 20 },
  growth: { gap: Spacing.two + 2 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
});
