/**
 * Check the oceans shipped with the app (assets/baked/ocean, src/lib/ocean-pack.ts) against the computation, for every list of islands a diver can have:
 * Home's island first and then any of the others in any order they may have been found in, at every level the diver can have them (336 lists), each
 * ocean worked out from nothing and then read back through the ocean store from the files on disk, as the app reads them, every number compared with
 * Object.is: the depth map, the region maps, the water's shoaling, the seabed lattice's vertices and triangles.
 *
 *   npm run verify:ocean-packs                  (all 336: about three minutes)
 *   npm run verify:ocean-packs -- --levels=3,6  (some levels)
 *   npm run verify:ocean-packs -- --quick       (one list for each set and level)
 *
 * Exits with 1 on the first number that differs. Run it after scripts/bake-oceans.ts or any change to how the seabed is made.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ISLAND_PLACES, ISLANDS, type IslandId } from '../src/lib/archipelago';
import { PACK_REACH } from '../src/lib/ocean-pack';
import { createOceanStore, type OceanPackSource } from '../src/lib/ocean-store';
import type { OceanIsland } from '../src/lib/seabed';
import { bakedDepth, bakedLattice, bakedRegions, bakedShoaling, clearSeabedBakes } from '../src/lib/seabed-bake';
import { depthTexelSteps, waterVertexSteps } from '../src/lib/seabed-depth';
import { OCEAN } from '../src/lib/ocean';
import { createSeabedField } from '../src/lib/seabed';
import { finish } from '../src/lib/slices';
import { reachableSets } from './bake-oceans';

const ROOT = resolve(dirname(process.argv[1]), '..');
const DIR = join(ROOT, 'assets/baked/ocean');
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const levels = (arg('levels') ?? '1,2,3,4,5,6').split(',').map(Number);
const quick = process.argv.includes('--quick');
const place = (id: IslandId): OceanIsland => ({ x: ISLAND_PLACES[id][0], z: ISLAND_PLACES[id][1], habitat: ISLANDS[id] });

/** The files as they are on disk. */
const disk: OceanPackSource = {
  async read(name) { try { return new Uint8Array(readFileSync(join(DIR, `${name}.bin`))); } catch { return null; } },
};
const permutations = <T,>(items: T[]): T[][] => (items.length ? items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])) : [[]]);
/** Every list: Home's island first, then every ordering of every choice of the others that the level allows. */
function lists(level: number) {
  const out: IslandId[][] = [];
  for (const set of reachableSets(level)) {
    const orders = permutations(set.slice(1));
    for (const order of quick ? orders.slice(0, 1) : orders) out.push(['coral-reef', ...order]);
  }
  return out;
}

const same = (name: string, got: ArrayLike<number> | undefined, want: ArrayLike<number>) => {
  if (!got || got.length !== want.length) throw new Error(`${name}: ${got?.length} numbers, the computation has ${want.length}`);
  for (let i = 0; i < want.length; i++) if (!Object.is(got[i], want[i])) throw new Error(`${name}[${i}]: ${got[i]}, the computation has ${want[i]}`);
};

async function main() {
  const started = Date.now();
  let checked = 0, numbers = 0;
  for (const level of levels) {
    for (const ids of lists(level)) {
      const islands = ids.map(place), what = `level ${level}, ${ids.join(' > ')}`;
      // The computation, from nothing.
      clearSeabedBakes();
      const field = createSeabedField(level, islands);
      const texels = finish(depthTexelSteps(level, islands));
      const want = {
        lattice: field.lattice(PACK_REACH), depth: Uint8Array.from(texels.data), region: Uint8Array.from(texels.region), regionMore: Uint8Array.from(texels.regionMore),
        shoaling: Float32Array.from(finish(waterVertexSteps(level, islands, texels.profile, OCEAN, PACK_REACH)).shoaling),
      };
      want.lattice = { positions: [...want.lattice.positions], indices: [...want.lattice.indices], terrain: want.lattice.terrain };
      // The files, through the store the app uses (with no saved ocean: nothing is kept in a file here).
      clearSeabedBakes();
      const source = await createOceanStore(null, { pause: async () => undefined }, disk).ensure(level, islands, PACK_REACH, true);
      if (source !== 'shipped') throw new Error(`${what}: the ocean came from ${source}, not from the files`);
      try {
        same('depth', bakedDepth(level, islands), want.depth);
        same('region', bakedRegions(level, islands)?.region, want.region); same('regionMore', bakedRegions(level, islands)?.regionMore, want.regionMore);
        same('shoaling', bakedShoaling(level, islands, PACK_REACH), want.shoaling);
        const lattice = bakedLattice(level, islands, PACK_REACH);
        same('positions', lattice?.positions, want.lattice.positions); same('indices', lattice?.indices, want.lattice.indices);
        if (lattice!.terrain !== want.lattice.terrain) throw new Error('terrain');
      } catch (error) {
        console.error(`DIFFERS (${what}): ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
      checked++;
      numbers += want.depth.length + want.region.length + want.regionMore.length + want.shoaling.length + want.lattice.positions.length + want.lattice.indices.length + 1;
      if (checked % 20 === 0) console.log(`${checked} identical so far (${((Date.now() - started) / 60000).toFixed(1)} min)`);
    }
  }
  console.log(`ALL IDENTICAL: ${checked} oceans (levels ${levels.join(',')}${quick ? ', one list for each set' : ', every list'}), ${numbers} numbers compared with Object.is, in ${((Date.now() - started) / 60000).toFixed(1)} min`);
}
void main();
