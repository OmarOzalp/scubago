import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A tip that teaches by showing up, then gets out of the way: shown the first `times` times it has
 * somewhere to be useful (`active`), never again after that. Like the intro, the count lives in storage
 * for good; if storage can't be read the tip stays away rather than show every time.
 *
 * It counts as shown when it appears, not when the screen mounts: Home is mounted at launch, long before
 * a first animal swims there to tap. `hideAfter` (ms) takes it down by itself; `dismiss` takes it down on
 * the diver's first move.
 */
export function useTip(key: string, { active = true, times = 1, hideAfter }: { active?: boolean; times?: number; hideAfter?: number } = {}): { show: boolean; dismiss: () => void } {
  // How many times it was shown before this screen opened (null until storage has answered).
  const [before, setBefore] = useState<number | null>(null);
  const [gone, setGone] = useState(false);
  const counted = useRef(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(key)
      .then((value) => {
        if (live) setBefore(Number.parseInt(value ?? '0', 10) || 0);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key]);
  const show = active && before !== null && before < times && !gone;
  // Counted once, the first time it is on screen.
  useEffect(() => {
    if (!show || counted.current || before === null) return;
    counted.current = true;
    AsyncStorage.setItem(key, String(before + 1)).catch(() => undefined);
  }, [show, before, key]);
  useEffect(() => {
    if (!show || hideAfter === undefined) return;
    const timer = setTimeout(() => setGone(true), hideAfter);
    return () => clearTimeout(timer);
  }, [show, hideAfter]);
  const dismiss = useCallback(() => setGone(true), []);
  return { show, dismiss };
}
