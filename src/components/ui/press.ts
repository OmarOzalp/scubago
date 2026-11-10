import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, type ViewStyle } from 'react-native';

import { Motion } from '@/constants/theme';

const EASE = `cubic-bezier(${Motion.easing.join(', ')})`;

/** Whether the phone (or browser) asks for reduced motion; follows it as it changes. */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.()).then(
      (value) => {
        if (live) setReduced(!!value);
      },
      () => {},
    );
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => setReduced(!!value));
    return () => {
      live = false;
      subscription?.remove?.();
    };
  }, []);
  return reduced;
}

/**
 * Press feedback for cards and buttons: scale to 0.98 while pressed. On the web the change eases over
 * Motion.press (120 ms); on a phone the scale is set at once (it is 2%, too small to read as a jump).
 * Under Reduce Motion nothing scales. Never a "sink".
 */
export function usePressScale(): (pressed: boolean) => ViewStyle {
  const reduced = useReduceMotion();
  return (pressed) => {
    if (reduced) return {};
    const scale: ViewStyle = { transform: [{ scale: pressed ? Motion.pressScale : 1 }] };
    if (Platform.OS !== 'web') return scale;
    return { ...scale, transitionProperty: 'transform, background-color', transitionDuration: `${Motion.press}ms`, transitionTimingFunction: EASE } as ViewStyle;
  };
}

/** Web only: background colour eases on press (rows); elsewhere it changes at once. */
export const pressColorTransition: ViewStyle =
  Platform.OS === 'web' ? ({ transitionProperty: 'background-color', transitionDuration: `${Motion.press}ms`, transitionTimingFunction: EASE } as ViewStyle) : {};
