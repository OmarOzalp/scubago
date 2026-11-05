import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/** Whether the diver has paused the ocean animation (You screen). A new key: nothing stored before is read or changed. */
export const OCEAN_PAUSED_KEY = 'scubago.oceanPaused.v1';

let paused = false;
let loaded = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(OCEAN_PAUSED_KEY)
    .then((value) => {
      if (value === '1' && !paused) {
        paused = true;
        emit();
      }
    })
    .catch(() => undefined); // no storage: the ocean simply moves
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Sets and remembers the choice. */
export function setOceanPaused(value: boolean) {
  loaded = true;
  paused = value;
  emit();
  AsyncStorage.setItem(OCEAN_PAUSED_KEY, value ? '1' : '0').catch(() => undefined);
}

/** Whether the ocean animation is paused by choice (Reduce Motion pauses it too, separately). */
export function useOceanPaused(): boolean {
  return useSyncExternalStore(subscribe, () => paused, () => false);
}

/** For tests: forget the in-memory state so the next reader loads from storage again. */
export function resetOceanPausedForTests() {
  paused = false;
  loaded = false;
  listeners.clear();
}
