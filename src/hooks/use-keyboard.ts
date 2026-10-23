import { useEffect, useState, type RefObject } from 'react';
import { Dimensions, Keyboard, Platform, type View } from 'react-native';

/**
 * Whether the on-screen keyboard is up, and how far it reaches into `container`: pad the bottom of
 * the container by `overlap` and what sits at its foot (a bar with the main button) stays above the
 * keyboard. The overlap is measured against where the container is on the screen, so it is 0 where
 * the window already shrinks for the keyboard, and the two never add up. Without a container,
 * only `open` is known.
 *
 * Keyboard events come on iOS and Android only: elsewhere (the web) nothing changes.
 */
export function useKeyboard(container?: RefObject<View | null>): { open: boolean; overlap: number } {
  const [state, setState] = useState({ open: false, overlap: 0 });
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    // iOS says where the keyboard is going before it moves, and again if its height changes.
    const shown = Keyboard.addListener(ios ? 'keyboardWillChangeFrame' : 'keyboardDidShow', (event) => {
      const top = event.endCoordinates.screenY;
      const open = top < Dimensions.get('window').height;
      const view = container?.current;
      if (!open || !view) {
        setState({ open, overlap: 0 });
        return;
      }
      view.measureInWindow((_x, y, _width, height) => setState({ open: true, overlap: Math.max(0, y + height - top) }));
    });
    const hidden = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setState({ open: false, overlap: 0 }));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [container]);
  return state;
}
