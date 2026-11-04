import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import { decodeMesh, flatNormals, meshDifference, readMeshPack, type MeshData, type ReadMesh } from '@/lib/mesh-pack';

/**
 * The three.js side of the meshes shipped with the app (src/lib/mesh-pack.ts): a geometry made of what a file holds, and what a geometry holds as the
 * file's makers read it. Kept apart from the cache and the store so that they load without three.js (under Jest, which cannot load it, among others).
 */

/** The geometry a read mesh is: its attributes in their order and the bounding sphere as the builder left it. */
export function geometryOfRead(read: ReadMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const part of read.attributes) geometry.setAttribute(part.name, new BufferAttribute(part.array, part.itemSize));
  if (read.sphere) geometry.boundingSphere = new Sphere(new Vector3(read.sphere[0], read.sphere[1], read.sphere[2]), read.sphere[3]);
  return geometry;
}

/** A shipped file's geometry, made a step at a time (the steps of mesh-pack.ts's `decodeMesh`). Throws if the file is not the one for `key`, is damaged, or is not whole. */
export function* shippedGeometry(bytes: Uint8Array, key: string): Generator<void, BufferGeometry, void> {
  const read = yield* decodeMesh(readMeshPack(bytes, key));
  return geometryOfRead(read);
}

/** What a geometry from a builder holds, as the file's makers see it. Only a plain geometry (no index, float attributes of their own) can be shipped. */
export function meshOfGeometry(geometry: BufferGeometry): MeshData {
  if (geometry.index) throw new Error('mesh pack: an indexed geometry is not shipped');
  const attributes = Object.keys(geometry.attributes).map((name) => {
    const attribute = geometry.attributes[name];
    if (!(attribute.array instanceof Float32Array) || ('isInterleavedBufferAttribute' in attribute && attribute.isInterleavedBufferAttribute) || attribute.normalized) throw new Error(`mesh pack: ${name} is not a plain float attribute`);
    return { name, itemSize: attribute.itemSize, array: attribute.array };
  });
  if (geometry.groups.length || Object.keys(geometry.userData).length) throw new Error('mesh pack: a geometry with groups or user data is not shipped');
  const s = geometry.boundingSphere;
  return { vertices: geometry.attributes.position.count, attributes, sphere: s ? [s.center.x, s.center.y, s.center.z, s.radius] : null };
}

/**
 * Whether the geometry's normals are what a file need not hold: what `flatNormals` makes of its positions, and what three.js's own `computeVertexNormals` makes
 * (the two must be the same, bit for bit, for `flatNormals` to stand in for it: it is checked here, mesh by mesh, not assumed).
 */
export function normalsAreDerived(geometry: BufferGeometry) {
  const normal = geometry.attributes.normal, position = geometry.attributes.position;
  if (!normal || position.count % 3 !== 0) return false;
  const was = normal.array as Float32Array, mine = flatNormals(position.array as Float32Array);
  const same = (a: Float32Array, b: Float32Array) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false; return true; };
  if (!same(mine, was)) return false;
  const copy = new BufferGeometry();
  copy.setAttribute('position', new BufferAttribute((position.array as Float32Array).slice(), 3));
  copy.computeVertexNormals();
  if (!same(copy.attributes.normal.array as Float32Array, mine)) throw new Error('mesh pack: flatNormals is not what computeVertexNormals makes');
  return true;
}

/** Why a geometry is not bit for bit the one a file makes, or null when it is (the bake and the verifying run this). */
export function geometryDifference(got: BufferGeometry, want: BufferGeometry) {
  return meshDifference(meshOfGeometry(got), meshOfGeometry(want));
}
