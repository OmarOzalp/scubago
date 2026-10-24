import type { IslandShape } from '@/lib/island-outline';
import { OCEAN } from '@/lib/ocean';
import { createSeabed, type Seabed } from '@/lib/seabed';

/**
 * A seabed as flat as a table, as deep as the open ocean is: nothing is too shallow for any animal on it, and
 * nothing is in its way. For the tests of how a species moves by itself (its speed, turns, distance from the island,
 * leaps and breaths), which the island's own shallows, steep reef and shelf would otherwise bend; the tests of
 * staying clear of the bottom and in view (swim-depth.test.ts) run over the islands' real seabeds.
 * Pass it as `seabed` to `createMarineMotion`.
 */
export function flatSeabed(level = 1, shape: IslandShape = 'reef'): Seabed {
  // (as deep as an island's shelf drops to, not the Coral Reef's wall: the open ocean the species' character tests were written for)
  const real = createSeabed(level, shape), floor = OCEAN.seabed.shelfFloor - OCEAN.seabed.floorDrop, at = () => floor;
  // (the fields of what is blocked are found for this bottom, apart from the real one's under the same names)
  return { level, deepest: floor, floor: at, solid: at, ground: at, exact: at, distanceTo: (name, blocked) => real.distanceTo(`flat|${name}`, blocked) };
}
