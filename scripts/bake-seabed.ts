/**
 * Build the seabed ahead of time (src/lib/seabed-bake.ts): for each island alone at each level, as Home's card shows it,
 * and Home's island alone in the explorer, what its scene would work out when first shown (the lattice, the depth map,
 * the water's shoaling, and for the Coral Reef its animals' grid), written to assets/baked/seabed/<name>.bin, plus the
 * list the app loads them from (src/components/home/three/seabed-files.ts).
 *
 *   npx tsx scripts/bake-seabed.ts             (every bake)
 *   npx tsx scripts/bake-seabed.ts --only=reef-1,kelp-6
 *
 * Run it after any change to how the seabed or the ocean's depth is made (seabed*.ts, island-outline.ts, ocean.ts,
 * banks.ts, reef-coast.ts, reef-life.ts, wreck.ts...): the seabed-bake tests compare every file with the computation and
 * fail on a stale one. Nothing is baked from a bake: none is registered in this process.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { OCEAN } from '../src/lib/ocean';
import { bareSeabedGrid, createSeabedField } from '../src/lib/seabed';
import { seabedBakeKey, seabedBakeVariants, writeSeabedBake, type SeabedBake } from '../src/lib/seabed-bake';
import { depthTexels, waterVertices } from '../src/lib/seabed-depth';

const ROOT = resolve(dirname(process.argv[1]), '..');
const OUT = join(ROOT, 'assets/baked/seabed');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7).split(',');
const variants = seabedBakeVariants();
if (only) for (const name of only) if (!variants.some((v) => v.name === name)) throw new Error(`No bake ${name} (${variants.map((v) => v.name).join(', ')})`);

mkdirSync(OUT, { recursive: true });
// Only the bakes there are: a file for a variant no longer listed goes.
if (!only) for (const file of readdirSync(OUT)) if (file.endsWith('.bin') && !variants.some((v) => `${v.name}.bin` === file)) rmSync(join(OUT, file));
for (const variant of variants) {
  if (only && !only.includes(variant.name)) continue;
  const started = performance.now();
  const { level, islands, reach, sections } = variant;
  const bake: SeabedBake = {};
  if (sections.includes('lattice')) bake.lattice = createSeabedField(level, islands).lattice(reach);
  const texels = depthTexels(level, islands);
  if (sections.includes('depth')) bake.depth = texels.data;
  if (sections.includes('shoaling')) bake.shoaling = Float32Array.from(waterVertices(level, islands, texels.profile, OCEAN, reach ?? OCEAN.waterExtent).shoaling);
  if (sections.includes('bare')) bake.bare = bareSeabedGrid(level, variant.shape);
  const bytes = writeSeabedBake(seabedBakeKey(level, islands, reach), bake);
  writeFileSync(join(OUT, `${variant.name}.bin`), bytes);
  console.log(`${variant.name}: ${sections.join(', ')} (${bytes.byteLength} bytes, ${(performance.now() - started).toFixed(0)} ms)`);
}

// The app's list: Metro bundles an asset only where a require() names it.
const lines = variants.map((v) => `  '${v.name}': require('@/assets/baked/seabed/${v.name}.bin'),`);
writeFileSync(join(ROOT, 'src/components/home/three/seabed-files.ts'), `/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles an asset only where a require() names it */
/** The seabed bakes (written by scripts/bake-seabed.ts with the files themselves: don't edit by hand), by name (seabedBakeName in seabed-bake.ts). */
export const SEABED_FILES: Record<string, number> = {
${lines.join('\n')}
};
`);
