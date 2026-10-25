import { useCallback, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from 'react-native';

/** Anything on screen that can say where it is (a View, a TextInput). */
type Measurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };

/**
 * Scroll a form to a field that needs the diver's eye (the one with a problem, the privacy choice).
 * Give `scrollView` and `onScroll` to the ScrollView, then call `scrollTo(field)`.
 *
 * It measures where the field and the ScrollView are on the screen and moves the difference, so the
 * field doesn't have to know how deep in the page it sits. `above` leaves room for its label.
 */
export function useScrollTo() {
  const scrollView = useRef<ScrollViewInstance>(null);
  const offset = useRef(0);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);
  const scrollTo = useCallback((field: Measurable | null | undefined, above = 72) => {
    const scroller = scrollView.current as unknown as Measurable | null;
    if (!field || !scroller) return;
    scroller.measureInWindow((_x, scrollerTop) => {
      field.measureInWindow((_fx, fieldTop) => {
        scrollView.current?.scrollTo({ y: Math.max(0, offset.current + fieldTop - scrollerTop - above), animated: true });
      });
    });
  }, []);
  return { scrollView, onScroll, scrollTo };
}
