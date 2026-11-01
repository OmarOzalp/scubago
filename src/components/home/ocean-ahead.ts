import { useEffect, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { ISLAND_PLACES, ISLANDS, type IslandId } from '@/lib/archipelago';
import { waterReach } from '@/lib/explorer-view';
import type { OceanIsland } from '@/lib/seabed';
import { seabedBakeName } from '@/lib/seabed-bake';
import { whenMarked } from './three/scene-marks';

/**
 * The explorer's ocean, ready before it is opened. The ocean of several islands takes a phone seconds (src/lib/ocean-store.ts), so once
 * Home is on show with its animals and the phone has nothing else to do, the ocean the explorer will ask for (the islands found so far in
 * the order it takes them, at the level, with the water's reach on this screen) is read back from its file or worked out in short slices
 * and saved. Opening the explorer then finds it held. It is done again after a level-up or a newly found island, and not again when the
 * ocean is already held or saved.
 */

/** How long the phone is left alone after Home's first animal is on show, and after what Home is busy with, before the ocean is begun (ms). */
export const IDLE_MS = 2500;

/** What the explorer will build its ocean from, or null when no ocean of its own is needed (Home's island alone, whose bake ships with the app). */
export function oceanAhead(level: number, ids: readonly IslandId[], screen: { width: number; height: number }) {
  const islands: OceanIsland[] = ids.map((id) => ({ x: ISLAND_PLACES[id][0], z: ISLAND_PLACES[id][1], habitat: ISLANDS[id] }));
  const reach = waterReach({ width: screen.width, height: screen.height, level, islands: islands.map((island) => [island.x, island.z] as const) });
  const water = { x: reach.x, z: reach.z };
  // (an island set with a bake shipped for it, Home's island alone in the usual explorer, has its ocean already)
  return islands.length && seabedBakeName(level, islands, water) === null ? { level, islands, reach: water } : null;
}

/**
 * Resolves when Home's island has an animal on show, `IDLE_MS` have passed and the phone has a moment to spare (where there is
 * `requestIdleCallback`, which React Native has and Safari has not); false if `cancelled` is set meanwhile.
 */
async function whenIdle(cancelled: { current: boolean }) {
  await whenMarked('scubago:first-animal');
  if (cancelled.current) return false;
  await new Promise<void>((resolve) => {
    setTimeout(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => resolve(), { timeout: 5000 }) : resolve()), IDLE_MS);
  });
  return !cancelled.current;
}

/** Have the explorer's ocean for these islands at this level ready, while the phone is idle (`enabled`: there is something to explore). */
export function useOceanAhead(level: number, ids: readonly IslandId[], enabled: boolean) {
  const { width, height } = useWindowDimensions();
  const key = ids.join(',');
  const plan = useMemo(() => (enabled ? oceanAhead(level, key ? key.split(',') as IslandId[] : [], { width, height }) : null), [enabled, level, key, width, height]);
  useEffect(() => {
    if (!plan) return;
    const cancelled = { current: false };
    void whenIdle(cancelled).then((idle) => {
      // Required here, not imported: the ocean store and the bakes' file list load when they are needed, and Home's screen stays light.
      const { oceanStore } = require('./three/seabed-assets') as typeof import('./three/seabed-assets'); // eslint-disable-line @typescript-eslint/no-require-imports
      if (idle) void oceanStore().ensure(plan.level, plan.islands, plan.reach);
    });
    return () => { cancelled.current = true; };
  }, [plan]);
}
