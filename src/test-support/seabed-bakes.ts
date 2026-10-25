import { expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OCEAN } from '@/lib/ocean';
import { bareSeabedGrid, createSeabedField } from '@/lib/seabed';
import { clearSeabedBakes, readSeabedBake, seabedBakeKey, type SeabedBakeVariant } from '@/lib/seabed-bake';
import { depthTexels, waterVertices } from '@/lib/seabed-depth';

/** A baked file's bytes (assets/baked/seabed). */
export const bakedFile = (name: string) => readFileSync(join(process.cwd(), 'assets/baked/seabed', `${name}.bin`));

/**
 * A baked file is exactly what its island's scene would work out (worked out here, with no bake in use): the same key,
 * sections, and every number the same, bit for bit. A stale bake (the seabed's code changed since) fails it: run
 * `npx tsx scripts/bake-seabed.ts`.
 */
export function expectBakeFresh(variant: SeabedBakeVariant) {
  clearSeabedBakes();
  const { key, bake } = readSeabedBake(bakedFile(variant.name));
  const { level, islands, reach, sections } = variant;
  expect(key).toBe(seabedBakeKey(level, islands, reach));
  expect(Object.entries(bake).filter(([, value]) => value !== undefined).map(([name]) => name).sort()).toEqual([...sections].sort());
  const same = (name: string, baked: ArrayLike<number> | undefined, computed: ArrayLike<number>) => {
    expect(baked).toBeDefined();
    expect(baked!.length).toBe(computed.length);
    // (Object.is: the very same number, -0 and NaN included)
    for (let i = 0; i < computed.length; i++) if (!Object.is(baked![i], computed[i])) throw new Error(`${variant.name} ${name}[${i}]: baked ${baked![i]}, worked out ${computed[i]} (run npx tsx scripts/bake-seabed.ts)`);
  };
  if (sections.includes('lattice')) {
    const lattice = createSeabedField(level, islands).lattice(reach);
    same('positions', bake.lattice?.positions, lattice.positions);
    same('indices', bake.lattice?.indices, lattice.indices);
    expect(bake.lattice?.terrain).toBe(lattice.terrain);
  }
  const texels = depthTexels(level, islands);
  if (sections.includes('depth')) same('depth', bake.depth, texels.data);
  if (sections.includes('shoaling')) same('shoaling', bake.shoaling, Float32Array.from(waterVertices(level, islands, texels.profile, OCEAN, reach ?? OCEAN.waterExtent).shoaling));
  if (sections.includes('bare')) same('bare', bake.bare, bareSeabedGrid(level, variant.shape));
}
