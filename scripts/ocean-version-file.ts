/**
 * The version the oceans saved on a phone are checked against (src/lib/ocean-version.ts, ocean-fingerprint.ts): a digest of the seabed bakes and of
 * the oceans shipped with the app (assets/baked/seabed, assets/baked/ocean) as they are on disk, and of a few oceans of several islands worked out here
 * from nothing. Written by scripts/bake-seabed.ts and scripts/bake-oceans.ts after they write their files.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprintBakes, fingerprintOcean, OCEAN_PROBES, oceanVersion } from '../src/lib/ocean-fingerprint';
import { oceanSteps } from '../src/lib/ocean-store';
import { clearSeabedBakes } from '../src/lib/seabed-bake';
import { finish } from '../src/lib/slices';

/** The digests of the files in a directory, in name order. */
export const fingerprintDirectory = (dir: string) => fingerprintBakes(readdirSync(dir).filter((file) => file.endsWith('.bin')).sort().map((file) => new Uint8Array(readFileSync(join(dir, file)))));

export function writeOceanVersion(root: string) {
  clearSeabedBakes();
  const parts = {
    bakes: fingerprintDirectory(join(root, 'assets/baked/seabed')),
    probes: OCEAN_PROBES.map(({ level, islands, reach }) => fingerprintOcean(finish(oceanSteps(level, islands, reach)))),
    packs: fingerprintDirectory(join(root, 'assets/baked/ocean')),
  };
  writeFileSync(join(root, 'src/lib/ocean-version.ts'), `/* Written by scripts/bake-seabed.ts and scripts/bake-oceans.ts (npx tsx scripts/bake-seabed.ts); don't edit by hand. See ocean-fingerprint.ts. */
export const OCEAN_PARTS = ${JSON.stringify(parts, null, 2)};
export const OCEAN_VERSION = '${oceanVersion(parts)}';
`);
  return oceanVersion(parts);
}
