import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

function subscribeAppState(onChange: () => void) {
  const subscription = AppState.addEventListener('change', onChange);
  return () => subscription?.remove();
}
const isForeground = () => AppState.currentState === 'active';
const serverForeground = () => false;

/**
 * Whether an ambient scene should be animating right now: only while its screen
 * is focused, the app is in the foreground, the user hasn't asked for reduced
 * motion, and nothing has paused it explicitly. Starts conservative (still)
 * until the reduce-motion setting has been read.
 */
export function useSceneActive(paused = false) {
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const foreground = useSyncExternalStore(subscribeAppState, isForeground, serverForeground);
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    let motionChanged = false;
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      motionChanged = true;
      setReduced(value);
    });
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => { if (mounted && !motionChanged) setReduced(value); })
      .catch(() => { if (mounted && !motionChanged) setReduced(false); });
    return () => { mounted = false; motion?.remove(); };
  }, []);
  return focused && foreground && !reduced && !paused;
}

/** Whether the scene's screen is on show: focused, with the app in the foreground (motion settings aside). */
export function useSceneVisible() {
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const foreground = useSyncExternalStore(subscribeAppState, isForeground, serverForeground);
  return focused && foreground;
}
