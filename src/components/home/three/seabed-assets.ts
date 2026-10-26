import { useEffect, useState } from 'react';
import type { OceanIsland } from '@/lib/seabed';
import { hasSeabedBake, registerSeabedBake, seabedBakeKey, seabedBakeName } from '@/lib/seabed-bake';
import type { WaterExtent } from '@/lib/seabed-lattice';
import { readAssetBytes } from './asset-bytes';
import { SEABED_FILES } from './seabed-files';

/**
 * The seabed built ahead of time (src/lib/seabed-bake.ts), loaded from the app's files: each bake once, when first
 * asked for (at launch for the island Home will show, then for what Home may show next). A bake that can't be read is
 * worked out instead, as it is for islands without one.
 */
const requests = new Map<string, Promise<boolean>>();

/** Load (once) the bake for these islands at this level and reach. True once it is in use; false when there is none or it failed. */
export function loadSeabedBake(level: number, islands: readonly OceanIsland[], reach?: WaterExtent): Promise<boolean> {
  const name = seabedBakeName(level, islands, reach), module = name ? SEABED_FILES[name] : undefined;
  if (!name || module === undefined) return Promise.resolve(false);
  const key = seabedBakeKey(level, islands, reach);
  if (hasSeabedBake(key)) return Promise.resolve(true);
  let request = requests.get(name);
  if (!request) {
    request = readAssetBytes(module).then((bytes) => {
      const registered = registerSeabedBake(bytes);
      if (registered !== key) throw new Error(`Seabed bake ${name} is for ${registered}, not ${key}`);
      return true;
    }).catch((error) => {
      console.warn('a seabed bake failed to load; working it out instead', error);
      return false;
    });
    requests.set(name, request);
  }
  return request;
}

/**
 * Whether a scene can build these islands' ocean now: their bake is in use, or there is none to wait for (none at all,
 * or it failed). Only new islands (another island on Home's card, another reach) wait for theirs; a new level never
 * takes the ocean away: it builds at once, from a bake loaded ahead (preloadSeabedBakes) or worked out. Not `wanted`
 * yet (nothing would see it), nothing is loaded and it isn't ready.
 */
export function useSeabedReady(level: number, islands: readonly OceanIsland[], reach?: WaterExtent, wanted = true) {
  const name = seabedBakeName(level, islands, reach), key = seabedBakeKey(level, islands, reach);
  // (the islands as placed and the reach, without the level)
  const where = key.slice(key.indexOf('|') + 1);
  const waiting = !!name && SEABED_FILES[name] !== undefined && !hasSeabedBake(key);
  const [readyFor, setReadyFor] = useState<string | null>(waiting ? null : where);
  // (ready for these islands once; a new level of them needs no wait)
  if (!waiting && readyFor !== where) setReadyFor(where);
  const ready = readyFor === where || !waiting;
  useEffect(() => {
    if (ready || !wanted) return;
    let current = true;
    loadSeabedBake(level, islands, reach).then(() => { if (current) setReadyFor(where); });
    return () => { current = false; };
    // (the islands and reach by their key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, where, wanted]);
  return ready && wanted;
}

/** The lone island Home's card shows for a habitat (as sanctuary-scene.tsx places it). */
export const loneIsland = (habitat: OceanIsland['habitat']): OceanIsland[] => [{ x: 0, z: 0, habitat }];

/**
 * Load ahead what the island scenes may need next: each of these habitats' islands alone at this level and the next
 * (a level up), and Home's island alone in the explorer (`explorer`: its reach), so a change builds at once.
 */
export function preloadSeabedBakes(level: number, habitats: readonly OceanIsland['habitat'][], explorer?: WaterExtent) {
  const asked: Promise<boolean>[] = [];
  for (const habitat of habitats) for (const at of [level, level + 1]) asked.push(loadSeabedBake(at, loneIsland(habitat)));
  if (explorer && habitats.length) asked.push(loadSeabedBake(level, loneIsland(habitats[0]), explorer));
  return Promise.all(asked);
}
