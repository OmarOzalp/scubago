/**
 * Build the island meshes shipped with the app (src/lib/mesh-pack.ts): the coasts, corals, kelp forests, seagrass meadows and the wreck, worked out by the very code
 * that works them out on a phone, for every island and level, in the full quality tier (a simulator's lite tier makes its own), written to
 * assets/baked/mesh/<key>.bin, plus the list the app loads them from (src/components/home/three/mesh-pack-files.ts).
 *
 *   npm run bake:meshes          (npx tsx --tsconfig scripts/tsconfig.meshes.json scripts/bake-meshes.ts)
 *
 * Every file is read back through the code the app reads it with and compared with the geometry it was made from, bit for bit (the attributes in order, every float's
 * bits, the bounding sphere): one that differs is never written. A mesh is built a second time, and at every level that shares its key, and must come out the same.
 * `npm run verify:meshes` checks the files as they are on disk against the builders afresh. Run this after any change to what makes a mesh (the builders in
 * src/components/home/three, src/lib/island-outline.ts, reef-coast.ts, kelp.ts, seagrass.ts, ocean.ts...): the freshness test (src/lib/__tests__/mesh-fresh.test.ts)
 * fails on a stale file.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { constants, deflateRawSync } from 'node:zlib';
import type { BufferGeometry } from 'three';
import { encodeMesh, readMeshPack, readMesh } from '../src/lib/mesh-pack';
import { geometryDifference, geometryOfRead, meshOfGeometry, normalsAreDerived } from '../src/components/home/three/mesh-geometry';
import { meshFileName } from '../src/components/home/three/mesh-keys';
import { meshBuilds } from './lib/mesh-builders';

/** Deflated as small as zlib's strategies make it (any of them inflates the same). */
const compress = (bytes: Uint8Array) => {
  let best: Buffer | undefined;
  for (const strategy of [constants.Z_DEFAULT_STRATEGY, constants.Z_FILTERED]) {
    const packed = deflateRawSync(bytes, { level: 9, memLevel: 9, strategy });
    if (!best || packed.length < best.length) best = packed;
  }
  return new Uint8Array(best!);
};

/** One mesh as a file, read back and checked against the geometry. Throws if the file would not give the geometry back. */
export function meshFile(key: string, geometry: BufferGeometry): Uint8Array {
  const mesh = meshOfGeometry(geometry);
  const bytes = encodeMesh(key, mesh, normalsAreDerived(geometry) ? ['normal'] : [], compress);
  const back = geometryOfRead(readMesh(readMeshPack(bytes, key)));
  const why = geometryDifference(back, geometry);
  if (why) throw new Error(`the file for ${key} differs from the computation, and is not written: ${why}`);
  return bytes;
}

/** Every file, worked out and checked, by key. Nothing is written. */
export function buildMeshFiles(log: (line: string) => void = () => undefined) {
  const files = new Map<string, Uint8Array>();
  const started = Date.now();
  for (const { key, shape, level, build } of meshBuilds()) {
    const geometry = build();
    const earlier = files.get(key);
    if (earlier) {
      // (the same key at another level: the same mesh, or the key is wrong)
      const why = geometryDifference(geometry, geometryOfRead(readMesh(readMeshPack(earlier, key))));
      if (why) throw new Error(`${key} at level ${level} (${shape}) is not the mesh the key's first level made: ${why}`);
      continue;
    }
    const again = build();
    const why = geometryDifference(again, geometry);
    if (why) throw new Error(`${key} is not made the same way twice: ${why}`);
    const bytes = meshFile(key, geometry);
    files.set(key, bytes);
    log(`${key.padEnd(26)} ${String(geometry.attributes.position.count).padStart(7)} vertices  ${String(bytes.length).padStart(7)} bytes  (${((Date.now() - started) / 1000).toFixed(0)} s)`);
    geometry.dispose(); again.dispose();
  }
  return files;
}

/** Write the files, and the list the app loads them from. */
export function writeMeshFiles(root: string, files: Map<string, Uint8Array>) {
  const out = join(root, 'assets/baked/mesh');
  mkdirSync(out, { recursive: true });
  const names = new Map([...files.keys()].sort().map((key) => [key, meshFileName(key)]));
  for (const file of readdirSync(out)) if (file.endsWith('.bin') && ![...names.values()].includes(file.slice(0, -4))) rmSync(join(out, file));
  for (const [key, name] of names) writeFileSync(join(out, `${name}.bin`), files.get(key)!);
  const lines = [...names].map(([key, name]) => `  '${key}': require('@/assets/baked/mesh/${name}.bin'),`);
  writeFileSync(join(root, 'src/components/home/three/mesh-pack-files.ts'), `/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles an asset only where a require() names it */
/** The meshes shipped with the app (written by scripts/bake-meshes.ts with the files themselves: don't edit by hand), by geometry-cache key (mesh-keys.ts). */
export const MESH_FILES: Record<string, number> = {
${lines.join('\n')}
};
`);
  return [...names.values()];
}

function main() {
  const ROOT = resolve(dirname(process.argv[1]), '..');
  const started = Date.now();
  const files = buildMeshFiles((line) => console.log(line));
  const names = writeMeshFiles(ROOT, files);
  const total = [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  console.log(`${names.length} files, ${total} bytes (${((Date.now() - started) / 1000).toFixed(0)} s)`);
}
if (process.argv[1] && /bake-meshes\.[tj]s$/.test(process.argv[1])) main();
