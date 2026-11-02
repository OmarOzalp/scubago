import { expect, jest, test } from '@jest/globals';
import type { Object3D } from 'three';
import { standardizeVertexColors } from '../three/marine-colors';

// Three 0.186's ESM entry is outside this Expo Jest transform: a BufferAttribute that keeps its array, item size and normalized flag stands in for it.
jest.mock('three', () => {
  class BufferAttribute {
    constructor(array: ArrayLike<number>, itemSize: number, normalized = false) { Object.assign(this, { array, itemSize, normalized }); }
    getX(i: number) { return this.read(i, 0); }
    getY(i: number) { return this.read(i, 1); }
    getZ(i: number) { return this.read(i, 2); }
    read(i: number, k: number) { const a = (this as unknown as { array: ArrayLike<number>; itemSize: number; normalized: boolean }); const v = a.array[i * a.itemSize + k]; return a.normalized ? v / 65535 : v; }
  }
  return { BufferAttribute };
});
const { BufferAttribute } = jest.requireMock('three') as { BufferAttribute: new (array: ArrayLike<number>, itemSize: number, normalized?: boolean) => unknown };

type Attribute = { array: ArrayLike<number>; itemSize: number; normalized: boolean };
/** A mesh with `count` vertices and, if given, a color attribute; the root walks its meshes. */
const mesh = (count: number, color?: Attribute, geometry = { attributes: { position: { count }, ...(color ? { color } : {}) } as Record<string, unknown>, setAttribute(name: string, attribute: unknown) { this.attributes[name] = attribute; } }) => ({ isMesh: true, geometry });
const rootOf = (...meshes: ReturnType<typeof mesh>[]) => ({ traverse: (visit: (o: unknown) => void) => { visit({}); meshes.forEach(visit); } }) as unknown as Object3D;
const colors = (m: ReturnType<typeof mesh>) => m.geometry.attributes.color as Attribute;

test('a mesh with no vertex colors gets white and opaque ones, as a 16-bit normalized attribute', () => {
  const eye = mesh(3);
  standardizeVertexColors(rootOf(eye));
  const color = colors(eye);
  expect(color.itemSize).toBe(4);
  expect(color.normalized).toBe(true);
  expect(color.array).toBeInstanceOf(Uint16Array);
  expect(Array.from(color.array)).toEqual(Array(12).fill(65535));
});

test('red, green and blue stay exactly as they are and an alpha of 1 is added', () => {
  const body = mesh(2, { array: new Uint16Array([1, 2, 3, 400, 500, 600]), itemSize: 3, normalized: true });
  standardizeVertexColors(rootOf(body));
  expect(colors(body).itemSize).toBe(4);
  expect(Array.from(colors(body).array)).toEqual([1, 2, 3, 65535, 400, 500, 600, 65535]);
});

test('colors that are already red, green, blue and alpha (the jellyfish) are left alone', () => {
  const jelly = { array: new Uint16Array([9, 8, 7, 6]), itemSize: 4, normalized: true };
  const m = mesh(1, jelly);
  standardizeVertexColors(rootOf(m));
  expect(colors(m)).toBe(jelly);
});

test('float colors are read as floats and stay floats', () => {
  const m = mesh(2, new BufferAttribute(new Float32Array([.25, .5, .75, 1, 0, .125]), 3, false) as Attribute);
  standardizeVertexColors(rootOf(m));
  expect(colors(m).array).toBeInstanceOf(Float32Array);
  expect(colors(m).normalized).toBe(false);
  expect(Array.from(colors(m).array)).toEqual([.25, .5, .75, 1, 1, 0, .125, 1]);
});

test('a geometry shared by several meshes is converted once, and things that are not meshes are skipped', () => {
  const shared = mesh(1);
  const again = { isMesh: true, geometry: shared.geometry };
  const spy = jest.spyOn(shared.geometry, 'setAttribute');
  standardizeVertexColors(rootOf(shared, again as unknown as ReturnType<typeof mesh>));
  expect(spy).toHaveBeenCalledTimes(1);
});
