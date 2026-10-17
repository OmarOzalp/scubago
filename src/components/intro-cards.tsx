import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IslandArt } from '@/components/home/island-art';
import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { Stamp } from '@/components/journal/stamp';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import type { Species } from '@/lib/types';

const SEEN_KEY = 'scubago.introSeen.v1';

/** Whether to show the first-launch intro: once per install, until the diver finishes or skips it. */
export function useIntro(): { show: boolean; done: () => void } {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(SEEN_KEY)
      .then((seen) => {
        if (live && !seen) setShow(true);
      })
      .catch(() => undefined); // no storage: skip the intro rather than show it every time
    return () => {
      live = false;
    };
  }, []);
  const done = () => {
    setShow(false);
    AsyncStorage.setItem(SEEN_KEY, new Date().toISOString()).catch(() => undefined);
  };
  return { show, done };
}

type Art = 'log' | 'collection' | 'island';

const CARDS: { art: Art; title: string; body: string }[] = [
  {
    art: 'log',
    title: 'Log what you see',
    body: 'After a dive, pick the site and tick every animal you saw. It takes seconds, and works without a signal.',
  },
  {
    art: 'collection',
    title: 'Build your collection',
    body: `${CATALOG.length} species to find, from pygmy seahorses to whale sharks. Something not on the list? Log it in your own words.`,
  },
  {
    art: 'island',
    title: 'Grow your island',
    body: 'The animals you log come to swim around your own island, and it grows as your collection does.',
  },
];

/** The collection card's plates, smallest to biggest, as its words say. */
const COLLECTION = ['pygmy-seahorse', 'clownfish', 'whale-shark']
  .map((id) => CATALOG_BY_ID.get(id))
  .filter((s): s is Species => !!s);
const TILT = [-9, -2, 8];

const ART_WIDTH = 220;
const ART_HEIGHT = 150;
/** Same seed, same wash: each card keeps its own shape. */
const SEED: Record<Art, number> = { log: 11, collection: 29, island: 53 };

/** Three short cards on first launch: what ScubaGo is for, before the diver meets an empty log. */
export function IntroCards({ visible, onDone, syncAvailable }: { visible: boolean; onDone: () => void; syncAvailable: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const card = CARDS[index];
  const last = index === CARDS.length - 1;
  // Each new card drifts in from the right; under Reduce Motion it is simply there.
  const enter: ViewStyle = reduceMotion
    ? {}
    : ({
        animationName: { from: { opacity: 0, transform: [{ translateX: 18 }] } },
        animationDuration: '320ms',
        animationTimingFunction: 'ease-out',
        animationFillMode: 'backwards',
      } as ViewStyle);

  return (
    <Modal visible={visible} animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onDone} accessibilityViewIsModal>
      <View
        style={[
          styles.screen,
          { backgroundColor: theme.background, paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.four },
        ]}>
        <View style={styles.topBar}>
          <Pressable
            onPress={onDone}
            accessibilityRole="button"
            accessibilityLabel="Skip the introduction"
            style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.6 : 1 }]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Skip
            </ThemedText>
          </Pressable>
        </View>

        {/* Centred when it fits; scrolls when large text makes the card taller than the screen. */}
        <ScrollView style={styles.middle} contentContainerStyle={styles.middleContent} showsVerticalScrollIndicator={false}>
          {/* One stable, live element, so each new card is read out as it arrives. */}
          <View style={styles.body} accessible accessibilityLabel={`${index + 1} of ${CARDS.length}. ${card.title}. ${card.body}`} accessibilityLiveRegion="polite">
            <Paper raised style={styles.card}>
              <Animated.View key={index} style={[styles.page, enter]}>
                <CardArt art={card.art} />
                <ThemedText type="display" style={styles.title}>
                  {card.title}
                </ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.text}>
                  {card.body}
                </ThemedText>
                {last && syncAvailable ? (
                  <ThemedText type="caption" themeColor="textSecondary" style={styles.text}>
                    Sign in whenever you like to back up your log and see it on any device.
                  </ThemedText>
                ) : null}
              </Animated.View>
            </Paper>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {/* The current page is a longer bar as well as a stronger colour. */}
          <View style={styles.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {CARDS.map((c, i) => (
              <View
                key={c.title}
                style={[
                  styles.dot,
                  i === index ? { width: 22, backgroundColor: theme.lagoon } : { backgroundColor: theme.textSecondary, opacity: 0.35 },
                ]}
              />
            ))}
          </View>
          <OceanButton title={last ? 'Start exploring' : 'Next'} onPress={() => (last ? onDone() : setIndex(index + 1))} style={styles.button} />
        </View>
      </View>
    </Modal>
  );
}

/** Each card's picture, painted on a watercolour wash like a plate in a field guide. Decorative. */
function CardArt({ art }: { art: Art }) {
  const theme = useTheme();
  const scheme = useSchemeName();
  return (
    <View style={styles.art}>
      <Wash width={ART_WIDTH} height={ART_HEIGHT} color={theme.wash} seed={SEED[art]} style={StyleSheet.absoluteFill} />
      {art === 'log' ? (
        <>
          <Icon name="logbook" size={80} wash={theme.lagoon} washOpacity={0.3} />
          <Stamp lines={['LOGGED']} rotate={-10} animate delay={350} style={styles.stamp} />
        </>
      ) : art === 'collection' ? (
        <View style={styles.plates}>
          {COLLECTION.map((species, i) => (
            <View
              key={species.id}
              style={[
                styles.plate,
                {
                  backgroundColor: theme.backgroundElement,
                  boxShadow: Shadow[scheme].raised,
                  zIndex: i === 1 ? 1 : 0,
                  transform: [{ translateY: i === 1 ? -6 : 8 }, { rotate: `${TILT[i]}deg` }],
                },
              ]}>
              <SpeciesAvatar species={species} size={i === 1 ? 96 : 74} />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.island}>
          <IslandArt habitat="island" level={2} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: Spacing.three,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  skip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: {
    flex: 1,
    marginHorizontal: -Spacing.three,
  },
  // Room at the sides for the card's shadow, which the scroll view would otherwise clip.
  middleContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  body: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  card: {
    paddingTop: Spacing.five,
    paddingBottom: Spacing.four + 4,
    paddingHorizontal: 22,
  },
  page: {
    alignItems: 'center',
    gap: 12,
  },
  art: {
    width: ART_WIDTH,
    height: ART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  stamp: {
    position: 'absolute',
    right: 10,
    bottom: 14,
  },
  plates: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  plate: {
    borderRadius: Radius.md,
    marginHorizontal: -7,
  },
  // The drawing has open water round it: it is drawn larger than the wash so the island fills it.
  island: {
    position: 'absolute',
    width: 232,
    height: 216,
    left: (ART_WIDTH - 232) / 2,
    top: (ART_HEIGHT - 216) / 2,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    textAlign: 'center',
  },
  text: {
    textAlign: 'center',
  },
  footer: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: 18,
    paddingTop: Spacing.two,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.round,
  },
  button: {
    alignSelf: 'stretch',
  },
});
