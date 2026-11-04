import { describe, expect, test } from '@jest/globals';
import { deflateRawSync } from 'node:zlib';
import { CHUNK_SLOTS, decodeMesh, encodeMesh, flatNormals, meshDifference, readMesh, readMeshPack, type MeshData } from '../mesh-pack';

// The codec of the island meshes shipped with the app (mesh-pack.ts): what goes in comes out with the very same bits, and anything wrong with a file is told.
const compress = (bytes: Uint8Array) => new Uint8Array(deflateRawSync(bytes, { level: 9 }));

/** A little deterministic noise. */
const random = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/** A mesh of `triangles` flat triangles: positions, a colour for each face (so tuples repeat) and an all-zero uv. */
function mesh(triangles: number, seed = 1): MeshData {
  const next = random(seed), vertices = triangles * 3;
  const position = new Float32Array(vertices * 3), color = new Float32Array(vertices * 3), uv = new Float32Array(vertices * 2);
  for (let t = 0; t < triangles; t++) {
    const face = [next(), next(), next()];
    for (let k = 0; k < 3; k++) {
      for (let c = 0; c < 3; c++) { position[(t * 3 + k) * 3 + c] = (next() - .5) * 10; color[(t * 3 + k) * 3 + c] = face[c]; }
    }
  }
  return {
    vertices,
    attributes: [{ name: 'position', itemSize: 3, array: position }, { name: 'color', itemSize: 3, array: color }, { name: 'uv', itemSize: 2, array: uv }],
    sphere: [1, 2, 3, 4.5],
  };
}
const withNormals = (m: MeshData): MeshData => ({ ...m, attributes: [m.attributes[0], { name: 'normal', itemSize: 3, array: flatNormals(m.attributes[0].array) }, ...m.attributes.slice(1)] });
const roundTrip = (m: MeshData, derived: string[] = []) => readMesh(readMeshPack(encodeMesh('some:key', m, derived, compress), 'some:key'));

describe('a mesh as a file', () => {
  test('comes back with every float the same bits, the attributes in their order, and the bounding sphere', () => {
    const m = mesh(40);
    const back = roundTrip(m);
    expect(meshDifference(back, m)).toBeNull();
    expect(back.attributes.map((a) => a.name)).toEqual(['position', 'color', 'uv']);
    expect(back.sphere).toEqual([1, 2, 3, 4.5]);
  });

  test('keeps negative zero, infinities and every NaN pattern', () => {
    const m = mesh(4);
    const bits = new Uint32Array(m.attributes[1].array.buffer);
    bits[0] = 0x80000000; bits[1] = 0x7f800000; bits[2] = 0xff800000; bits[3] = 0x7fc00001; bits[4] = 0x00000001;
    expect(meshDifference(roundTrip(m), m)).toBeNull();
  });

  test('a mesh with no bounding sphere, and one with no vertices, are as they were', () => {
    expect(roundTrip({ ...mesh(3), sphere: null }).sphere).toBeNull();
    const empty: MeshData = { vertices: 0, attributes: [{ name: 'position', itemSize: 3, array: new Float32Array(0) }], sphere: null };
    expect(meshDifference(roundTrip(empty), empty)).toBeNull();
  });

  test('normals the reader makes itself come out as the ones the builder made', () => {
    const m = withNormals(mesh(60, 7));
    const bytes = encodeMesh('some:key', m, ['normal'], compress);
    expect(bytes.length).toBeLessThan(encodeMesh('some:key', m, [], compress).length);
    expect(meshDifference(readMesh(readMeshPack(bytes, 'some:key')), m)).toBeNull();
  });

  test('a mesh of more than a chunk is read a chunk at a time, and is the same as read at once', () => {
    const m = mesh(CHUNK_SLOTS), pack = readMeshPack(encodeMesh('some:key', m, [], compress), 'some:key');
    expect(m.vertices).toBeGreaterThan(2 * CHUNK_SLOTS);
    const run = decodeMesh(pack);
    let steps = 0, done = run.next();
    while (!done.done) { steps++; done = run.next(); }
    // (a step for each chunk of each attribute that is stored: position and colour)
    expect(steps).toBe(2 * Math.ceil(m.vertices / CHUNK_SLOTS));
    expect(meshDifference(done.value, m)).toBeNull();
  });

  test('is smaller than the numbers it holds', () => {
    const m = mesh(500);
    expect(encodeMesh('some:key', m, [], compress).length).toBeLessThan(m.attributes[0].array.byteLength + m.attributes[1].array.byteLength);
  });

  test('refuses a file for another mesh, cut short, damaged, from another version or not a pack', () => {
    const bytes = encodeMesh('some:key', mesh(20), [], compress);
    expect(() => readMeshPack(bytes, 'other:key')).toThrow('is for some:key');
    expect(() => readMeshPack(bytes.slice(0, bytes.length - 3), 'some:key')).toThrow('damaged or cut short');
    expect(() => readMeshPack(bytes.slice(0, 20), 'some:key')).toThrow();
    expect(() => readMeshPack(new Uint8Array(4), 'some:key')).toThrow('Not a mesh pack');
    for (const at of [bytes.length - 1, bytes.length >> 1, bytes.length - 40]) {
      const damaged = bytes.slice();
      damaged[at] ^= 1;
      expect(() => readMeshPack(damaged, 'some:key')).toThrow('damaged');
    }
    const other = bytes.slice();
    other[4] = 9;
    expect(() => readMeshPack(other, 'some:key')).toThrow('version');
  });

  test('refuses numbers that do not match the vertices', () => {
    const m = mesh(2);
    expect(() => encodeMesh('some:key', { ...m, vertices: 5 }, [], compress)).toThrow('numbers for 5 vertices');
  });
});

describe('flat normals', () => {
  test('are the unit normal of each triangle at its three corners, and zero for a triangle with no area', () => {
    const n = flatNormals(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    expect([...n.slice(0, 9)]).toEqual([0, -1, 0, 0, -1, 0, 0, -1, 0]);
    expect([...n.slice(9)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test('differ from the comparison when one float differs by one bit', () => {
    const m = mesh(3), other = mesh(3);
    new Uint32Array(other.attributes[0].array.buffer)[5] ^= 1;
    expect(meshDifference(other, m)).toMatch(/^position\[5\]/);
    expect(meshDifference({ ...m, sphere: [1, 2, 3, 4.6] }, m)).toMatch(/bounding sphere/);
    expect(meshDifference({ ...m, sphere: null }, m)).toMatch(/bounding sphere/);
  });
});
