import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/**
 * Whether the island explorer keeps its scene (its canvas, its GL context, the islands it has built) mounted and paused while it is closed, so that opening
 * it again finds everything there, or lets it go as it always did (the scene is then built afresh at every open).
 *
 * It keeps it unless
 * - `EXPO_PUBLIC_EXPLORER_KEEP=0` is set (a build-time switch, for a phone that cannot afford the memory: restart Metro with --clear), or
 * - the phone has said it is short of memory (AppState's 'memoryWarning', iOS) since the app started: from then on, for the rest of the session, a
 *   closed explorer keeps nothing, and one that is closed now lets its scene go.
 * (There is only ever one explorer: a tab, which Rewards → Islands and links go to rather than open another.)
 */
const switchedOn = () => process.env.EXPO_PUBLIC_EXPLORER_KEEP !== '0';

let relieved = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

/** The phone is short of memory: no explorer keeps its scene from now on, and the ones kept let go. */
export function relieveMemory() {
  if (relieved) return;
  relieved = true;
  changed();
}

/** Whether a closed explorer may keep its scene. */
export const mayKeep = () => switchedOn() && !relieved;

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** `mayKeep`, for a component. */
export function useMayKeep() {
  return useSyncExternalStore(subscribe, mayKeep, () => false);
}

/** Forgets a memory warning (for tests). */
export function forgetKeeping() {
  relieved = false;
  changed();
}

// The phone's own word that it needs memory back (React Native's AppState: iOS sends it; there is nothing to hear elsewhere).
try {
  AppState.addEventListener('memoryWarning', relieveMemory);
} catch {
  // No AppState here (a test without React Native): nothing to hear.
}
