import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { Ocean } from '@/constants/palette';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG } from '@/lib/catalog';

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

const CARDS = [
  {
    emoji: '🤿',
    title: 'Log what you see',
    body: 'After a dive, pick the site and tick every animal you saw. It takes seconds, and works without a signal.',
  },
  {
    emoji: '🐠',
    title: 'Build your collection',
    body: `${CATALOG.length} species to find, from pygmy seahorses to whale sharks. Something not on the list? Log it in your own words.`,
  },
  {
    emoji: '🏝️',
    title: 'Grow your island',
    body: 'The animals you log come to swim around your own island, and it grows as your collection does.',
  },
];

/** Three short cards on first launch: what ScubaGo is for, before the diver meets an empty log. */
export function IntroCards({ visible, onDone, syncAvailable }: { visible: boolean; onDone: () => void; syncAvailable: boolean }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const card = CARDS[index];
  const last = index === CARDS.length - 1;

  return (
    <Modal visible={visible} animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onDone} accessibilityViewIsModal>
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="Skip the introduction" style={styles.skip}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Skip
          </ThemedText>
        </Pressable>
        <View style={styles.body} accessible accessibilityLabel={`${index + 1} of ${CARDS.length}. ${card.title}. ${card.body}`} accessibilityLiveRegion="polite">
          <ThemedText style={styles.emoji}>{card.emoji}</ThemedText>
          <ThemedText type="subtitle" style={styles.title}>
            {card.title}
          </ThemedText>
          <ThemedText style={styles.text}>{card.body}</ThemedText>
          {last && syncAvailable ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
              Sign in whenever you like to back up your log and see it on any device.
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {CARDS.map((c, i) => (
            <View key={c.title} style={[styles.dot, { backgroundColor: i === index ? Ocean.primary : theme.backgroundSelected }]} />
          ))}
        </View>
        <OceanButton
          title={last ? 'Start exploring' : 'Next'}
          onPress={() => (last ? onDone() : setIndex(index + 1))}
          style={styles.button}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: Spacing.four, justifyContent: 'center', gap: Spacing.four },
  skip: { position: 'absolute', top: Spacing.six, right: Spacing.three, minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  body: { alignItems: 'center', gap: Spacing.three, maxWidth: 420, alignSelf: 'center' },
  emoji: { fontSize: 64, lineHeight: 76 },
  title: { textAlign: 'center', fontSize: 28, lineHeight: 36 },
  text: { textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 4 },
  button: { alignSelf: 'stretch', maxWidth: 420, width: '100%', marginHorizontal: 'auto' },
});
