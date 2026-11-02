import { ISLAND_PLACES, ISLANDS } from './archipelago';
import { inflate } from './inflate';
import { shapeFor, shorePolygons } from './island-outline';
import type { OceanIsland } from './seabed';
import { seabedBakeKey, type SeabedBake } from './seabed-bake';
import { depthGrid, habitatsOf, regionFiller } from './seabed-depth';
import { oceanBox, seabedLatticeSteps, type Lattice, type LatticeKnown, type LatticeSource, type WaterExtent } from './seabed-lattice';
import type { Steps } from './slices';

/**
 * The explorer's ocean for the islands a diver can have found, worked out ahead of time and shipped with the app, so that the very first open
 * of the explorer (nothing worked out, nothing saved yet) does not spend seconds on a phone's interpreter working it out.
 *
 * What is shipped is not the arrays themselves (they come to 1.6 MB for the five islands) but what the code cannot make quickly, kept as small as
 * the structure of the ocean allows, and every other number is made by the very same code as always, so each array comes out bit for bit as the
 * computation gives it (scripts/bake-oceans.ts writes the files from the computation; ocean-pack.test.ts and the bake script check every one
 * against it):
 *
 * - The depth map's texels and the water's shoaling are the same whatever order the islands after Home's are listed in (Home's is always first:
 *   `foundIslands`), so one pack serves every order of a set of islands at a level. It holds the four planes of the texels (each as it is
 *   predicted from its row above or its left neighbour, deflated), the shoaling and the heights of the open sea's floor between the islands (the
 *   part of the lattice that belongs to the set).
 * - The seabed round an island is the same in every set that has the island (the same level and number of rings) except at a few vertices where
 *   the shallow bank between the islands (banks.ts) is nearer the surface: an island's table (`OceanTable`, one for each island and level) holds
 *   its heights, the Coral Reef's whole block of vertices too, since its rays are dear to find; a pack holds the few vertices that differ.
 * - The region maps (whose water each texel is) are a formula of where the islands are, which does not depend on the level: a file of them for each
 *   set of islands (`encodeOceanRegions`), a plane for each island that goes to its channel in any order, is cheaper to read than the formula
 *   (regionFiller in seabed-depth.ts, which makes the same numbers and is used where there is no file) is to work out.
 * - The rest of the lattice (a plain shore's rays and the triangles) is made by seabedLatticeSteps (seabed-lattice.ts) itself, told what it need not
 *   work out (`LatticeKnown`).
 */

/** Which islands a pack can be for: the archipelago's, each by the water it has. */
const CODES: Record<string, string> = { island: 'r', kelp: 'k', volcanic: 'v', mangrove: 'm', wreck: 'w' };
const PLACES = Object.entries(ISLANDS).map(([id, habitat]) => ({ x: ISLAND_PLACES[id as keyof typeof ISLANDS][0], z: ISLAND_PLACES[id as keyof typeof ISLANDS][1], habitat: habitat as OceanIsland['habitat'], code: CODES[habitat] }));
/** The explorer's water on a phone: this far each way from every island's middle (EXPLORER.reach in explorer-view.ts). The packs are for it only. */
export const PACK_REACH = { x: 20, z: 20 } as const;
/** The rays of an island's terrain (seabed-lattice.ts). */
const RAYS = 96;

/** The islands in the order a pack keeps them: north to south along the chain (by z). */
export const chainOrder = <T extends { x: number; z: number }>(islands: readonly T[]) => [...islands].sort((a, b) => a.z - b.z || a.x - b.x);
/** The letters of an island's habitat (r, k, v, m, w), or undefined for water the archipelago has no island of at that place. */
function codeOf(island: OceanIsland) {
  return PLACES.find((place) => place.x === island.x && place.z === island.z && place.habitat === island.habitat)?.code;
}
/**
 * The letters of these islands from north to south ('kvrmw'), or null where they are not a set a pack is for. Home's island is in every one and comes
 * first in the list (`foundIslands`): its rays are the dear ones, and it is the island the maps fall back to far from every shore (seabed.ts's
 * `nearest` takes the first), so the numbers are the same in every order of the others, and only with Home first.
 */
export function oceanSetCode(islands: readonly OceanIsland[]) {
  if (islands.length < 2 || codeOf(islands[0]) !== 'r') return null;
  const codes: string[] = [];
  for (const island of chainOrder(islands)) {
    const code = codeOf(island);
    if (!code || codes.includes(code)) return null;
    codes.push(code);
  }
  return codes.includes('r') ? codes.join('') : null;
}
/** The name of the pack for these islands (in any order) at this level and reach, or null where none can be: 'kvrmw-3'. */
export function oceanPackName(level: number, islands: readonly OceanIsland[], reach: WaterExtent) {
  if (!Number.isInteger(level) || level < 1 || level > 6) return null;
  const same = typeof reach === 'number' ? reach === PACK_REACH.x && reach === PACK_REACH.z : reach.x === PACK_REACH.x && reach.z === PACK_REACH.z;
  const set = same ? oceanSetCode(islands) : null;
  return set ? `${set}-${level}` : null;
}
/** The name of the region maps of these islands (in any order; the same at every level): 'rg-kvrmw'. */
export const oceanRegionsName = (islands: readonly OceanIsland[]) => { const set = oceanSetCode(islands); return set ? `rg-${set}` : null; };
/** The name of an island's table at a level: 'r-3'. */
export const oceanTableName = (code: string, level: number) => `${code}-${level}`;
export const islandCode = codeOf;

type Section = { offset: number; length: number; size: number };
type PackHeader = {
  v: number; name: string; key: string; level: number; columns: number; rows: number; floor: number;
  /** Each island's block of vertices in the lattice: its code, the rings a ray has, how many of its heights differ from the table's. */
  blocks: { code: string; n: number; over: number }[];
  /** How each plane of the texels is predicted: from the row above ('up'), the texel to the left, or not at all. */
  planes: ('up' | 'left' | 'none')[];
  sections: Record<string, Section>;
};
/** The region maps of a set of islands (whose water each texel is), a plane for each island, the same at every level: the islands' codes in order, how each plane is predicted. */
type RegionsHeader = { v: number; name: string; columns: number; rows: number; codes: string; planes: ('up' | 'left' | 'none')[]; sections: Record<string, Section> };
/** An island's table: for each number of rings a ray has (`n`), sections `y<n>` (the heights, ray by ray) and, for the Coral Reef, `xz<n>`. */
type TableHeader = { v: number; code: string; level: number; variants: { n: number }[] };

const PACK_MAGIC = 0x4b504753, TABLE_MAGIC = 0x4b544753, REGIONS_MAGIC = 0x4b524753; // 'SGPK', 'SGTK', 'SGRK'
const VERSION = 1;

/** Bytes laid out as a file: magic, version, the header (JSON) and then the sections each deflated, every one on a multiple of 8 bytes. */
function writeFile(magic: number, header: Record<string, unknown> & { sections?: Record<string, Section> }, parts: [string, Uint8Array, number][]) {
  // (the sections' places depend on the header's size, which they are written into: the header is written with relative places, from the start of the data)
  const sections: Record<string, Section> = {};
  let offset = 0;
  for (const [name, bytes, size] of parts) { sections[name] = { offset, length: bytes.length, size }; offset += Math.ceil(bytes.length / 8) * 8; }
  const json = JSON.stringify({ ...header, sections }), start = Math.ceil((12 + json.length) / 8) * 8;
  const out = new Uint8Array(start + offset), view = new DataView(out.buffer);
  view.setUint32(0, magic, true); view.setUint32(4, VERSION, true); view.setUint32(8, json.length, true);
  for (let i = 0; i < json.length; i++) out[12 + i] = json.charCodeAt(i);
  for (const [name, bytes] of parts) out.set(bytes, start + sections[name].offset);
  return out;
}
function readFile(source: ArrayBuffer | Uint8Array, magic: number) {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || view.getUint32(0, true) !== magic) throw new Error('Not an ocean pack');
  if (view.getUint32(4, true) !== VERSION) throw new Error(`Ocean pack version ${view.getUint32(4, true)}, not ${VERSION}`);
  const length = view.getUint32(8, true);
  let json = '';
  for (let i = 0; i < length; i++) json += String.fromCharCode(bytes[12 + i]);
  const header = JSON.parse(json), start = Math.ceil((12 + length) / 8) * 8;
  /** A section, inflated (a copy of its own, so that it can be viewed as numbers). */
  const section = (name: string) => {
    const s = (header.sections as Record<string, Section>)[name];
    if (!s) throw new Error(`Ocean pack has no section ${name}`);
    if (start + s.offset + s.length > bytes.byteLength) throw new Error(`Ocean pack section ${name} runs past the file`);
    return inflate(bytes.subarray(start + s.offset, start + s.offset + s.length), s.size);
  };
  return { header, section };
}

export type OceanPack = { header: PackHeader; section(name: string): Uint8Array };
export type OceanTable = { header: TableHeader; section(name: string): Uint8Array };
export const readOceanPack = (source: ArrayBuffer | Uint8Array): OceanPack => readFile(source, PACK_MAGIC) as OceanPack;
export const readOceanTable = (source: ArrayBuffer | Uint8Array): OceanTable => readFile(source, TABLE_MAGIC) as OceanTable;
export type OceanRegions = { header: RegionsHeader; section(name: string): Uint8Array };
export const readOceanRegions = (source: ArrayBuffer | Uint8Array): OceanRegions => readFile(source, REGIONS_MAGIC) as OceanRegions;

const f64 = (bytes: Uint8Array) => new Float64Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 3);
const f32 = (bytes: Uint8Array) => new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2);
const u32 = (bytes: Uint8Array) => new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2);
const bytesOf = (values: ArrayLike<number>, array: Float64ArrayConstructor | Float32ArrayConstructor | Uint32ArrayConstructor) => {
  const typed = values instanceof array ? values : array.from(values);
  return new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
};

/** Where in a lattice the open sea's floor and each island's block lie (the islands in the order the lattice was made in). */
export function latticeLayout(lattice: Lattice, islands: readonly OceanIsland[], reach: WaterExtent) {
  const box = oceanBox(islands, reach), step = .75;
  const floor = islands.length > 1 ? (Math.ceil(box.width / step) + 1) * (Math.ceil(box.depth / step) + 1) : 0;
  const blocks: { start: number; n: number }[] = [];
  let first = floor, at = lattice.terrain;
  for (let i = 0; i < islands.length; i++) {
    // (a block's first triangle is its first vertex, the same ring of the next ray, and the next ring of the first)
    const n = lattice.indices[at + 1] - lattice.indices[at];
    if (lattice.indices[at] !== first || n < 2) throw new Error('The lattice is not laid out as expected');
    blocks.push({ start: first, n });
    at += RAYS * (n - 1) * 6; first += RAYS * n;
  }
  return { floor, blocks };
}

const PLANE_NAMES = ['dR', 'dG', 'dB', 'dA'];
type PlaneMode = 'up' | 'left' | 'none';
function predicted(plane: Uint8Array, columns: number, mode: PlaneMode) {
  if (mode === 'none') return plane;
  const out = new Uint8Array(plane.length);
  for (let i = 0; i < plane.length; i++) {
    const guess = mode === 'up' ? (i >= columns ? plane[i - columns] : 0) : (i % columns ? plane[i - 1] : 0);
    out[i] = (plane[i] - guess) & 255;
  }
  return out;
}
/** A plane of bytes as the better of its predictions deflates it. */
function packPlane(plane: Uint8Array, columns: number, compress: Compress) {
  let best: { mode: PlaneMode; packed: Uint8Array } | undefined;
  for (const mode of ['none', 'up', 'left'] as const) {
    const packed = compress(predicted(plane, columns, mode));
    if (!best || packed.length < best.packed.length) best = { mode, packed };
  }
  return best!;
}
/** A plane undone into every `stride`th byte of `out` from `offset` (the texels' channels are laid out one texel after another). */
function unpackPlane(plane: Uint8Array, mode: PlaneMode, columns: number, rows: number, out: Uint8Array, stride: number, offset: number) {
  const texels = columns * rows;
  if (mode === 'up') {
    for (let i = 0; i < columns; i++) out[i * stride + offset] = plane[i];
    for (let i = columns; i < texels; i++) out[i * stride + offset] = (plane[i] + out[(i - columns) * stride + offset]) & 255;
  } else if (mode === 'left') {
    for (let j = 0; j < rows; j++) {
      let left = 0;
      for (let i = j * columns, end = i + columns; i < end; i++) { left = (plane[i] + left) & 255; out[i * stride + offset] = left; }
    }
  } else for (let i = 0; i < texels; i++) out[i * stride + offset] = plane[i];
}

/** Everything a pack is made from, for one set of islands at one level, in the islands' chain order: the ocean worked out for them in any order, and that order. */
export type PackSource = { level: number; islands: readonly OceanIsland[]; bake: SeabedBake };
export type Compress = (bytes: Uint8Array) => Uint8Array;

/**
 * The tables of the islands, from every ocean there is: for each island, level and number of rings a ray has, the height most sets agree on at each
 * vertex (the Coral Reef's x and z too: they are the same in every set). Returns them by `oceanTableName` and the number of rings, with the
 * contents `encodeOceanPack` leaves out of each pack.
 */
export function chooseTables(sources: readonly PackSource[]) {
  type Entry = { y: Float64Array; xz: Float64Array };
  const groups = new Map<string, Entry[]>();
  for (const { level, islands, bake } of sources) {
    const layout = latticeLayout(bake.lattice!, islands, PACK_REACH);
    islands.forEach((island, i) => {
      const { start, n } = layout.blocks[i], count = RAYS * n, positions = bake.lattice!.positions;
      const y = new Float64Array(count), xz = new Float64Array(count * 2);
      for (let v = 0; v < count; v++) { xz[v * 2] = positions[(start + v) * 3]; y[v] = positions[(start + v) * 3 + 1]; xz[v * 2 + 1] = positions[(start + v) * 3 + 2]; }
      const key = `${codeOf(island)}|${level}|${n}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push({ y, xz });
    });
  }
  const tables = new Map<string, { y: Float64Array; xz: Float64Array }>();
  for (const [key, list] of groups) {
    const count = list[0].y.length, y = new Float64Array(count);
    for (let v = 0; v < count; v++) {
      const seen = new Map<number, number>();
      let best = list[0].y[v], most = 0;
      for (const entry of list) {
        if (!Object.is(entry.xz[v * 2], list[0].xz[v * 2]) || !Object.is(entry.xz[v * 2 + 1], list[0].xz[v * 2 + 1])) throw new Error(`The vertices of ${key} are not the same in every set`);
        const c = (seen.get(entry.y[v]) ?? 0) + 1;
        seen.set(entry.y[v], c);
        if (c > most) { most = c; best = entry.y[v]; }
      }
      y[v] = best;
    }
    tables.set(key, { y, xz: list[0].xz });
  }
  return tables;
}

/** An island's table file for a level: each ring count's heights (and, for the Coral Reef, whose rays are dear to find, x and z too). */
export function encodeOceanTable(code: string, level: number, tables: ReturnType<typeof chooseTables>, compress: Compress) {
  const parts: [string, Uint8Array, number][] = [];
  const mine = [...tables.entries()].filter(([key]) => key.startsWith(`${code}|${level}|`)).map(([key, value]) => ({ n: Number(key.split('|')[2]), ...value })).sort((a, b) => a.n - b.n);
  for (const { n, y, xz } of mine) {
    const yBytes = bytesOf(y, Float64Array);
    parts.push([`y${n}`, compress(yBytes), yBytes.length]);
    if (code === 'r') { const xzBytes = bytesOf(xz, Float64Array); parts.push([`xz${n}`, compress(xzBytes), xzBytes.length]); }
  }
  return writeFile(TABLE_MAGIC, { v: VERSION, code, level, variants: mine.map(({ n }) => ({ n })) }, parts);
}

/** A pack for one set of islands at one level. */
export function encodeOceanPack(source: PackSource, tables: ReturnType<typeof chooseTables>, compress: Compress) {
  const { level, bake } = source, islands = source.islands;
  const order = islands.map((island, i) => ({ island, i })).sort((a, b) => a.island.z - b.island.z || a.island.x - b.island.x);
  const { columns, rows } = depthGrid(islands), texels = columns * rows;
  const layout = latticeLayout(bake.lattice!, islands, PACK_REACH);
  const parts: [string, Uint8Array, number][] = [];
  // The texels, a plane at a time, each as the better of its predictions says.
  const planes: PackHeader['planes'] = [];
  for (let c = 0; c < 4; c++) {
    const best = packPlane(Uint8Array.from({ length: texels }, (_, t) => bake.depth![t * 4 + c]), columns, compress);
    planes.push(best.mode);
    parts.push([PLANE_NAMES[c], best.packed, texels]);
  }
  const shoal = bytesOf(bake.shoaling!, Float32Array);
  parts.push(['shoal', compress(shoal), shoal.length]);
  const positions = bake.lattice!.positions;
  const floor = new Float64Array(layout.floor);
  for (let v = 0; v < layout.floor; v++) floor[v] = positions[v * 3 + 1];
  parts.push(['floor', compress(bytesOf(floor, Float64Array)), floor.length * 8]);
  // Each island's heights that are not its table's.
  const blocks: PackHeader['blocks'] = [], overIndex: number[] = [], overY: number[] = [];
  for (const { island, i } of order) {
    const { start, n } = layout.blocks[i], code = codeOf(island)!, table = tables.get(`${code}|${level}|${n}`);
    if (!table) throw new Error(`No table for ${code} at level ${level} with ${n} rings`);
    let over = 0, previous = 0;
    for (let v = 0; v < RAYS * n; v++) {
      const y = positions[(start + v) * 3 + 1];
      if (Object.is(y, table.y[v])) continue;
      overIndex.push(v - previous); overY.push(y); previous = v; over++;
    }
    blocks.push({ code, n, over });
  }
  const indexBytes = bytesOf(overIndex, Uint32Array), yBytes = bytesOf(overY, Float64Array);
  parts.push(['overIndex', compress(indexBytes), indexBytes.length], ['overY', compress(yBytes), yBytes.length]);
  const name = oceanPackName(level, islands, PACK_REACH)!;
  const header = { v: VERSION, name, key: seabedBakeKey(level, order.map((o) => o.island), PACK_REACH), level, columns, rows, floor: layout.floor, blocks, planes };
  return writeFile(PACK_MAGIC, header, parts);
}

/**
 * The region maps of a set of islands: a plane for each island's water (its channel in the maps as the islands are listed in `source`). They do not
 * depend on the level, so one file serves every level, and they come back to any order of the islands by moving channels (every order of every
 * set is checked); reading them costs less than working them out from the formula (regionFiller in seabed-depth.ts, which makes the same numbers).
 */
export function encodeOceanRegions(source: PackSource, compress: Compress) {
  const { islands, bake } = source, { columns, rows } = depthGrid(islands), texels = columns * rows;
  const waters = habitatsOf(islands), order = chainOrder(islands), parts: [string, Uint8Array, number][] = [], planes: PlaneMode[] = [];
  if (waters.length !== islands.length) throw new Error('Two islands share a water');
  for (const island of order) {
    const slot = waters.indexOf(island.habitat), map = slot < 4 ? bake.region! : bake.regionMore!;
    const best = packPlane(Uint8Array.from({ length: texels }, (_, t) => map[t * 4 + (slot & 3)]), columns, compress);
    planes.push(best.mode);
    parts.push([`rg${codeOf(island)}`, best.packed, texels]);
  }
  return writeFile(REGIONS_MAGIC, { v: VERSION, name: oceanRegionsName(islands)!, columns, rows, codes: order.map(codeOf).join(''), planes }, parts);
}

/**
 * The ocean a pack holds, for these islands (in whatever order they are listed in) at this level, as the computation gives it: in steps (slices.ts), a
 * texel plane, a few rows of the region maps, the lattice's pieces at a time. `tables` are the tables of the pack's islands by code.
 */
export function* unpackOcean(pack: OceanPack, tables: ReadonlyMap<string, OceanTable>, regions: OceanRegions | undefined, level: number, islands: readonly OceanIsland[], reach: WaterExtent): Steps<SeabedBake> {
  const { header } = pack;
  if (header.name !== oceanPackName(level, islands, reach)) throw new Error(`Ocean pack ${header.name} is not for these islands at level ${level}`);
  const { columns, rows } = depthGrid(islands);
  if (columns !== header.columns || rows !== header.rows) throw new Error('Ocean pack is for another map');
  const texels = columns * rows;
  // The texels: each plane undone and set among the others.
  const depth = new Uint8Array(texels * 4);
  for (let c = 0; c < 4; c++) { unpackPlane(pack.section(PLANE_NAMES[c]), header.planes[c], columns, rows, depth, 4, c); yield; }
  // The region maps: each island's water to its channel, as these islands are listed; or, with no file of them, from the formula.
  const region = new Uint8Array(texels * 4), regionMore = new Uint8Array(texels * 4);
  if (regions) {
    if (regions.header.name !== oceanRegionsName(islands) || regions.header.columns !== columns || regions.header.rows !== rows) throw new Error('Ocean regions are for other islands');
    const waters = habitatsOf(islands);
    for (let b = 0; b < regions.header.codes.length; b++) {
      const code = regions.header.codes[b], island = islands.find((i) => codeOf(i) === code)!, slot = waters.indexOf(island.habitat);
      unpackPlane(regions.section(`rg${code}`), regions.header.planes[b], columns, rows, slot < 4 ? region : regionMore, 4, slot & 3);
      yield;
    }
  } else {
    const fill = regionFiller(islands, region, regionMore);
    for (let j = 0; j < rows; j += 24) { fill(j, Math.min(rows, j + 24)); yield; }
  }
  const shoaling = f32(pack.section('shoal'));
  yield;
  // The lattice: the open sea's floor as it is, and each island's block (its table's heights, less the few this set changes).
  const floor = f64(pack.section('floor')), overIndex = u32(pack.section('overIndex')), overY = f64(pack.section('overY'));
  const heights = new Map<string, { n: number; y: Float64Array }>();
  let at = 0;
  for (const block of header.blocks) {
    const table = tables.get(block.code);
    if (!table || table.header.level !== level) throw new Error(`No table for ${block.code} at level ${level}`);
    const variant = table.header.variants.find((v) => v.n === block.n);
    if (!variant) throw new Error(`Table ${block.code} has no ${block.n} rings`);
    const y = Float64Array.from(f64(table.section(`y${block.n}`)));
    for (let k = 0, v = 0; k < block.over; k++, at++) { v += overIndex[at]; y[v] = overY[at]; }
    heights.set(block.code, { n: block.n, y });
    yield;
  }
  const code = (which: number) => codeOf(islands[which])!;
  const known: LatticeKnown = {
    floor,
    // The Coral Reef's rays are dear to find: its block comes whole.
    block: (which) => {
      if (code(which) !== 'r') return undefined;
      const mine = heights.get('r')!, xz = f64(tables.get('r')!.section(`xz${mine.n}`)), vertices = new Float64Array(mine.y.length * 3);
      for (let v = 0; v < mine.y.length; v++) { vertices[v * 3] = xz[v * 2]; vertices[v * 3 + 1] = mine.y[v]; vertices[v * 3 + 2] = xz[v * 2 + 1]; }
      return { n: mine.n, vertices };
    },
    heights: (which) => heights.get(code(which))?.y,
  };
  const source: LatticeSource = {
    islands, shores: islands.map((island) => shorePolygons(level, 24, shapeFor(island.habitat))[0]), bank: {}, profile: () => ({ floor: 0 }),
  };
  const lattice = yield* seabedLatticeSteps(source, level, reach, known);
  return { lattice, depth, region, regionMore, shoaling };
}
