import { expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MESH_FILES } from '@/components/home/three/mesh-pack-files';
import { islandMeshKeys, meshFileName } from '@/components/home/three/mesh-keys';
import { readMeshPack } from '../mesh-pack';

// The island meshes shipped with the app (assets/baked/mesh, written by scripts/bake-meshes.ts) are only as good as they are fresh: they must be the very bits the
// builders make today. These fail while a builder (or anything it is made from) has changed and the files have not been baked again; `npm run bake:meshes` writes them.
const ROOT = process.cwd();
const DIR = join(ROOT, 'assets/baked/mesh');
const SHAPES = ['reef', 'kelp', 'volcanic', 'mangrove', 'wreck'] as const;

test('the files on disk are the ones the app loads, one for each mesh a scene of any island at any level asks for, each for its own key and whole', () => {
  const keys = [...new Set(SHAPES.flatMap((shape) => [1, 2, 3, 4, 5, 6].flatMap((level) => islandMeshKeys(shape, level))))].sort();
  expect(Object.keys(MESH_FILES).sort()).toEqual(keys);
  expect(readdirSync(DIR).filter((f) => f.endsWith('.bin')).sort()).toEqual(keys.map((key) => `${meshFileName(key)}.bin`).sort());
  let bytes = 0;
  for (const key of keys) {
    const file = readFileSync(join(DIR, `${meshFileName(key)}.bin`));
    bytes += file.length;
    expect(() => readMeshPack(new Uint8Array(file), key)).not.toThrow();
  }
  // (the part of the download the meshes have; the kelp forest is made on the phone)
  expect(bytes).toBeLessThanOrEqual(4_000_000);
  expect(statSync(join(DIR, `${meshFileName(keys[0])}.bin`)).size).toBeGreaterThan(0);
});

test('every shipped mesh is the very mesh its builder makes now, bit for bit (npm run verify:meshes)', () => {
  const run = spawnSync(join(ROOT, 'node_modules/.bin/tsx'), ['--tsconfig', 'scripts/tsconfig.meshes.json', 'scripts/verify-meshes.ts'], { cwd: ROOT, encoding: 'utf8', timeout: 170000 });
  const said = `${run.stdout}${run.stderr}`.split('\n').filter((line) => line.startsWith('DIFFERS') || line.startsWith('ALL IDENTICAL') || /rror/.test(line)).join('\n');
  if (run.status !== 0) throw new Error(`The shipped island meshes are not what the builders make: run npm run bake:meshes\n${said || run.stderr}`);
  expect(said).toMatch(/^ALL IDENTICAL: \d+ files/);
}, 180000);
