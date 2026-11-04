import { inflate } from './inflate';
import { digestBytes } from './seabed-bake';

/**
 * Meshes shipped with the app: a coast, a forest or a reef's corals worked out ahead of time by the very code that makes them on the phone
 * (scripts/bake-meshes.ts), written as small deflated files (assets/baked/mesh) and read back by `decodeMesh` in place of working them out. This is the
 * pure part, numbers and bytes with no three.js in it (mesh-geometry.ts makes a BufferGeometry of them); the file holds exactly the bits the builder made.
 *
 * What a mesh is here: a flat list of vertices (three to a triangle, nothing shared), each attribute (position, color, ...) an array of `itemSize` floats a
 * vertex. A mesh is shrunk in ways that give back the very same bits, and the bake refuses to write one that does not:
 *  - an attribute that is all zero (uv, mostly) is not stored;
 *  - normals that three.js's `computeVertexNormals` makes of the positions (the flat shading of every coast) are not stored: the reader makes them
 *    (`flatNormals`, the same sums and roots, so the same bits);
 *  - any other attribute is stored as its distinct tuples (a vertex shared by the corners of several triangles, a colour a whole face has) in the order they
 *    first occur, and for each vertex how far back that tuple was met (0: a new one), as a byte or two. Both go in chunks of a few thousand vertices, each
 *    deflated by itself, so the reader can inflate them a step at a time and a damaged chunk is found. The tuples are laid out as they compress best: by
 *    component or by tuple, as they are or in byte planes.
 *
 * A file: 'SGMS', a version, the length of a JSON header, the header, then each section deflated and starting on a multiple of 8 bytes. The header names the
 * key the mesh is for (geometry-cache.ts's) and a digest of everything after it, so that a file cut short, damaged or for another mesh is told.
 */
const MAGIC = 0x534d4753; // 'SGMS'
const VERSION = 1;
const NO_DIGEST = '0'.repeat(16);

export type MeshAttribute = { name: string; itemSize: number; array: Float32Array };
export type MeshData = {
  vertices: number;
  attributes: MeshAttribute[];
  /** The bounding sphere the builder left on it (centre x, y, z and radius), or none (three.js works it out when it is first drawn). */
  sphere: readonly [number, number, number, number] | null;
};
export type ReadMesh = MeshData;

type Layout = 'raw' | 'sh4' | 'sp';
type Section = { offset: number; length: number; size: number };
type Chunk = { slots: number; fresh: number; pool: string; steps: string };
type AttributeHeader =
  | { name: string; itemSize: number; how: 'zero' }
  | { name: string; itemSize: number; how: 'normals' }
  | { name: string; itemSize: number; how: 'tuples'; layout: Layout; planar: boolean; unique: number; chunks: Chunk[] };
type Header = { v: number; key: string; vertices: number; sphere: MeshData['sphere']; attributes: AttributeHeader[]; sections: Record<string, Section>; check: string };

/** Vertices to a chunk: a step of reading is about this much work (a few milliseconds on a phone's interpreter). */
export const CHUNK_SLOTS = 8192;
export type Compress = (bytes: Uint8Array) => Uint8Array;

// (the numbers are laid out as this machine lays out a Float32Array: every phone and computer that runs the app is little-endian)
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

const bitsOf = (array: Float32Array) => new Uint32Array(array.buffer, array.byteOffset, array.length);

/* ------------------------------------------------------------------------------------------------------------------------ layouts */

/** Four words' worth of bytes for each float by plane: all first bytes, all second bytes... */
function shuffleBytes(words: Uint32Array) {
  const n = words.length, out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) { const w = words[i]; out[i] = w & 255; out[n + i] = (w >>> 8) & 255; out[2 * n + i] = (w >>> 16) & 255; out[3 * n + i] = w >>> 24; }
  return out;
}
/** The two top bytes of each float as planes, then the two low bytes together. */
function splitBytes(words: Uint32Array) {
  const n = words.length, out = new Uint8Array(n * 4), low = new Uint16Array(out.buffer, 2 * n, n);
  for (let i = 0; i < n; i++) { const w = words[i]; out[i] = w >>> 24; out[n + i] = (w >>> 16) & 255; low[i] = w & 65535; }
  return out;
}
/** `count` floats from bytes laid out as `layout`; the words are those of the bytes themselves where the layout is 'raw'. */
function unlay(bytes: Uint8Array, count: number, layout: Layout): Uint32Array {
  if (bytes.length !== count * 4) throw new Error('mesh pack: a section is not the size it should be');
  if (layout === 'raw') return new Uint32Array(bytes.buffer, bytes.byteOffset, count);
  const out = new Uint32Array(count);
  if (layout === 'sh4') {
    const n = count;
    for (let i = 0; i < n; i++) out[i] = (bytes[i] | (bytes[n + i] << 8) | (bytes[2 * n + i] << 16) | (bytes[3 * n + i] << 24)) >>> 0;
  } else {
    const n = count, low = new Uint16Array(bytes.buffer, bytes.byteOffset + 2 * n, n);
    for (let i = 0; i < n; i++) out[i] = ((bytes[i] << 24) | (bytes[n + i] << 16) | low[i]) >>> 0;
  }
  return out;
}
const layoutBytes = (words: Uint32Array, layout: Layout) => (layout === 'raw' ? new Uint8Array(words.buffer.slice(words.byteOffset, words.byteOffset + words.byteLength)) : layout === 'sh4' ? shuffleBytes(words) : splitBytes(words));

/**
 * The normals three.js's `computeVertexNormals` gives a geometry of separate triangles (three vertices to a triangle, nothing shared): each triangle's
 * (c - b) x (a - b), kept as a float, then scaled to length 1 (1 over its length, as `Vector3.normalize` does, or itself if it has none). The same operations in the
 * same order on the same numbers, so the same bits, but a triangle's is worked out once for its three vertices and without the vectors.
 */
export function flatNormals(positions: Float32Array): Float32Array {
  const normals = new Float32Array(positions.length), fround = Math.fround;
  for (let v = 0; v < positions.length; v += 9) {
    const ax = positions[v], ay = positions[v + 1], az = positions[v + 2], bx = positions[v + 3], by = positions[v + 4], bz = positions[v + 5];
    const cbx = positions[v + 6] - bx, cby = positions[v + 7] - by, cbz = positions[v + 8] - bz, abx = ax - bx, aby = ay - by, abz = az - bz;
    // (stored as floats, then read back to be scaled, as the attribute does)
    const x = fround(cby * abz - cbz * aby), y = fround(cbz * abx - cbx * abz), z = fround(cbx * aby - cby * abx);
    const scale = 1 / (Math.sqrt(x * x + y * y + z * z) || 1), nx = x * scale, ny = y * scale, nz = z * scale;
    normals[v] = nx; normals[v + 1] = ny; normals[v + 2] = nz;
    normals[v + 3] = nx; normals[v + 4] = ny; normals[v + 5] = nz;
    normals[v + 6] = nx; normals[v + 7] = ny; normals[v + 8] = nz;
  }
  return normals;
}

/* ------------------------------------------------------------------------------------------------------------------------ writing */

const addSection = (parts: Map<string, { bytes: Uint8Array; size: number }>, name: string, plain: Uint8Array, compress: Compress) => {
  parts.set(name, { bytes: compress(plain), size: plain.length });
};

/** A chunk's `steps`: how far back each of its vertices' tuples was first met, as the count of new tuples met since (0: this one is new), a byte for less than 128. */
function varints(values: number[]) {
  const out: number[] = [];
  for (let v of values) { while (v >= 128) { out.push((v & 127) | 128); v = Math.floor(v / 128); } out.push(v); }
  return Uint8Array.from(out);
}

function encodeTuples(name: string, itemSize: number, array: Float32Array, vertices: number, layout: Layout, planar: boolean, compress: Compress, parts: Map<string, { bytes: Uint8Array; size: number }>): AttributeHeader {
  const bits = bitsOf(array), seen = new Map<string, number>(), fresh: number[] = [], chunks: Chunk[] = [];
  let counter = 0, freshFrom = 0;
  for (let from = 0; from < vertices; from += CHUNK_SLOTS) {
    const to = Math.min(vertices, from + CHUNK_SLOTS), steps: number[] = [];
    for (let j = from; j < to; j++) {
      let key = '';
      for (let k = 0; k < itemSize; k++) key += bits[j * itemSize + k] + ',';
      const found = seen.get(key);
      if (found === undefined) {
        seen.set(key, counter);
        for (let k = 0; k < itemSize; k++) fresh.push(bits[j * itemSize + k]);
        steps.push(0); counter++;
      } else steps.push(counter - found);
    }
    const count = counter - freshFrom, block = new Uint32Array(count * itemSize);
    for (let i = 0; i < count; i++) for (let k = 0; k < itemSize; k++) block[planar ? k * count + i : i * itemSize + k] = fresh[(freshFrom + i) * itemSize + k];
    const c = chunks.length;
    addSection(parts, `${name}.${c}.p`, layoutBytes(block, layout), compress);
    addSection(parts, `${name}.${c}.s`, varints(steps), compress);
    chunks.push({ slots: to - from, fresh: count, pool: `${name}.${c}.p`, steps: `${name}.${c}.s` });
    freshFrom = counter;
  }
  return { name, itemSize, how: 'tuples', layout, planar, unique: counter, chunks };
}

/**
 * A mesh as a file. `derived` names the attributes the reader will make itself (the caller has checked they come out the same: 'normal' only). Every way of
 * laying out each attribute is tried and the smallest kept; nothing here decides whether the result gives back the mesh (see `sameMesh`).
 */
export function encodeMesh(key: string, mesh: MeshData, derived: readonly string[], compress: Compress): Uint8Array {
  if (!LITTLE_ENDIAN) throw new Error('mesh pack: big-endian machine');
  const parts = new Map<string, { bytes: Uint8Array; size: number }>(), attributes: AttributeHeader[] = [];
  for (const { name, itemSize, array } of mesh.attributes) {
    if (array.length !== mesh.vertices * itemSize) throw new Error(`mesh pack: ${name} has ${array.length} numbers for ${mesh.vertices} vertices of ${itemSize}`);
    if (array.every((value) => Object.is(value, 0))) { attributes.push({ name, itemSize, how: 'zero' }); continue; }
    if (derived.includes(name)) {
      if (name !== 'normal') throw new Error(`mesh pack: ${name} cannot be derived`);
      attributes.push({ name, itemSize, how: 'normals' });
      continue;
    }
    let best: { header: AttributeHeader; added: Map<string, { bytes: Uint8Array; size: number }>; total: number } | undefined;
    for (const layout of ['sh4', 'sp', 'raw'] as const) {
      for (const planar of [false, true]) {
        const added = new Map<string, { bytes: Uint8Array; size: number }>();
        const header = encodeTuples(name, itemSize, array, mesh.vertices, layout, planar, compress, added);
        let total = 0;
        for (const { bytes } of added.values()) total += bytes.length;
        if (!best || total < best.total) best = { header, added, total };
      }
    }
    for (const [section, part] of best!.added) parts.set(section, part);
    attributes.push(best!.header);
  }
  const sections: Record<string, Section> = {};
  let offset = 0;
  for (const [name, { bytes, size }] of parts) { sections[name] = { offset, length: bytes.length, size }; offset += Math.ceil(bytes.length / 8) * 8; }
  const header: Header = { v: VERSION, key, vertices: mesh.vertices, sphere: mesh.sphere, attributes, sections, check: NO_DIGEST };
  const json = JSON.stringify(header), start = Math.ceil((12 + json.length) / 8) * 8;
  const out = new Uint8Array(start + offset), view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true); view.setUint32(4, VERSION, true); view.setUint32(8, json.length, true);
  for (let i = 0; i < json.length; i++) out[12 + i] = json.charCodeAt(i);
  for (const [name, { bytes }] of parts) out.set(bytes, start + sections[name].offset);
  const digest = digestBytes(out, start), at = 12 + json.indexOf(`"check":"${NO_DIGEST}`) + 9;
  for (let i = 0; i < digest.length; i++) out[at + i] = digest.charCodeAt(i);
  return out;
}

/* ------------------------------------------------------------------------------------------------------------------------ reading */

export type MeshPack = { header: Header; section(name: string): Uint8Array };

/** A pack from its bytes; `key`, if given, is the one it must be for. Throws on anything else, a file cut short or damaged included. */
export function readMeshPack(source: ArrayBuffer | Uint8Array, key?: string): MeshPack {
  if (!LITTLE_ENDIAN) throw new Error('mesh pack: big-endian machine');
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || view.getUint32(0, true) !== MAGIC) throw new Error('Not a mesh pack');
  if (view.getUint32(4, true) !== VERSION) throw new Error(`Mesh pack version ${view.getUint32(4, true)}, not ${VERSION}`);
  const length = view.getUint32(8, true);
  if (12 + length > bytes.byteLength) throw new Error('Mesh pack cut short');
  let json = '';
  for (let i = 0; i < length; i++) json += String.fromCharCode(bytes[12 + i]);
  const header = JSON.parse(json) as Header, start = Math.ceil((12 + length) / 8) * 8;
  if (header.check !== digestBytes(bytes, start)) throw new Error('Mesh pack damaged or cut short');
  if (key !== undefined && header.key !== key) throw new Error(`Mesh pack is for ${header.key}, not ${key}`);
  /** A section, inflated (a copy of its own, so that it can be viewed as numbers). */
  const section = (name: string) => {
    const s = header.sections[name];
    if (!s) throw new Error(`Mesh pack has no section ${name}`);
    if (start + s.offset + s.length > bytes.byteLength) throw new Error(`Mesh pack section ${name} runs past the file`);
    return inflate(bytes.subarray(start + s.offset, start + s.offset + s.length), s.size);
  };
  return { header, section };
}

/**
 * The mesh a pack holds, a step at a time: one for each chunk of each attribute, so a caller that wants the screen drawn between them (sliced-geometry.ts)
 * has places to stop. The attributes come in the order they were made in.
 */
export function* decodeMesh(pack: MeshPack): Generator<void, ReadMesh, void> {
  const { header } = pack, vertices = header.vertices, attributes: MeshAttribute[] = [];
  const derived: number[] = [];
  for (const a of header.attributes) {
    const { name, itemSize } = a;
    if (a.how === 'zero') { attributes.push({ name, itemSize, array: new Float32Array(vertices * itemSize) }); continue; }
    if (a.how === 'normals') { derived.push(attributes.length); attributes.push({ name, itemSize, array: new Float32Array(0) }); continue; }
    const array = new Float32Array(vertices * itemSize), out = bitsOf(array), pool = new Uint32Array(a.unique * itemSize);
    let slot = 0, counter = 0;
    for (const chunk of a.chunks) {
      // The tuples met for the first time in these vertices, laid out as the file has them, into the pool.
      const count = chunk.fresh * itemSize, words = unlay(pack.section(chunk.pool), count, a.layout), at = counter * itemSize;
      if (at + count > pool.length) throw new Error('mesh pack: more tuples than the header says');
      if (!a.planar) pool.set(words, at);
      else for (let k = 0; k < itemSize; k++) for (let i = 0; i < chunk.fresh; i++) pool[at + i * itemSize + k] = words[k * chunk.fresh + i];
      // And for each vertex, which tuple it is.
      const steps = pack.section(chunk.steps);
      let p = 0;
      for (let end = slot + chunk.slots; slot < end; slot++) {
        let d = steps[p++];
        if (d >= 128) {
          d &= 127;
          for (let shift = 7, b = 128; b >= 128; shift += 7) { b = steps[p++]; d += (b & 127) * 2 ** shift; }
        }
        const id = d === 0 ? counter++ : counter - d;
        if (id < 0 || id >= counter) throw new Error('mesh pack: a vertex points at a tuple not met yet');
        const from = id * itemSize, to = slot * itemSize;
        if (itemSize === 3) { out[to] = pool[from]; out[to + 1] = pool[from + 1]; out[to + 2] = pool[from + 2]; }
        else if (itemSize === 4) { out[to] = pool[from]; out[to + 1] = pool[from + 1]; out[to + 2] = pool[from + 2]; out[to + 3] = pool[from + 3]; }
        else if (itemSize === 2) { out[to] = pool[from]; out[to + 1] = pool[from + 1]; }
        else for (let k = 0; k < itemSize; k++) out[to + k] = pool[from + k];
      }
      if (p !== steps.length) throw new Error('mesh pack: a chunk has more steps than vertices');
      yield;
    }
    if (slot !== vertices || counter !== a.unique) throw new Error(`mesh pack: ${name} has ${slot} vertices of ${vertices}`);
    attributes.push({ name, itemSize, array });
  }
  // The normals the positions give, last: they need the positions, wherever the file has them.
  for (const n of derived) {
    const position = attributes.find((a) => a.name === 'position');
    if (!position || position.itemSize !== 3 || vertices % 3 !== 0) throw new Error('mesh pack: normals without triangles of positions');
    attributes[n] = { name: attributes[n].name, itemSize: 3, array: flatNormals(position.array) };
    yield;
  }
  return { vertices, attributes, sphere: header.sphere };
}

/** Run a decode to the end. */
export function readMesh(pack: MeshPack): ReadMesh {
  const run = decodeMesh(pack);
  for (;;) {
    const step = run.next();
    if (step.done) return step.value;
  }
}

/* ------------------------------------------------------------------------------------------------------------------------ comparing */

/**
 * Why two meshes are not bit for bit the same, or null when they are: the attributes in the same order and size, every float the same bits (-0 and NaN
 * included), the bounding sphere the same. `read` may hold derived attributes as null, which are `made` by the caller before comparing.
 */
export function meshDifference(got: MeshData, want: MeshData): string | null {
  if (got.vertices !== want.vertices) return `${got.vertices} vertices, not ${want.vertices}`;
  if (got.attributes.length !== want.attributes.length) return `${got.attributes.map((a) => a.name)} attributes, not ${want.attributes.map((a) => a.name)}`;
  for (let n = 0; n < want.attributes.length; n++) {
    const a = got.attributes[n], b = want.attributes[n];
    if (a.name !== b.name || a.itemSize !== b.itemSize || a.array.length !== b.array.length) return `attribute ${n} is ${a.name}/${a.itemSize}/${a.array.length}, not ${b.name}/${b.itemSize}/${b.array.length}`;
    const x = bitsOf(a.array), y = bitsOf(b.array);
    for (let i = 0; i < y.length; i++) if (x[i] !== y[i]) return `${b.name}[${i}] is ${a.array[i]}, not ${b.array[i]}`;
  }
  const s = got.sphere, t = want.sphere;
  if ((s === null) !== (t === null)) return 'the bounding sphere is there in one and not the other';
  if (s && t) for (let i = 0; i < 4; i++) if (!Object.is(s[i], t[i])) return `the bounding sphere's number ${i} is ${s[i]}, not ${t[i]}`;
  return null;
}
