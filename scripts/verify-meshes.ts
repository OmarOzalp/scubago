/**
 * Check the island meshes shipped with the app (assets/baked/mesh, src/lib/mesh-pack.ts) against the builders: every mesh of every island at every level in the
 * full quality tier worked out from nothing, and the file for it read back from disk through the store the app reads files with (mesh-store.ts, the very code
 * that gives the geometry cache its meshes), every float compared bit for bit with the builder's (position, normal, colour and every other attribute in order,
 * the bounding sphere), and the list of files (src/components/home/three/mesh-pack-files.ts) against the files on disk and the keys the scenes ask for.
 *
 *   npm run verify:meshes          (about 25 s)
 *
 * Exits with 1 on the first thing that differs, saying which mesh and how; `npm run bake:meshes` writes them again. The freshness test
 * (src/lib/__tests__/mesh-fresh.test.ts) runs this.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { geometryDifference } from '../src/components/home/three/mesh-geometry';
import { meshFileName } from '../src/components/home/three/mesh-keys';
import { forgetShippedMeshes, registerShippedMesh, shippedNow } from '../src/components/home/three/mesh-store';
import { meshBuilds } from './lib/mesh-builders';

/** The most the files may come to (bytes): the part of the app's download budget they have. */
export const MESH_BUDGET = 4_000_000;

const ROOT = resolve(dirname(process.argv[1]), '..');
const DIR = join(ROOT, 'assets/baked/mesh');
const fail = (why: string): never => { console.error(`DIFFERS: ${why}`); process.exit(1); };

function main() {
  const started = Date.now();
  const listing = readFileSync(join(ROOT, 'src/components/home/three/mesh-pack-files.ts'), 'utf8');
  const listed = [...listing.matchAll(/^ {2}'([^']+)': require\('@\/assets\/baked\/mesh\/([^']+)\.bin'\),$/gm)].map((m) => [m[1], m[2]]);
  const onDisk = readdirSync(DIR).filter((file) => file.endsWith('.bin')).map((file) => file.slice(0, -4)).sort();
  const keys = [...new Set(meshBuilds().map((build) => build.key))].sort();
  if (JSON.stringify(listed.map(([key]) => key)) !== JSON.stringify(keys)) fail(`the list of files names ${listed.length} meshes, the scenes ask for ${keys.length}`);
  for (const [key, name] of listed) if (name !== meshFileName(key)) fail(`${key} is listed as ${name}`);
  if (JSON.stringify(listed.map(([, name]) => name).sort()) !== JSON.stringify(onDisk)) fail('the files on disk are not the ones the list names');
  let bytes = 0;
  forgetShippedMeshes();
  for (const [key, name] of listed) {
    const file = new Uint8Array(readFileSync(join(DIR, `${name}.bin`)));
    bytes += file.length;
    registerShippedMesh(key, file);
  }
  if (bytes > MESH_BUDGET) fail(`the files come to ${bytes} bytes, over the ${MESH_BUDGET} they may`);
  const checked = new Set<string>();
  let meshes = 0, vertices = 0;
  for (const { key, shape, level, build } of meshBuilds()) {
    // (a key shared by several levels is the same mesh each time: checked for every level that has it, built each time)
    const made = build();
    const shipped = shippedNow(key);
    if (!shipped) return fail(`${key}: the file is not used (it is damaged, or is for another mesh)`);
    const why = geometryDifference(shipped, made);
    if (why) fail(`${key} at level ${level} (${shape}): ${why}`);
    if (!checked.has(key)) { checked.add(key); vertices += made.attributes.position.count; }
    meshes++;
    made.dispose(); shipped.dispose();
  }
  console.log(`ALL IDENTICAL: ${checked.size} files, ${bytes} bytes (within ${MESH_BUDGET}), ${meshes} meshes (every island at every level) compared bit for bit, ${vertices} vertices, in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
main();
