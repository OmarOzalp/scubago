import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { Stamp } from '@/components/journal/stamp';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SEEN_KEY = 'scubago.introSeen.v1';

/** Whether to show the first-launch intro: once per install, until the diver starts exploring. */
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

/** The one thing to know before the first dive. The first-run Home does the rest: it asks for one dive, and the island fills as they log. */
const CARD = {
  title: 'Log what you see',
  body: 'Pick the site, tick every animal you saw. It works without a signal.',
};

const ART_WIDTH = 220;
const ART_HEIGHT = 150;

/** One short card on first launch: what ScubaGo is for, before the diver meets an empty log. */
export function IntroCards({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  // The card drifts in from the right; under Reduce Motion it is simply there.
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
        {/* Centred when it fits; scrolls when large text makes the card taller than the screen. */}
        <ScrollView style={styles.middle} contentContainerStyle={styles.middleContent} showsVerticalScrollIndicator={false}>
          <View style={styles.body} accessible accessibilityLabel={`${CARD.title}. ${CARD.body}`}>
            <Paper raised style={styles.card}>
              <Animated.View style={[styles.page, enter]}>
                <CardArt />
                <ThemedText type="display" style={styles.title}>
                  {CARD.title}
                </ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.text}>
                  {CARD.body}
                </ThemedText>
              </Animated.View>
            </Paper>
          </View>
        </ScrollView>

        {/* The button is the way out; there is no second card to skip past. */}
        <View style={styles.footer}>
          <OceanButton title="Start exploring" onPress={onDone} style={styles.button} />
        </View>
      </View>
    </Modal>
  );
}

/** The card's picture, painted on a watercolour wash like a plate in a field guide. Decorative. */
function CardArt() {
  const theme = useTheme();
  return (
    <View style={styles.art} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Wash width={ART_WIDTH} height={ART_HEIGHT} color={theme.wash} seed={11} style={StyleSheet.absoluteFill} />
      <Icon name="logbook" size={80} wash={theme.lagoon} washOpacity={0.3} />
      <Stamp lines={['LOGGED']} rotate={-10} animate delay={350} style={styles.stamp} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: Spacing.three,
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
  button: {
    alignSelf: 'stretch',
  },
});
