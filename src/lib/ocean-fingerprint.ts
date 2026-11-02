import { ISLAND_PLACES, ISLANDS, type IslandId } from './archipelago';
import { digestBytes, type SeabedBake } from './seabed-bake';
import type { OceanIsland } from './seabed';
import type { WaterExtent } from './seabed-lattice';

/**
 * What tells a saved ocean (ocean-store.ts) from a stale one. The ocean of several islands is not baked into the app, so a change to
 * how the seabed or the water is made would leave the files on the phones holding the old numbers. Their version (ocean-version.ts,
 * written by scripts/bake-seabed.ts) is a digest of what the shipped bakes hold (every island alone, at every level) and the oceans shipped (ocean-pack.ts) and of a few
 * oceans of several islands worked out in full here (the probes): while the code makes other numbers than the version was written
 * for, ocean-version.test.ts fails; run `npx tsx scripts/bake-seabed.ts` and the version changes, and so does every saved ocean's name.
 */
const place = (id: IslandId): OceanIsland => ({ x: ISLAND_PLACES[id][0], z: ISLAND_PLACES[id][1], habitat: ISLANDS[id] });
/**
 * The probes: the whole archipelago at its last level (the widest, with its islets, its bank and every kind of shore), a part of it in
 * another order at the first level on a wide screen (another reach from the usual), and two islands at the third.
 */
export const OCEAN_PROBES: { level: number; islands: OceanIsland[]; reach: WaterExtent }[] = [
  { level: 6, islands: (['coral-reef', 'kelp-forest', 'volcanic-pinnacle', 'mangroves', 'shipwreck'] as const).map(place), reach: { x: 20, z: 20 } },
  { level: 1, islands: (['coral-reef', 'shipwreck', 'mangroves'] as const).map(place), reach: { x: 26, z: 21 } },
  { level: 3, islands: (['coral-reef', 'volcanic-pinnacle'] as const).map(place), reach: { x: 20, z: 20 } },
];

type Typed = Float64ArrayConstructor | Float32ArrayConstructor | Uint32ArrayConstructor | Uint8ArrayConstructor;
const bytesOf = (values: ArrayLike<number>, array: Typed) => {
  const typed = values instanceof array ? values : array.from(values);
  return new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
};
/** A digest of every number of an ocean, as it is saved (float64 for the lattice, float32 for the shoaling). */
export function fingerprintOcean(bake: SeabedBake) {
  const { lattice } = bake;
  const parts = [
    bytesOf(lattice!.positions, Float64Array), bytesOf(lattice!.indices, Uint32Array), Uint8Array.of(lattice!.terrain & 255, (lattice!.terrain >> 8) & 255, (lattice!.terrain >> 16) & 255),
    bake.depth!, bake.region!, bake.regionMore!, bytesOf(bake.shoaling!, Float32Array),
  ];
  return parts.map((part) => digestBytes(part)).join('.');
}
/** A digest of the shipped bakes' (or shipped oceans') files, in the order given. */
export const fingerprintBakes = (files: Uint8Array[]) => files.map((file) => digestBytes(file)).join('.');
/** The version from its parts: a digest of their text. */
export function oceanVersion(parts: { bakes: string; probes: string[]; packs: string }) {
  const text = [parts.bakes, ...parts.probes, parts.packs].join('\n');
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 255;
  return digestBytes(bytes);
}
