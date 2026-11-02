import { BufferAttribute, MeshLambertMaterial, type BufferGeometry, type Color, type Mesh, type Object3D, type Side } from 'three';

/**
 * Gives every mesh under `root` vertex colors with an alpha: white and opaque where it had none (the eyes of the first three
 * models, and their bodies), an alpha of 1 added where it had red, green and blue only (almost every model), and the golden
 * jellyfish's own alphas left as they are. three.js links a program for each combination of "has vertex colors" and "has an
 * alpha in them", so with models in all three states every scene linked three programs for its animals, each of the biggest
 * shaders in the app; now all of them share one. The picture is the same: a color multiplied by white, and an alpha by 1, is
 * what it was (exactly: normalized white and opaque are 1.0).
 *
 * Done once for each parsed model (marine-loader.ts), before its materials are made with `vertexColors` on. The arrays keep
 * their kind (16-bit normalized stays 16-bit normalized), so a model costs two more bytes a vertex at most.
 */
export function standardizeVertexColors(root: Object3D): void {
  const done = new Set<BufferGeometry>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || done.has(mesh.geometry)) return;
    const geometry = mesh.geometry;
    done.add(geometry);
    const color = geometry.attributes.color as BufferAttribute | undefined;
    if (color && color.itemSize === 4) return;
    const count = geometry.attributes.position.count;
    const short = !color || (!(color as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute && color.array instanceof Uint16Array && color.normalized);
    const white = short ? 65535 : 1;
    const array = short ? new Uint16Array(count * 4) : new Float32Array(count * 4);
    array.fill(white);
    if (color) for (let i = 0; i < count; i++) {
      // (the raw numbers of a 16-bit normalized color are copied as they are; any other kind is read as the float it is)
      if (short) { const a = color.array as Uint16Array; array[i * 4] = a[i * 3]; array[i * 4 + 1] = a[i * 3 + 1]; array[i * 4 + 2] = a[i * 3 + 2]; }
      else { array[i * 4] = color.getX(i); array[i * 4 + 1] = color.getY(i); array[i * 4 + 2] = color.getZ(i); }
    }
    geometry.setAttribute('color', new BufferAttribute(array, 4, short));
  });
}

/**
 * The material a parsed model's meshes are given in place of the glTF's: diffuse shading and vertex colors (every mesh has them now,
 * see above), and what of the glTF material Lambert has too. Made here so that the warm-up (warm-up.ts) draws its stand-in animal with exactly the same.
 */
export function animalMaterial(source: { color: Color; side: Side; transparent: boolean; opacity: number; alphaTest: number; depthWrite: boolean; depthTest: boolean }) {
  return new MeshLambertMaterial({
    color: source.color, vertexColors: true, side: source.side, transparent: source.transparent, opacity: source.opacity,
    alphaTest: source.alphaTest, depthWrite: source.depthWrite, depthTest: source.depthTest,
  });
}
