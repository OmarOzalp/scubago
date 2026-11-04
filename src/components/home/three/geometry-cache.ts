import { useEffect } from 'react';
import type { BufferGeometry } from 'three';
import { shippedNow } from './mesh-store';

/**
 * Geometry that is the same every time it is asked for (an island's coast, its kelp, its seagrass, the template its corals are cut from: each depends
 * only on the island, its level and the quality tier), built the first time and handed out after that. Working one out takes a phone's JavaScript
 * engine hundreds of milliseconds to seconds, and Home's card, the explorer, the explorer opened again and an island pill switched back to all want
 * the very same ones.
 *
 * Shared, not copied: nothing may change one, and a mesh using one must not dispose it itself (`holdGeometry`, from an effect, says it is in use: a
 * geometry is disposed, its buffers on the graphics card freed in every renderer that drew it, only once it has left the cache and no mesh holds it).
 * What is kept is bounded: at most `KEPT_GEOMETRIES` geometries and `KEPT_BYTES` of their vertex data, the least recently used going first (all five
 * islands at the last level, at full quality, measure 13 geometries and 15.8 MB; at lite quality 9.6 MB).
 */
export const KEPT_GEOMETRIES = 24;
export const KEPT_BYTES = 24 * 1024 * 1024;
type Entry = { geometry: BufferGeometry; bytes: number; holders: number; kept: boolean };
/** Most recently used last. */
const entries = new Map<string, Entry>();
const entryOf = new WeakMap<BufferGeometry, Entry>();
let total = 0;

/** The bytes of a geometry's vertex data (its attributes and index). */
export function geometryBytes(geometry: BufferGeometry) {
  let bytes = geometry.index ? geometry.index.array.byteLength : 0;
  for (const name of Object.keys(geometry.attributes)) bytes += geometry.attributes[name].array.byteLength;
  return bytes;
}

function forget(key: string, entry: Entry) {
  entries.delete(key);
  total -= entry.bytes;
  entry.kept = false;
  if (!entry.holders) entry.geometry.dispose();
}
function keep(key: string, geometry: BufferGeometry) {
  const entry: Entry = { geometry, bytes: geometryBytes(geometry), holders: 0, kept: true };
  entries.set(key, entry);
  entryOf.set(geometry, entry);
  total += entry.bytes;
  // (the one just kept stays, however big it is)
  for (const [oldest, old] of entries) {
    if (old === entry || (entries.size <= KEPT_GEOMETRIES && total <= KEPT_BYTES)) break;
    forget(oldest, old);
  }
}

/**
 * The geometry for `key`, built by `build` the first time: or made from the file shipped with the app for it, if one has been read (mesh-store.ts), which gives
 * the very same bits for a fraction of the work. A file that turns out wrong is built as ever.
 */
export function builtOnce(key: string, build: () => BufferGeometry): BufferGeometry {
  const had = entries.get(key);
  if (had) {
    entries.delete(key); entries.set(key, had);
    return had.geometry;
  }
  const geometry = shippedNow(key) ?? build();
  keep(key, geometry);
  return geometry;
}

/** The geometry kept for `key`, if there is one (as `builtOnce` hands it out, but never making it: for what is made in slices, sliced-geometry.ts). */
export function peekBuilt(key: string): BufferGeometry | undefined {
  const had = entries.get(key);
  if (!had) return undefined;
  entries.delete(key); entries.set(key, had);
  return had.geometry;
}

/** Keep a geometry made along the way to another (what `builtOnce` would later be asked for). */
export function keepBuilt(key: string, geometry: BufferGeometry) {
  const had = entries.get(key);
  if (had) forget(key, had);
  keep(key, geometry);
}

/** Say a geometry from the cache is in use, until the function returned is called (a geometry that is not the cache's is not affected). */
export function holdGeometry(geometry: BufferGeometry) {
  const entry = entryOf.get(geometry);
  if (!entry) return () => {};
  entry.holders++;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    if (--entry.holders === 0 && !entry.kept) geometry.dispose();
  };
}

/** For a mesh made from a cached geometry: it is in use while the mesh is (none yet: nothing held). */
export function useHeldGeometry(geometry: BufferGeometry | null) {
  useEffect(() => (geometry ? holdGeometry(geometry) : undefined), [geometry]);
}

/** Let go of everything kept (the tests). Geometries still held are disposed when their holders let go. */
export function forgetGeometry() {
  for (const [key, entry] of [...entries]) forget(key, entry);
}

/** What is kept now, for the tests and for measuring: how many geometries, and the bytes of their vertex data. */
export const geometryCacheSize = () => ({ entries: entries.size, bytes: total });
