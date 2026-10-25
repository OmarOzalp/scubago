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
type Header = { key: string; terrain?: number; sections: Record<string, { type: SectionType; offset: number; length: number }> };

/** What one file holds (sections it has not are computed). */
export type SeabedBake = {
  /** The lattice (seabed-lattice.ts) for `reach`. */
  lattice?: Lattice;
  /** The depth map's texels (RGBA, ocean-mesh.ts's buildDepthField). */
  depth?: Uint8Array;
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

/** A bake as bytes. */
export function writeSeabedBake(key: string, bake: SeabedBake): Uint8Array {
  const parts: [string, SectionType, ArrayLike<number>][] = [];
  if (bake.lattice) {
    parts.push(['positions', 'f64', bake.lattice.positions]);
    const most = bake.lattice.indices.reduce((top, index) => Math.max(top, index), 0);
    parts.push(['indices', most < 65536 ? 'u16' : 'u32', bake.lattice.indices]);
  }
  if (bake.depth) parts.push(['depth', 'u8', bake.depth]);
  if (bake.shoaling) parts.push(['shoaling', 'f32', bake.shoaling]);
  if (bake.bare) parts.push(['bare', 'f32', bake.bare]);
  const header: Header = { key, sections: {}, ...(bake.lattice ? { terrain: bake.lattice.terrain } : {}) };
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
    new ARRAYS[type](bytes.buffer, at, values.length).set(Array.from(values));
  }
  return bytes;
}

/** A bake from its bytes (and the key it is for). Throws on anything else. */
export function readSeabedBake(source: ArrayBuffer | Uint8Array): { key: string; bake: SeabedBake } {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || view.getUint32(0, true) !== MAGIC) throw new Error('Not a seabed bake');
  if (view.getUint32(4, true) !== VERSION) throw new Error(`Seabed bake version ${view.getUint32(4, true)}, not ${VERSION}`);
  const length = view.getUint32(8, true);
  let json = '';
  for (let i = 0; i < length; i++) json += String.fromCharCode(bytes[12 + i]);
  const header = JSON.parse(json) as Header, start = Math.ceil((12 + length) / 8) * 8;
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
    shoaling: section('shoaling') as Float32Array | undefined,
    bare: section('bare') as Float32Array | undefined,
  };
  return { key: header.key, bake };
}

const lattices = new Map<string, Lattice>(), depths = new Map<string, Uint8Array>(), shoalings = new Map<string, Float32Array>(), grids = new Map<string, Float32Array>();
const registered = new Set<string>();

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
/** Forget every bake (the tests and the bake script compute instead). */
export function clearSeabedBakes() {
  lattices.clear(); depths.clear(); shoalings.clear(); grids.clear(); registered.clear();
}

/** The baked lattice for these islands at this level and reach, if any. */
export const bakedLattice = (level: number, islands: readonly OceanIsland[], reach?: WaterExtent) => lattices.get(seabedBakeKey(level, islands, reach));
/** The baked depth map's texels, if any. */
export const bakedDepth = (level: number, islands: readonly OceanIsland[]) => depths.get(placesKey(seabedBakeKey(level, islands)));
/** The baked shoaling of the water reaching `extent`, if any. */
export const bakedShoaling = (level: number, islands: readonly OceanIsland[], extent?: WaterExtent) => shoalings.get(seabedBakeKey(level, islands, extent));
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
  /** Which sections: Home's card has the lattice, depth map and shoaling, and the Coral Reef's its animals' grid too (the slowest to work out); the explorer's, its lattice and shoaling. */
  sections: ('lattice' | 'depth' | 'shoaling' | 'bare')[];
};

/** Every bake there is: each island alone at each level on Home's card, and Home's island (the Coral Reef) alone in the explorer. */
export function seabedBakeVariants(): SeabedBakeVariant[] {
  const variants: SeabedBakeVariant[] = [];
  for (const shape of ['reef', 'kelp', 'volcanic', 'mangrove', 'wreck'] as const) {
    for (let level = 1; level <= 6; level++) {
      const islands = [{ x: 0, z: 0, habitat: HABITAT[shape] }];
      variants.push({ name: `${shape}-${level}`, level, shape, islands, sections: shape === 'reef' ? ['lattice', 'depth', 'shoaling', 'bare'] : ['lattice', 'depth', 'shoaling'] });
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
