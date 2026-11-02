import { expect, test } from '@jest/globals';
import { ISLAND_PLACES, ISLANDS, type IslandId } from '@/lib/archipelago';
import type { OceanIsland } from '@/lib/seabed';
import { depthGrid, habitatsOf, OCEAN_REGIONS, regionFiller } from '@/lib/seabed-depth';

// The region maps (whose water each texel is) are made by regionFiller, which has a short way for islands that each have a water of their own (the
// explorer's). Against the formula written out plainly, as the depth map first made it, for every order the islands can be listed in with Home's first.
const place = (id: IslandId): OceanIsland => ({ x: ISLAND_PLACES[id][0], z: ISLAND_PLACES[id][1], habitat: ISLANDS[id] });
const OTHERS: IslandId[] = ['kelp-forest', 'volcanic-pinnacle', 'mangroves', 'shipwreck'];

/** The formula as it was first written: a channel for each water, summed in order. */
function plainly(islands: readonly OceanIsland[]) {
  const { x0, z0, width, depth, columns, rows } = depthGrid(islands);
  const habitats = habitatsOf(islands);
  const region = new Uint8Array(columns * rows * 4), regionMore = new Uint8Array(columns * rows * 4);
  const weights = new Float32Array(OCEAN_REGIONS), away = new Float64Array(islands.length), slots = islands.map((island) => habitats.indexOf(island.habitat));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const x = x0 + (i + .5) / columns * width, z = z0 + (j + .5) / rows * depth, k = (j * columns + i) * 4;
      if (islands.length === 1) { region[k] = 255; continue; }
      weights.fill(0);
      let closest = Infinity;
      for (let n = 0; n < islands.length; n++) { const d = Math.hypot(x - islands[n].x, z - islands[n].z); away[n] = d; if (d < closest) closest = d; }
      for (let n = 0; n < islands.length; n++) if (slots[n] >= 0) weights[slots[n]] += Math.exp(-(away[n] - closest) / 2.4);
      let total = 0;
      for (let c = 0; c < OCEAN_REGIONS; c++) total += weights[c];
      for (let c = 0; c < 4; c++) { region[k + c] = Math.round(255 * weights[c] / total); regionMore[k + c] = Math.round(255 * weights[c + 4] / total); }
    }
  }
  return { region, regionMore, rows };
}
const same = (name: string, a: Uint8Array, b: Uint8Array) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error(`${name}[${i}]: ${a[i]} and ${b[i]}`);
};
const orders = (rest: IslandId[]): IslandId[][] => (rest.length ? rest.flatMap((id, i) => orders([...rest.slice(0, i), ...rest.slice(i + 1)]).map((tail) => [id, ...tail])) : [[]]);

test('the region maps are the plain formula for every order of the islands, Home first', () => {
  // (every ordered choice of the other islands: 64 lists; the first of each size is enough to cover the sizes of the maps, the rest the orders)
  const lists: IslandId[][] = [];
  for (let size = 1; size <= 4; size++) for (const order of orders(OTHERS)) if (!lists.some((l) => l.length === size && l.every((id, n) => id === order[n]))) lists.push(order.slice(0, size));
  expect(lists).toHaveLength(64);
  for (const others of lists) {
    const islands = ['coral-reef' as IslandId, ...others].map(place), want = plainly(islands);
    const region = new Uint8Array(want.region.length), regionMore = new Uint8Array(want.region.length);
    regionFiller(islands, region, regionMore)(0, want.rows);
    same(`region of ${others.join(',')}`, region, want.region);
    same(`regionMore of ${others.join(',')}`, regionMore, want.regionMore);
  }
}, 120000);

test('islands that share a water, and one island alone, are worked out as before', () => {
  const shared: OceanIsland[] = [{ x: 0, z: 0, habitat: 'island' }, { x: 3, z: 9, habitat: 'kelp' }, { x: -2, z: 17, habitat: 'kelp' }];
  for (const islands of [shared, [place('coral-reef')]]) {
    const want = plainly(islands), region = new Uint8Array(want.region.length), regionMore = new Uint8Array(want.region.length);
    regionFiller(islands, region, regionMore)(0, want.rows);
    same('region', region, want.region); same('regionMore', regionMore, want.regionMore);
  }
});
