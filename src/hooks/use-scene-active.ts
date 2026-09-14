import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

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
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduced(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const app = AppState.addEventListener('change', (value) => setForeground(value === 'active'));
    return () => { mounted = false; motion.remove(); app.remove(); };
  }, []);
  return focused && foreground && !reduced && !paused;
}
