import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  // Once the screen is on its way out (saved, or the diver chose Discard) it stops asking. The
  // navigator keeps a close blocked until the block is lifted, so it is lifted before the close.
  const [released, setReleased] = useState(false);
  const disablePrevention = usePreventRemove(dirty && !released, ({ repeat }) => {
    void (async () => {
      if (await confirmAction({ title, message, confirmLabel: 'Discard', destructive: true })) {
        setReleased(true);
        // The same action, which now goes through: it has already been asked about this screen.
        repeat();
      }
    })();
  });
  return useCallback(() => {
    setReleased(true);
    disablePrevention();
  }, [disablePrevention]);
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
