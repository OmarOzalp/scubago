import { EXPLORER } from './explorer-view';
import { shapeFor, type IslandShape } from './island-outline';
import { OCEAN } from './ocean';
import type { OceanIsland } from './seabed';
import type { Lattice, WaterExtent } from './seabed-lattice';

/**
 * The seabed built ahead of time: what an island's scene computes when it is first shown (the lattice the seabed is
 * drawn from and the animals swim over, the depth map, the water's shoaling, the animals' grid of the bottom), baked
 * by `scripts/bake-seabed.ts` into small binary files (assets/baked/seabed) for the islands as Home shows them, one at
 * a time, at every level, and Home's island alone in the explorer. Once a file is registered here, what it holds is
 * used instead of computing it: the very same numbers (src/lib/__tests__/seabed-bake-*.test.ts compares every file
 * with the computation, so a stale bake fails them). Anything without a bake is computed as before.
 *
 * A file: 'SGBK', a version, the length of a JSON header (ASCII), the header ({ key, sections: { name: { type,
 * offset, length } }, terrain }), then each section's numbers (little-endian, each starting on a multiple of 8 bytes).
 */
const MAGIC = 0x4b424753; // 'SGBK'
const VERSION = 1;
type SectionType = 'f64' | 'f32' | 'u32' | 'u16' | 'u8';
const ARRAYS = { f64: Float64Array, f32: Float32Array, u32: Uint32Array, u16: Uint16Array, u8: Uint8Array } as const;
type Header = { key: string; meta?: string; check?: string; terrain?: number; sections: Record<string, { type: SectionType; offset: number; length: number }> };

/** What one file holds (sections it has not are computed). */
export type SeabedBake = {
  /** The lattice (seabed-lattice.ts) for `reach`. */
  lattice?: Lattice;
  /** The depth map's texels (RGBA, ocean-mesh.ts's buildDepthField). */
  depth?: Uint8Array;
  /** The region maps beside it (seabed-depth.ts: one channel a palette, four to a map), which only an ocean of several islands has. */
  region?: Uint8Array;
  regionMore?: Uint8Array;
  /** The water lattice's shoaling, a value a vertex, for `reach` as the water's extent (ocean-mesh.ts's waterLattice). */
  shoaling?: Float32Array;
  /** The animals' grid of the bare seabed (seabed.ts's createSeabed, a lone island). */
  bare?: Float32Array;
};

/** Which bake an island set at a level (and reach) is: its islands as placed, and the reach (none is the usual OCEAN.waterExtent). */
export function seabedBakeKey(level: number, islands: readonly OceanIsland[], reach?: WaterExtent) {
  return `${level}|${islands.map((i) => `${i.x},${i.z},${i.habitat}`).join(';')}|${JSON.stringify(reach ?? OCEAN.waterExtent)}`;
}
/** The same without the reach, for what does not depend on it (the depth map, the animals' grid). */
const placesKey = (key: string) => key.slice(0, key.lastIndexOf('|'));

/**
 * A digest of bytes: two running sums over their 32-bit words (and a last few bytes), the second of the first's totals, so a word changed, moved
 * or left off shows. For telling a file damaged or cut short from the one written, and an ocean's numbers changed from what they were.
 */
export function digestBytes(source: Uint8Array, from = 0, to = source.byteLength) {
  // (words need an aligned view: a copy where the bytes lie across one, as a Node Buffer from its pool may)
  const bytes = (source.byteOffset + from) % 4 === 0 ? source.subarray(from, to) : source.slice(from, to);
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2);
  let a = 0, b = 0;
  for (let i = 0; i < words.length; i++) { a = (a + words[i]) >>> 0; b = (b + a) >>> 0; }
  for (let i = words.length * 4; i < bytes.byteLength; i++) { a = (a + bytes[i]) >>> 0; b = (b + a) >>> 0; }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
const NO_DIGEST = '0'.repeat(16);

/** A bake as bytes (`meta`: whatever else the file should say it is for, which a reader can ask for; the ocean store's version). */
export function writeSeabedBake(key: string, bake: SeabedBake, meta?: string): Uint8Array {
  const parts: [string, SectionType, ArrayLike<number>][] = [];
  if (bake.lattice) {
    parts.push(['positions', 'f64', bake.lattice.positions]);
    const most = bake.lattice.indices.reduce((top, index) => Math.max(top, index), 0);
    parts.push(['indices', most < 65536 ? 'u16' : 'u32', bake.lattice.indices]);
  }
  if (bake.depth) parts.push(['depth', 'u8', bake.depth]);
  if (bake.region) parts.push(['region', 'u8', bake.region]);
  if (bake.regionMore) parts.push(['regionMore', 'u8', bake.regionMore]);
  if (bake.shoaling) parts.push(['shoaling', 'f32', bake.shoaling]);
  if (bake.bare) parts.push(['bare', 'f32', bake.bare]);
  // (a file that says what it is for also carries a digest of its numbers, put in once they are down)
  const header: Header = { key, ...(meta !== undefined ? { meta, check: NO_DIGEST } : {}), sections: {}, ...(bake.lattice ? { terrain: bake.lattice.terrain } : {}) };
  // Offsets from the start of the data, which begins after the header (padded to 8).
  let offset = 0;
  for (const [name, type, values] of parts) {
    header.sections[name] = { type, offset, length: values.length };
    offset += Math.ceil(values.length * ARRAYS[type].BYTES_PER_ELEMENT / 8) * 8;
  }
  const json = JSON.stringify(header), start = Math.ceil((12 + json.length) / 8) * 8;
  const bytes = new Uint8Array(start + offset), view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true); view.setUint32(4, VERSION, true); view.setUint32(8, json.length, true);
  for (let i = 0; i < json.length; i++) bytes[12 + i] = json.charCodeAt(i);
  for (const [name, type, values] of parts) {
    const at = start + header.sections[name].offset;
    new ARRAYS[type](bytes.buffer, at, values.length).set(values);
  }
  if (meta !== undefined) {
    const digest = digestBytes(bytes, start), at = 12 + json.indexOf(`"check":"${NO_DIGEST}`) + 9;
    for (let i = 0; i < digest.length; i++) bytes[at + i] = digest.charCodeAt(i);
  }
  return bytes;
}

/** A bake from its bytes (and the key, and the `meta`, it is for). Throws on anything else, a file cut short or damaged included. */
export function readSeabedBake(source: ArrayBuffer | Uint8Array): { key: string; meta?: string; bake: SeabedBake } {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || view.getUint32(0, true) !== MAGIC) throw new Error('Not a seabed bake');
  if (view.getUint32(4, true) !== VERSION) throw new Error(`Seabed bake version ${view.getUint32(4, true)}, not ${VERSION}`);
  const length = view.getUint32(8, true);
  let json = '';
  for (let i = 0; i < length; i++) json += String.fromCharCode(bytes[12 + i]);
  const header = JSON.parse(json) as Header, start = Math.ceil((12 + length) / 8) * 8;
  if (header.check !== undefined && header.check !== digestBytes(bytes, start)) throw new Error('Seabed bake damaged or cut short');
  // Each section copied out to its own aligned buffer (the file's bytes may sit at any offset).
  const section = (name: string) => {
    const s = header.sections[name];
    if (!s) return undefined;
    const size = ARRAYS[s.type].BYTES_PER_ELEMENT, at = start + s.offset;
    if (at + s.length * size > bytes.byteLength) throw new Error(`Seabed bake section ${name} runs past the file`);
    // (Uint8Array's own slice, a copy: a Node Buffer's slice is a view of the whole pool)
    return new ARRAYS[s.type](Uint8Array.prototype.slice.call(bytes, at, at + s.length * size).buffer);
  };
  const positions = section('positions'), indices = section('indices');
  const bake: SeabedBake = {
    // (the lattice as the computation gives it: plain arrays of the very same numbers)
    lattice: positions && indices ? { positions: Array.from(positions), indices: Array.from(indices), terrain: header.terrain ?? 0 } : undefined,
    depth: section('depth') as Uint8Array | undefined,
    region: section('region') as Uint8Array | undefined,
    regionMore: section('regionMore') as Uint8Array | undefined,
    shoaling: section('shoaling') as Float32Array | undefined,
    bare: section('bare') as Float32Array | undefined,
  };
  return { key: header.key, meta: header.meta, bake };
}

const lattices = new Map<string, Lattice>(), depths = new Map<string, Uint8Array>(), shoalings = new Map<string, Float32Array>(), grids = new Map<string, Float32Array>();
const registered = new Set<string>();

/**
 * The oceans worked out or read back from the phone (ocean-store.ts), for island sets the shipped bakes don't cover (the explorer's several islands): a bake of
 * their own, in the same lookups, but only the last `KEPT_OCEANS` are held (a few megabytes each), the one used longest ago going first.
 */
export const KEPT_OCEANS = 3;
let oceans: { key: string; bake: SeabedBake }[] = [];
/** Hold this ocean's numbers (for `key`: seabedBakeKey) in place of working them out, from now on. */
export function rememberOcean(key: string, bake: SeabedBake) {
  oceans = [...oceans.filter((ocean) => ocean.key !== key), { key, bake }].slice(-KEPT_OCEANS);
}
/** Whether this ocean is held. */
export const hasOcean = (key: string) => oceans.some((ocean) => ocean.key === key);
/** The ocean held for this key, or for these islands and level whatever the reach (what does not depend on the reach: `placesOnly`), as the most recently used. */
function ocean(key: string, placesOnly = false) {
  let found: (typeof oceans)[number] | undefined;
  for (let i = oceans.length - 1; i >= 0 && !found; i--) if (placesOnly ? placesKey(oceans[i].key) === key : oceans[i].key === key) found = oceans[i];
  if (found && found !== oceans[oceans.length - 1]) oceans = [...oceans.filter((held) => held !== found), found];
  return found?.bake;
}

/** Use a bake from now on (its bytes, as the file holds them). Returns its key. */
export function registerSeabedBake(source: ArrayBuffer | Uint8Array) {
  const { key, bake } = readSeabedBake(source);
  if (bake.lattice) lattices.set(key, bake.lattice);
  if (bake.shoaling) shoalings.set(key, bake.shoaling);
  if (bake.depth) depths.set(placesKey(key), bake.depth);
  if (bake.bare) grids.set(placesKey(key), bake.bare);
  registered.add(key);
  return key;
}
/** Whether the bake for this key is registered. */
export const hasSeabedBake = (key: string) => registered.has(key);
/** Things made from the bakes, or in place of them, that are kept (seabed-depth.ts's maps): let go of when the bakes are, so that what is worked out next is worked out. */
const keepers: (() => void)[] = [];
export const whenBakesClear = (forget: () => void) => { keepers.push(forget); };
/** Forget every bake (the tests and the bake script compute instead). */
export function clearSeabedBakes() {
  lattices.clear(); depths.clear(); shoalings.clear(); grids.clear(); registered.clear(); oceans = [];
  for (const forget of keepers) forget();
}

/** The baked lattice for these islands at this level and reach, if any. */
export const bakedLattice = (level: number, islands: readonly OceanIsland[], reach?: WaterExtent) => {
  const key = seabedBakeKey(level, islands, reach);
  return lattices.get(key) ?? ocean(key)?.lattice;
};
/** The baked depth map's texels, if any. */
export const bakedDepth = (level: number, islands: readonly OceanIsland[]) => {
  const key = placesKey(seabedBakeKey(level, islands));
  return depths.get(key) ?? ocean(key, true)?.depth;
};
/** The region maps of a held ocean (they are in no shipped bake: a lone island's is all its own), if any. */
export const bakedRegions = (level: number, islands: readonly OceanIsland[]) => {
  const held = ocean(placesKey(seabedBakeKey(level, islands)), true);
  return held?.region && held.regionMore ? { region: held.region, regionMore: held.regionMore } : undefined;
};
/** The baked shoaling of the water reaching `extent`, if any. */
export const bakedShoaling = (level: number, islands: readonly OceanIsland[], extent?: WaterExtent) => {
  const key = seabedBakeKey(level, islands, extent);
  return shoalings.get(key) ?? ocean(key)?.shoaling;
};
/** The baked bare grid of a lone island, if any. */
export const bakedGrid = (level: number, islands: readonly OceanIsland[]) => grids.get(placesKey(seabedBakeKey(level, islands)));

/** The habitat whose water a lone island of each shape has (as seabed.ts's HABITATS). */
const HABITAT: Record<IslandShape, OceanIsland['habitat']> = { reef: 'island', kelp: 'kelp', volcanic: 'volcanic', mangrove: 'mangrove', wreck: 'wreck' };
/** The explorer's water on a phone held upright, Home's island alone in it: EXPLORER.reach each way (waterReach in explorer-view.ts). */
export const EXPLORER_REACH = { x: EXPLORER.reach, z: EXPLORER.reach } as const;

/** One baked file: an island alone at a level, as Home shows it or (Home's) in the explorer, and what it holds. */
export type SeabedBakeVariant = {
  name: string; level: number; shape: IslandShape; islands: OceanIsland[];
  /** The explorer's reach (none: Home's card's). */
  reach?: typeof EXPLORER_REACH;
  /** Which sections: Home's card has the lattice, depth map and shoaling and its animals' grid of the bottom; the explorer's, its lattice and shoaling. */
  sections: ('lattice' | 'depth' | 'shoaling' | 'bare')[];
};

/** Every bake there is: each island alone at each level on Home's card, and Home's island (the Coral Reef) alone in the explorer. */
export function seabedBakeVariants(): SeabedBakeVariant[] {
  const variants: SeabedBakeVariant[] = [];
  for (const shape of ['reef', 'kelp', 'volcanic', 'mangrove', 'wreck'] as const) {
    for (let level = 1; level <= 6; level++) {
      const islands = [{ x: 0, z: 0, habitat: HABITAT[shape] }];
      variants.push({ name: `${shape}-${level}`, level, shape, islands, sections: ['lattice', 'depth', 'shoaling', 'bare'] });
      if (shape === 'reef') variants.push({ name: `${shape}-${level}-explorer`, level, shape, islands, reach: EXPLORER_REACH, sections: ['lattice', 'shoaling'] });
    }
  }
  return variants;
}

/** The name of the baked file for these islands at this level and reach, or null when there is none (several islands, another reach). */
export function seabedBakeName(level: number, islands: readonly OceanIsland[], reach?: WaterExtent) {
  if (islands.length !== 1 || islands[0].x !== 0 || islands[0].z !== 0 || !Number.isInteger(level) || level < 1 || level > 6) return null;
  const shape = shapeFor(islands[0].habitat);
  if (HABITAT[shape] !== islands[0].habitat) return null;
  if (reach === undefined || JSON.stringify(reach) === JSON.stringify(OCEAN.waterExtent)) return `${shape}-${level}`;
  return shape === 'reef' && JSON.stringify(reach) === JSON.stringify(EXPLORER_REACH) ? `${shape}-${level}-explorer` : null;
}
