import { afterEach, beforeAll, expect, test } from '@jest/globals';
import { OCEAN } from '@/lib/ocean';
import { createOceanStore, isWholeOcean, KEPT_FILES, oceanFileName, SLICE_MS, type OceanFiles } from '@/lib/ocean-store';
import { OCEAN_VERSION } from '@/lib/ocean-version';
import { createSeabedField, type OceanIsland } from '@/lib/seabed';
import {
  bakedDepth, bakedLattice, bakedRegions, bakedShoaling, clearSeabedBakes, hasOcean, readSeabedBake, seabedBakeKey, writeSeabedBake, type SeabedBake,
} from '@/lib/seabed-bake';
import { depthTexels, waterVertices } from '@/lib/seabed-depth';

// The explorer's ocean, ready before it is opened (ocean-store.ts): worked out in slices, kept in a file, read back by the next launch;
// anything unreadable, stale or damaged is ignored; only the last few files stay.
afterEach(() => clearSeabedBakes());
const islands: OceanIsland[] = [{ x: 0, z: 0, habitat: 'island' }, { x: 2.4, z: 12.4, habitat: 'mangrove' }];
const reach = { x: 10, z: 10 };
const key = seabedBakeKey(1, islands, reach);
/** Nothing waits for the thread to be given back here. */
const pacing = { pause: async () => undefined };

/** A phone's files, in memory: each written a tick after the last. */
function fakeFiles() {
  const kept = new Map<string, { bytes: Uint8Array; at: number }>();
  let tick = 0;
  const log: string[] = [];
  const files: OceanFiles = {
    async read(name) { log.push(`read ${name}`); return kept.get(name)?.bytes ?? null; },
    async write(name, bytes) { log.push(`write ${name}`); kept.set(name, { bytes: Uint8Array.from(bytes), at: ++tick }); },
    async remove(name) { log.push(`remove ${name}`); kept.delete(name); },
    async list() { return [...kept].map(([name, { at }]) => ({ name, at })); },
  };
  return { files, kept, log };
}

const same = (a: ArrayLike<number> | undefined, b: ArrayLike<number>) => {
  expect(a).toBeDefined();
  expect(a!.length).toBe(b.length);
  // (Object.is: the very same number, -0 and NaN included)
  for (let i = 0; i < b.length; i++) if (!Object.is(a![i], b[i])) throw new Error(`[${i}]: ${a![i]} and ${b[i]}`);
};

/** The ocean as the scene works it out for itself, from nothing, kept apart from what the store holds. */
let reference: Required<SeabedBake>;
beforeAll(() => {
  const other = { ...OCEAN };
  const texels = depthTexels(1, islands, other);
  reference = {
    lattice: createSeabedField(1, islands, other).lattice(reach), depth: Uint8Array.from(texels.data), region: Uint8Array.from(texels.region), regionMore: Uint8Array.from(texels.regionMore),
    shoaling: Float32Array.from(waterVertices(1, islands, texels.profile, other, reach).shoaling), bare: new Float32Array(0),
  };
}, 60000);
const expectHeldIsReference = () => {
  expect(hasOcean(key)).toBe(true);
  same(bakedLattice(1, islands, reach)!.positions, reference.lattice.positions);
  same(bakedLattice(1, islands, reach)!.indices, reference.lattice.indices);
  expect(bakedLattice(1, islands, reach)!.terrain).toBe(reference.lattice.terrain);
  same(bakedDepth(1, islands), reference.depth);
  same(bakedRegions(1, islands)?.region, reference.region);
  same(bakedRegions(1, islands)?.regionMore, reference.regionMore);
  same(bakedShoaling(1, islands, reach), reference.shoaling);
};

test('a first ask works the ocean out in slices, holds it, and keeps it in a file; what is held is what the scene would work out', async () => {
  const { files, kept } = fakeFiles();
  const store = createOceanStore(files, pacing);
  expect(store.has(1, islands, reach)).toBe(false);
  expect(await store.ensure(1, islands, reach)).toBe('worked out');
  expect(store.has(1, islands, reach)).toBe(true);
  expect(store.stats.slices).toBeGreaterThan(5);
  expectHeldIsReference();
  await store.settled();
  expect([...kept.keys()]).toEqual([oceanFileName(key)]);
  // (what is asked for again is held: nothing more to do)
  expect(await store.ensure(1, islands, reach)).toBe('held');
}, 60000);

test('the next launch reads it back from the file, bit for bit, and works nothing out', async () => {
  const first = fakeFiles();
  await createOceanStore(first.files, pacing).ensure(1, islands, reach);
  const bytes = first.kept.get(oceanFileName(key))!.bytes;
  await new Promise((resolve) => setTimeout(resolve, 0));
  // A new launch: nothing held, the same files.
  clearSeabedBakes();
  expect(hasOcean(key)).toBe(false);
  const next = createOceanStore({ ...first.files, async list() { return [{ name: oceanFileName(key), at: 1 }]; } }, pacing);
  expect(await next.ensure(1, islands, reach)).toBe('file');
  expect(next.stats.slices).toBe(0);
  expectHeldIsReference();
  // (the scene's own calls then find all of it, with no work: the held maps are what it uses)
  expect(depthTexels(1, islands).data).toBe(bakedDepth(1, islands));
  expect(waterVertices(1, islands, depthTexels(1, islands).profile, OCEAN, reach).shoaling).toBe(bakedShoaling(1, islands, reach));
  expect(createSeabedField(1, islands).lattice(reach)).toBe(bakedLattice(1, islands, reach));
  expect(bytes.byteLength).toBeGreaterThan(100000);
}, 60000);

test('a file that is damaged, cut short, from another version or another ocean is ignored and deleted, and the ocean worked out again', async () => {
  const good = fakeFiles();
  await createOceanStore(good.files, pacing).ensure(1, islands, reach);
  const name = oceanFileName(key), bytes = good.kept.get(name)!.bytes;
  const flipped = Uint8Array.from(bytes); flipped[bytes.length - 9] ^= 8;
  const oldVersion = writeSeabedBake(key, readSeabedBake(bytes).bake, 'an older version');
  const otherOcean = writeSeabedBake(seabedBakeKey(2, islands, reach), readSeabedBake(bytes).bake, OCEAN_VERSION);
  const lacking = writeSeabedBake(key, { ...readSeabedBake(bytes).bake, shoaling: Float32Array.of(1, 2, 3) }, OCEAN_VERSION);
  for (const [what, broken] of [['damaged', flipped], ['cut short', bytes.subarray(0, bytes.length >> 1)], ['not an ocean', new Uint8Array(400)], ['old version', oldVersion],
    ['another ocean’s', otherOcean], ['missing numbers', lacking]] as const) {
    clearSeabedBakes();
    const phone = fakeFiles();
    phone.kept.set(name, { bytes: Uint8Array.from(broken), at: 1 });
    const store = createOceanStore(phone.files, pacing);
    expect([what, await store.ensure(1, islands, reach)]).toEqual([what, 'worked out']);
    await store.settled();
    // (deleted, and then written afresh, from what was worked out)
    expect(phone.log.filter((entry) => entry === `remove ${name}`)).toHaveLength(1);
    expect(readSeabedBake(phone.kept.get(name)!.bytes).meta).toBe(OCEAN_VERSION);
    expectHeldIsReference();
  }
}, 120000);

test('files that cannot be read or written do not stop the ocean being worked out', async () => {
  const failing: OceanFiles = {
    read: async () => { throw new Error('no storage'); }, write: async () => { throw new Error('no room'); },
    remove: async () => { throw new Error('no'); }, list: async () => { throw new Error('no'); },
  };
  const store = createOceanStore(failing, pacing);
  expect(await store.ensure(1, islands, reach)).toBe('worked out');
  await store.settled();
  expectHeldIsReference();
  clearSeabedBakes();
  // Nowhere to keep them at all (the files cannot even be asked for): in memory only.
  expect(await createOceanStore(null, pacing).ensure(1, islands, reach)).toBe('worked out');
  expectHeldIsReference();
}, 60000);

test('asked again while it is on its way, it is one piece of work; someone waiting for it hurries it', async () => {
  // A clock that moves a millisecond each time it is read, so the slices are counted in steps.
  const counting = (hurry: boolean) => {
    let time = 0;
    const store = createOceanStore(null, { ...pacing, now: () => time++ });
    const asks = [store.ensure(1, islands, reach, hurry), store.ensure(1, islands, reach, false), store.ensure(1, islands, reach, false)];
    return Promise.all(asks).then((sources) => ({ sources, slices: store.stats.slices, longest: store.stats.longest }));
  };
  const idle = await counting(false);
  expect(idle.sources).toEqual(['worked out', 'worked out', 'worked out']);
  clearSeabedBakes();
  const waiting = await counting(true);
  // (once: all three are the same work, and the work was done once)
  expect(waiting.sources).toEqual(['worked out', 'worked out', 'worked out']);
  expect(idle.slices).toBeGreaterThan(waiting.slices * 2);
  expect(idle.longest).toBeLessThanOrEqual(SLICE_MS.idle + 3);
  expect(waiting.longest).toBeLessThanOrEqual(SLICE_MS.waiting + 3);
  expect(waiting.longest).toBeGreaterThan(SLICE_MS.idle + 3);
  // Hurried while it runs: an ask that comes later, from someone waiting, makes the rest of it long slices.
  clearSeabedBakes();
  let time = 0;
  const store = createOceanStore(null, { pause: () => new Promise<void>((resolve) => setTimeout(resolve, 0)), now: () => time++ });
  const quiet = store.ensure(1, islands, reach);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(store.stats.slices).toBeGreaterThan(0);
  expect(store.stats.longest).toBeLessThanOrEqual(SLICE_MS.idle + 3);
  void store.ensure(1, islands, reach, true);
  await quiet;
  expect(store.stats.longest).toBeGreaterThan(SLICE_MS.idle + 3);
}, 120000);

test('only the last few oceans are kept in files, the oldest going', async () => {
  const lone = [{ x: 0, z: 0, habitat: 'kelp' as const }];
  const { files, kept } = fakeFiles();
  const store = createOceanStore(files, pacing);
  const keys: string[] = [];
  for (let level = 1; level <= KEPT_FILES + 2; level++) {
    keys.push(seabedBakeKey(level, lone, { x: 6, z: 6 }));
    await store.ensure(level, lone, { x: 6, z: 6 });
    await store.settled();
  }
  expect(kept.size).toBe(KEPT_FILES);
  expect([...kept.keys()].sort()).toEqual(keys.slice(-KEPT_FILES).map(oceanFileName).sort());
}, 120000);

test('a file’s name is made from everything that shapes the ocean, and the version', () => {
  const names = new Set([
    key, seabedBakeKey(2, islands, reach), seabedBakeKey(1, [...islands].reverse(), reach), seabedBakeKey(1, islands, { x: 10, z: 11 }), seabedBakeKey(1, [islands[0]], reach),
    seabedBakeKey(1, [islands[0], { ...islands[1], habitat: 'kelp' }], reach), seabedBakeKey(1, [islands[0], { ...islands[1], z: 12.5 }], reach),
  ].map(oceanFileName));
  expect(names.size).toBe(7);
  expect(oceanFileName(key)).toBe(oceanFileName(seabedBakeKey(1, islands.map((island) => ({ ...island })), { x: 10, z: 10 })));
  expect(oceanFileName(key)).toMatch(/^ocean-[0-9a-f]{16}\.bin$/);
});

test('an ocean is whole only with every part the length it must be', () => {
  expect(isWholeOcean(reference, islands, reach)).toBe(true);
  expect(isWholeOcean({ ...reference, lattice: undefined }, islands, reach)).toBe(false);
  expect(isWholeOcean({ ...reference, depth: reference.depth.slice(4) }, islands, reach)).toBe(false);
  expect(isWholeOcean({ ...reference, region: undefined }, islands, reach)).toBe(false);
  expect(isWholeOcean({ ...reference, regionMore: reference.regionMore.slice(0, 8) }, islands, reach)).toBe(false);
  expect(isWholeOcean({ ...reference, shoaling: reference.shoaling.slice(1) }, islands, reach)).toBe(false);
  // (another reach has another length of water)
  expect(isWholeOcean(reference, islands, { x: 12, z: 10 })).toBe(false);
});
