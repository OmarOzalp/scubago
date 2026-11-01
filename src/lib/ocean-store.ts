import { OCEAN } from './ocean';
import { OCEAN_VERSION } from './ocean-version';
import { createSeabedField, type OceanIsland } from './seabed';
import { hasOcean, readSeabedBake, rememberOcean, seabedBakeKey, writeSeabedBake, type SeabedBake } from './seabed-bake';
import { depthGrid, depthTexelSteps, waterVertexCount, waterVertexSteps } from './seabed-depth';
import type { WaterExtent } from './seabed-lattice';
import { runSliced, type Pacing, type Steps } from './slices';

/**
 * The explorer's ocean, ready before it is opened. The ocean of several islands (the depth map and its region maps, the seabed's
 * lattice, the water's shoaling) is the longest wait of the explorer's first open (6 s of 11 on a phone's interpreter at level 3),
 * and it is the same every time for the same islands, level and reach. So it is worked out once, in slices that never freeze the screen
 * (slices.ts), and kept: in memory (seabed-bake.ts, as a bake of its own) and in a file on the phone (`OceanFiles`), under a name made
 * from everything that shapes it and a version that changes whenever the numbers would (ocean-version.ts: the tests fail while it is
 * stale). The next open finds it in memory or reads it back; a file that is damaged, cut short or from another version is ignored,
 * deleted, and the ocean worked out again.
 */

/** Where the oceans are kept: a file each, by name. The phone's cache directory (ocean-files.ts), the web's IndexedDB (ocean-files.web.ts). */
export type OceanFiles = {
  /** The file's bytes, or null if there is none. */
  read(name: string): Promise<Uint8Array | null>;
  /** Keep these bytes under this name, replacing what was there; never leaving a partly written file under it. */
  write(name: string, bytes: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
  /** Every file and when it was written (ms). */
  list(): Promise<{ name: string; at: number }[]>;
};

/** How many oceans are kept on the phone: the last few written (a level-up or a newly found island makes the old ones useless). */
export const KEPT_FILES = 4;
/** How long (ms) a slice works before giving the thread back: while idle (the phone is showing Home), and while someone waits for it. */
export const SLICE_MS = { idle: 12, waiting: 40 };

/** The name of the file for an ocean: a hash of its version and key (the file itself says which key it is for, which is what is checked). */
export function oceanFileName(key: string) {
  const text = `${OCEAN_VERSION}|${key}`;
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
    b = (b ^ (b >>> 13)) >>> 0;
  }
  return `ocean-${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}.bin`;
}

/**
 * Everything the ocean of these islands is, worked out in steps (the depth map, the seabed's lattice, the water's shoaling): the very same
 * numbers as the scene works out itself. Each part is also kept where the scene finds it, so it is not done twice.
 */
export function* oceanSteps(level: number, islands: readonly OceanIsland[], reach: WaterExtent): Steps<SeabedBake> {
  const texels = yield* depthTexelSteps(level, islands);
  const lattice = yield* createSeabedField(level, islands).latticeSteps(reach);
  const water = yield* waterVertexSteps(level, islands, texels.profile, OCEAN, reach);
  return { lattice, depth: texels.data, region: texels.region, regionMore: texels.regionMore, shoaling: Float32Array.from(water.shoaling) };
}

/** Whether a bake holds every part of the ocean of these islands at this reach, each the length it must be. */
export function isWholeOcean(bake: SeabedBake, islands: readonly OceanIsland[], reach: WaterExtent) {
  const { columns, rows } = depthGrid(islands), texels = columns * rows * 4;
  return !!bake.lattice && bake.lattice.positions.length % 3 === 0 && bake.lattice.indices.length % 3 === 0
    && bake.depth?.length === texels && bake.region?.length === texels && bake.regionMore?.length === texels
    && bake.shoaling?.length === waterVertexCount(islands, reach);
}

/** How an ocean came to be held. */
export type OceanSource = 'held' | 'file' | 'worked out' | 'failed';

export type OceanStore = ReturnType<typeof createOceanStore>;

/** An ocean store over these files (and this pacing, for the tests: the slices' clock and pauses). */
export function createOceanStore(files: OceanFiles | null, pacing: Partial<Pacing> = {}) {
  type Job = { hurry: boolean; promise: Promise<OceanSource> };
  const jobs = new Map<string, Job>();
  /** What the oceans' slices lasted, for measuring: the longest and how many. */
  const stats = { slices: 0, longest: 0, source: null as OceanSource | null, readMs: 0, savedBytes: 0 };
  /** Files are written and tidied one at a time. */
  let filing: Promise<unknown> = Promise.resolve();

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  async function fromFile(key: string, islands: readonly OceanIsland[], reach: WaterExtent) {
    if (!files) return false;
    const name = oceanFileName(key);
    try {
      const started = now();
      const bytes = await files.read(name);
      if (!bytes) return false;
      try {
        const { key: kept, meta, bake } = readSeabedBake(bytes);
        if (kept === key && meta === OCEAN_VERSION && isWholeOcean(bake, islands, reach)) {
          rememberOcean(key, bake);
          stats.readMs = now() - started;
          return true;
        }
      } catch {
        // (not an ocean that can be read)
      }
      // Cut short, damaged or from another version: never read again.
      await files.remove(name).catch(() => undefined);
    } catch {
      // (the files can't be read: worked out instead)
    }
    return false;
  }

  /** Keep the ocean in a file, and tidy: only the last few written stay. Never fails the one who asked. */
  function save(key: string, bake: SeabedBake) {
    if (!files) return filing;
    const kept = files;
    filing = filing.then(async () => {
      try {
        const bytes = writeSeabedBake(key, bake, OCEAN_VERSION);
        await kept.write(oceanFileName(key), bytes);
        stats.savedBytes = bytes.byteLength;
        const all = await kept.list(), mine = oceanFileName(key);
        const old = all.filter((file) => file.name !== mine).sort((a, b) => b.at - a.at).slice(KEPT_FILES - 1);
        for (const file of old) await kept.remove(file.name).catch(() => undefined);
      } catch {
        // (nowhere to keep it, or no room: it is worked out again next time)
      }
    });
    return filing;
  }

  async function run(job: Job, key: string, level: number, islands: readonly OceanIsland[], reach: WaterExtent): Promise<OceanSource> {
    if (await fromFile(key, islands, reach)) return 'file';
    const bake = await runSliced(oceanSteps(level, islands, reach), {
      ...pacing,
      slice: () => (job.hurry ? SLICE_MS.waiting : SLICE_MS.idle),
      onSlice: (ms) => { stats.slices++; if (ms > stats.longest) stats.longest = ms; pacing.onSlice?.(ms); },
    });
    rememberOcean(key, bake);
    void save(key, bake);
    return 'worked out';
  }

  return {
    stats,
    /** Whether this ocean is held, ready for the scene to use at once. */
    has: (level: number, islands: readonly OceanIsland[], reach: WaterExtent) => hasOcean(seabedBakeKey(level, islands, reach)),
    /**
     * Have this ocean held: read back from its file, or worked out in slices (and kept in a file for next time). Asked again while it is
     * on its way, it is the same piece of work; `hurry` (someone is waiting for it now) makes its slices longer. Never rejects: an ocean
     * that can't be had is simply worked out by the scene itself, as it always was.
     */
    ensure(level: number, islands: readonly OceanIsland[], reach: WaterExtent, hurry = false): Promise<OceanSource> {
      const key = seabedBakeKey(level, islands, reach);
      if (hasOcean(key)) return Promise.resolve('held');
      let job = jobs.get(key);
      if (!job) {
        const made: Job = { hurry, promise: Promise.resolve('held') };
        made.promise = run(made, key, level, islands, reach)
          .catch((): OceanSource => 'failed')
          .then((source) => { stats.source = source; jobs.delete(key); return source; });
        jobs.set(key, job = made);
      } else if (hurry) job.hurry = true;
      return job.promise;
    },
    /** Resolves once every file written so far is down and the old ones are gone (for the tests). */
    settled: () => filing,
  };
}
