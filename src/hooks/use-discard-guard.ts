import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

import { confirmAction } from '@/lib/confirm';

/**
 * A screen with work in it asks before it closes. It covers every way out: the header's back
 * button, the swipe-down on an iOS modal (which usePreventRemove turns off while this is on),
 * Android's back and the browser's.
 *
 * Returns a function for a screen that closes itself once it has saved: call it just before
 * `router.back()`, so that close isn't questioned.
 */
export function useDiscardGuard(
  dirty: boolean,
  { title = 'Discard this entry?', message = 'What you’ve entered won’t be saved.' }: { title?: string; message?: string } = {},
): () => void {
  const navigation = useNavigation();
  const leaving = useRef(false);
  usePreventRemove(dirty, ({ data }) => {
    void (async () => {
      if (leaving.current || (await confirmAction({ title, message, confirmLabel: 'Discard', destructive: true }))) {
        leaving.current = true;
        // The same action, which now goes through: it has already been asked about this screen.
        navigation.dispatch(data.action);
      }
    })();
  });
  return useCallback(() => {
    leaving.current = true;
  }, []);
}

/**
 * Android's back button, before the navigator gets it: `onBack` returns true when it has dealt with
 * it (a step back, a picker closed) and false to let the screen close as usual.
 */
export function useHardwareBack(onBack: () => boolean) {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Listeners are asked newest first, so this one comes before the navigator's.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => latest.current());
    return () => subscription.remove();
  }, []);
}
