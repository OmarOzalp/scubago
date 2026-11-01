import { afterEach, expect, test } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprintBakes, fingerprintOcean, OCEAN_PROBES, oceanVersion } from '@/lib/ocean-fingerprint';
import { oceanSteps } from '@/lib/ocean-store';
import { OCEAN_PARTS, OCEAN_VERSION } from '@/lib/ocean-version';
import { clearSeabedBakes, seabedBakeKey, seabedBakeVariants } from '@/lib/seabed-bake';
import { finish } from '@/lib/slices';

// The oceans saved on a phone (ocean-store.ts) are only as good as their version: it must change whenever the numbers an ocean is made of
// would. These fail while it is stale; `npx tsx scripts/bake-seabed.ts` writes it again (src/lib/ocean-version.ts).
afterEach(() => clearSeabedBakes());
const STALE = 'The ocean’s numbers are not what its version was written for: run npx tsx scripts/bake-seabed.ts';

test('the version is made from the shipped bakes and the probes it records', () => {
  expect(OCEAN_VERSION).toBe(oceanVersion(OCEAN_PARTS));
  expect(OCEAN_VERSION).toMatch(/^[0-9a-f]{16}$/);
  expect(OCEAN_PARTS.probes).toHaveLength(OCEAN_PROBES.length);
});

test('the shipped bakes are the ones the version was written for', () => {
  const dir = join(process.cwd(), 'assets/baked/seabed');
  const files = readdirSync(dir).filter((file) => file.endsWith('.bin')).sort();
  expect(files).toEqual(seabedBakeVariants().map((variant) => `${variant.name}.bin`).sort());
  const bakes = fingerprintBakes(files.map((file) => new Uint8Array(readFileSync(join(dir, file)))));
  if (bakes !== OCEAN_PARTS.bakes) throw new Error(STALE);
});

test.each(OCEAN_PROBES.map((probe, n) => [`level ${probe.level}, ${probe.islands.length} islands, reach ${JSON.stringify(probe.reach)}`, n] as const))(
  'the probe %s works out to the numbers the version was written for', (_, n) => {
    const { level, islands, reach } = OCEAN_PROBES[n];
    clearSeabedBakes();
    const bake = finish(oceanSteps(level, islands, reach));
    if (fingerprintOcean(bake) !== OCEAN_PARTS.probes[n]) throw new Error(`${STALE} (${seabedBakeKey(level, islands, reach)})`);
  }, 120000);
