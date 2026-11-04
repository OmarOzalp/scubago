import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { deflateRawSync } from 'node:zlib';
import type { BufferGeometry } from 'three';
import { decodeMesh, encodeMesh, readMeshPack, type MeshData } from '@/lib/mesh-pack';
import { builtOnce, forgetGeometry } from '../three/geometry-cache';
import { forgetShippedMeshes, hasShippedMesh, registerShippedMesh, shippedMeshKeys, shippedNow, shippedOrMade, wantMesh, readMeshesWith } from '../three/mesh-store';

// How the meshes shipped with the app (mesh-store.ts) reach the geometry cache and the sliced builders, and that a file that cannot be used is a mesh made
// as before. (three.js can't be loaded under Jest: the geometry a file makes is a stand-in that holds what was read.)
jest.mock('../three/mesh-geometry', () => ({
  shippedGeometry: function* (bytes: Uint8Array, key: string) {
    const { decodeMesh: decode, readMeshPack: read } = jest.requireActual('@/lib/mesh-pack') as typeof import('@/lib/mesh-pack');
    const mesh = yield* decode(read(bytes, key));
    return { shipped: true, mesh, attributes: { position: { array: mesh.attributes[0].array } }, index: null, dispose() {} };
  },
}));

const compress = (bytes: Uint8Array) => new Uint8Array(deflateRawSync(bytes));
const data: MeshData = { vertices: 3, attributes: [{ name: 'position', itemSize: 3, array: new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]) }], sphere: null };
const file = (key: string) => encodeMesh(key, data, [], compress);
const made = () => ({ made: true, attributes: { position: { array: new Float32Array(9) } }, index: null, dispose() {} }) as unknown as BufferGeometry;
type Standin = { shipped?: boolean; made?: boolean; mesh?: MeshData };
const standin = (geometry: BufferGeometry | undefined) => geometry as unknown as Standin | undefined;

let warn: jest.SpiedFunction<typeof console.warn>;
beforeEach(() => { (globalThis as { __DEV__?: boolean }).__DEV__ = true; warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { forgetShippedMeshes(); forgetGeometry(); warn.mockRestore(); readMeshesWith(() => undefined); });

test('a mesh whose file is held is made of the file, bit for bit, and the builder is not run', () => {
  registerShippedMesh('a', file('a'));
  let ran = 0;
  const geometry = standin(builtOnce('a', () => { ran++; return made(); }));
  expect(ran).toBe(0);
  expect(geometry?.shipped).toBe(true);
  expect([...geometry!.mesh!.attributes[0].array]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(warn).not.toHaveBeenCalled();
});

test('a mesh with no file held is made by the builder, as it always was', () => {
  expect(standin(builtOnce('none', made))?.made).toBe(true);
  expect(shippedNow('none')).toBeUndefined();
  expect(warn).not.toHaveBeenCalled();
});

test.each([
  ['a file for another mesh', () => file('other'), /is for other/],
  ['a file cut short', () => file('b').slice(0, 50), /cut short|damaged/],
  ['a file with a flipped byte', () => { const f = file('b').slice(); f[f.length - 2] ^= 255; return f; }, /damaged/],
  ['something that is not a mesh at all', () => new Uint8Array(100), /Not a mesh pack/],
])('%s is a mesh made by the builder, with a warning once in a development build', (_, bytes, why) => {
  registerShippedMesh('b', bytes());
  expect(standin(builtOnce('b', made))?.made).toBe(true);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(String(warn.mock.calls[0][0])).toMatch(why);
  expect(hasShippedMesh('b')).toBe(false);
  forgetGeometry();
  expect(standin(builtOnce('b', made))?.made).toBe(true);
  expect(warn).toHaveBeenCalledTimes(1);
});

test('a file that proves wrong only in the middle of the sliced read (its digest right, a section not inflating) falls back to the builder', () => {
  registerShippedMesh('c', encodeMesh('c', data, [], (bytes) => new Uint8Array(bytes.length).fill(0xff)));
  const steps: string[] = [];
  const job = shippedOrMade('c', function* () { steps.push('made'); yield; return made(); });
  let result = job.next();
  while (!result.done) result = job.next();
  expect(standin(result.value)?.made).toBe(true);
  expect(steps).toEqual(['made']);
  expect(warn).toHaveBeenCalledTimes(1);
  // (and made at once, the same)
  forgetShippedMeshes();
  registerShippedMesh('c', encodeMesh('c', data, [], (bytes) => new Uint8Array(bytes.length).fill(0xff)));
  expect(shippedNow('c')).toBeUndefined();
});

test('a sliced mesh with a file held steps through the file; one without steps through the builder', () => {
  registerShippedMesh('d', file('d'));
  const fromFile = shippedOrMade('d', function* () { throw new Error('not the builder'); });
  let steps = 0, result = fromFile.next();
  while (!result.done) { steps++; result = fromFile.next(); }
  expect(standin(result.value)?.shipped).toBe(true);
  expect(steps).toBe(1);
  const fromBuilder = shippedOrMade('e', function* () { yield; yield; return made(); });
  steps = 0; result = fromBuilder.next();
  while (!result.done) { steps++; result = fromBuilder.next(); }
  expect(standin(result.value)?.made).toBe(true);
  expect(steps).toBe(2);
});

test('the file is chosen when the first step is taken, so one read in the meantime is used', () => {
  const job = shippedOrMade('f', function* () { return made(); });
  registerShippedMesh('f', file('f'));
  let result = job.next();
  while (!result.done) result = job.next();
  expect(standin(result.value)?.shipped).toBe(true);
});

test('a mesh is asked for from the reader unless its file is held', () => {
  const asked: string[] = [];
  readMeshesWith((key) => asked.push(key));
  wantMesh('g'); wantMesh('g');
  registerShippedMesh('h', file('h'));
  wantMesh('h');
  expect(asked).toEqual(['g', 'g']); // (the reader reads a file once: mesh-assets.ts)
  expect(shippedMeshKeys()).toEqual(['h']);
});

test('a stand-in decode of a file reads every vertex', () => {
  const run = decodeMesh(readMeshPack(file('i'), 'i'));
  let step = run.next();
  while (!step.done) step = run.next();
  expect(step.value.vertices).toBe(3);
});
