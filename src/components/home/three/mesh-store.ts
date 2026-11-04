import type { BufferGeometry } from 'three';

/**
 * The meshes shipped with the app (src/lib/mesh-pack.ts), as the geometry cache and the sliced builders find them: the bytes of each file held once it has
 * been read (mesh-assets.ts reads them, ahead of the scene that wants them), and a mesh made of them in place of the builder, the very same bits.
 *
 * Nothing here can fail a scene: a file that is not there yet, is for another mesh, is damaged or cut short, or does not inflate is a mesh the builder makes
 * as it always did (a `console.warn` in a development build, once for each mesh). three.js is loaded only when a file is used (mesh-geometry.ts), so
 * the cache and its tests load without it.
 */
type Shipped = Generator<void, BufferGeometry, void>;
const files = new Map<string, Uint8Array>();
const warned = new Set<string>();
const refused = new Set<string>();

const meshGeometry = () => require('./mesh-geometry') as typeof import('./mesh-geometry'); // eslint-disable-line @typescript-eslint/no-require-imports

function warn(key: string, why: unknown) {
  refused.add(key);
  if (warned.has(key) || typeof __DEV__ === 'undefined' || !__DEV__) return;
  warned.add(key);
  console.warn(`the shipped mesh for ${key} is not used (${why instanceof Error ? why.message : why}); making it as before`);
}

/** Who reads the files from the app (mesh-assets.ts, which says so when it loads): asked when a scene is about to want a mesh. */
let reader: ((key: string) => void) | undefined;
export const readMeshesWith = (read: (key: string) => void) => { reader = read; };
/** A mesh is about to be wanted: have its file read, if nothing has yet. */
export const wantMesh = (key: string) => { if (!files.has(key)) reader?.(key); };

/** Hold a file's bytes (read from the app's files, or from a disk by a script or test): the mesh for `key` is made of them from now on. */
export function registerShippedMesh(key: string, bytes: Uint8Array) {
  files.set(key, bytes);
  refused.delete(key);
}
/** Whether the bytes of the mesh for `key` are held (and have not been found wanting). */
export const hasShippedMesh = (key: string) => files.has(key) && !refused.has(key);
/** Let go of every file held (the tests, the verifying run). */
export function forgetShippedMeshes() { files.clear(); warned.clear(); refused.clear(); }
/** Which meshes are held, for the tests. */
export const shippedMeshKeys = () => [...files.keys()].filter((key) => !refused.has(key));

/** The mesh for `key` made a step at a time, or undefined when no file for it is held. Throws, when stepped, if the file is wrong: use `shippedOrMade` or `shippedNow`. */
export function shippedMeshJob(key: string): Shipped | undefined {
  const bytes = files.get(key);
  if (!bytes || refused.has(key)) return undefined;
  try {
    return meshGeometry().shippedGeometry(bytes, key);
  } catch (error) {
    warn(key, error);
    return undefined;
  }
}

/** The mesh for `key` made at once from its file, or undefined where there is no file held or it is wrong. */
export function shippedNow(key: string): BufferGeometry | undefined {
  const job = shippedMeshJob(key);
  if (!job) return undefined;
  try {
    for (;;) {
      const step = job.next();
      if (step.done) return step.value;
    }
  } catch (error) {
    warn(key, error);
    return undefined;
  }
}

/**
 * The mesh for `key` a step at a time from its file if one is held, else (or if the file turns out wrong on the way) from `make`, the builder's own job. The
 * choice is made when the first step is taken, so a file read in the meantime is used.
 */
export function* shippedOrMade(key: string, make: () => Generator<void, BufferGeometry, void>): Generator<void, BufferGeometry, void> {
  const shipped = shippedMeshJob(key);
  if (shipped) {
    try {
      return yield* shipped;
    } catch (error) {
      warn(key, error);
    }
  }
  return yield* make();
}
