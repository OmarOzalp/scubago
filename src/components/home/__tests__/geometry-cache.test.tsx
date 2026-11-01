import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { create, act } from 'react-test-renderer';
import type { BufferGeometry } from 'three';
import {
  builtOnce, forgetGeometry, geometryBytes, geometryCacheSize, holdGeometry, KEPT_BYTES, KEPT_GEOMETRIES, keepBuilt, useHeldGeometry,
} from '../three/geometry-cache';

/**
 * A geometry of `vertices` vertices (12 bytes each as positions) that counts how often it is disposed. (three.js can't be loaded under Jest, and the cache
 * only reads a geometry's attribute and index arrays and calls its dispose.)
 */
function geometry(vertices = 3) {
  const log = { disposed: 0 };
  const made = { attributes: { position: { array: new Float32Array(vertices * 3) } }, index: null, dispose() { log.disposed++; }, log };
  return made as unknown as BufferGeometry & { log: { disposed: number } };
}
type Logged = ReturnType<typeof geometry>;

beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => forgetGeometry());

test('a geometry is built once for its key and handed out again, however many ask', () => {
  let built = 0;
  const make = () => { built++; return geometry(); };
  const first = builtOnce('a', make);
  expect(builtOnce('a', make)).toBe(first);
  expect(builtOnce('a', make)).toBe(first);
  expect(built).toBe(1);
  expect(builtOnce('b', make)).not.toBe(first);
  expect(built).toBe(2);
  expect(geometryCacheSize()).toEqual({ entries: 2, bytes: 2 * geometryBytes(first) });
});

test('only the last few used are kept, the one unused longest going first, and one nobody holds is disposed as it goes', () => {
  const all: Logged[] = [];
  for (let i = 0; i < KEPT_GEOMETRIES; i++) all.push(builtOnce(`k${i}`, () => geometry()) as Logged);
  expect(geometryCacheSize().entries).toBe(KEPT_GEOMETRIES);
  // (the first used again: now the second has been unused longest)
  expect(builtOnce('k0', () => geometry())).toBe(all[0]);
  builtOnce('one more', () => geometry());
  expect(geometryCacheSize().entries).toBe(KEPT_GEOMETRIES);
  expect(all[1].log.disposed).toBe(1);
  expect(all[0].log.disposed).toBe(0);
  expect(builtOnce('k0', () => geometry())).toBe(all[0]);
  expect(builtOnce('k1', () => geometry())).not.toBe(all[1]);
});

test('what is kept is bounded in bytes too, though a geometry bigger than that is kept while it is the latest', () => {
  const big = KEPT_BYTES / 12 / 3 + 1;
  const [a, b, c] = [builtOnce('a', () => geometry(big)), builtOnce('b', () => geometry(big)), builtOnce('c', () => geometry(big))] as Logged[];
  expect(geometryCacheSize().bytes).toBeLessThanOrEqual(KEPT_BYTES);
  expect(a.log.disposed).toBe(1);
  expect(b.log.disposed).toBe(0);
  expect(c.log.disposed).toBe(0);
  const huge = builtOnce('huge', () => geometry(KEPT_BYTES / 12 * 2)) as Logged;
  expect(huge.log.disposed).toBe(0);
  expect(geometryCacheSize().entries).toBe(1);
  expect(b.log.disposed).toBe(1);
  expect(c.log.disposed).toBe(1);
});

test('a geometry a mesh holds is not disposed when it leaves the cache, but when the mesh lets go of it', () => {
  const mine = builtOnce('mine', () => geometry()) as Logged;
  const release = holdGeometry(mine);
  for (let i = 0; i < KEPT_GEOMETRIES; i++) builtOnce(`other${i}`, () => geometry());
  // (out of the cache, still in use)
  expect(builtOnce('mine', () => geometry())).not.toBe(mine);
  expect(mine.log.disposed).toBe(0);
  release();
  expect(mine.log.disposed).toBe(1);
  // Letting go twice does nothing more.
  release();
  expect(mine.log.disposed).toBe(1);
});

test('a mesh letting go of a geometry that is still kept does not dispose it: the next to want it is handed it, and the explorer closing is not a reason to drop it', () => {
  const shared = builtOnce('shared', () => geometry()) as Logged;
  const home = holdGeometry(shared), explorer = holdGeometry(shared);
  explorer();
  expect(shared.log.disposed).toBe(0);
  home();
  expect(shared.log.disposed).toBe(0);
  expect(builtOnce('shared', () => geometry())).toBe(shared);
  // Held by one and by another, out of the cache: disposed once, when the last lets go.
  const a = holdGeometry(shared), b = holdGeometry(shared);
  forgetGeometry();
  expect(shared.log.disposed).toBe(0);
  a();
  expect(shared.log.disposed).toBe(0);
  b();
  expect(shared.log.disposed).toBe(1);
});

test('a geometry that is not the cache’s is none of its business', () => {
  const own = geometry();
  const release = holdGeometry(own);
  release();
  expect(own.log.disposed).toBe(0);
});

test('a geometry made along the way to another is kept under its own key, and replaces an earlier one', () => {
  const first = geometry(), second = geometry();
  keepBuilt('along', first);
  expect(builtOnce('along', () => geometry())).toBe(first);
  keepBuilt('along', second);
  expect(first.log.disposed).toBe(1);
  expect(builtOnce('along', () => geometry())).toBe(second);
  expect(geometryCacheSize().entries).toBe(1);
});

test('a mesh component holds its geometry for as long as it is mounted', () => {
  const shared = builtOnce('mounted', () => geometry()) as Logged;
  function Mesh({ of }: { of: BufferGeometry }) { useHeldGeometry(of); return null; }
  let one!: ReturnType<typeof create>, two!: ReturnType<typeof create>;
  act(() => { one = create(<Mesh of={shared} />); two = create(<Mesh of={shared} />); });
  // Pushed out of the cache while two meshes use it.
  for (let i = 0; i < KEPT_GEOMETRIES; i++) builtOnce(`later${i}`, () => geometry());
  expect(shared.log.disposed).toBe(0);
  act(() => one.unmount());
  expect(shared.log.disposed).toBe(0);
  act(() => two.unmount());
  expect(shared.log.disposed).toBe(1);
});

test('the same, mounting and unmounting a mesh of a geometry still kept: never disposed by it', () => {
  const shared = builtOnce('kept and mounted', () => geometry()) as Logged;
  function Mesh({ of }: { of: BufferGeometry }) { useHeldGeometry(of); return null; }
  for (let i = 0; i < 3; i++) {
    let mounted!: ReturnType<typeof create>;
    act(() => { mounted = create(<Mesh of={shared} />); });
    act(() => mounted.unmount());
  }
  expect(shared.log.disposed).toBe(0);
  expect(builtOnce('kept and mounted', () => geometry())).toBe(shared);
});
