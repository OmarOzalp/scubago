import { expect, test } from '@jest/globals';
import { constants, deflateRawSync } from 'node:zlib';
import { inflate } from '@/lib/inflate';

// The inflate the app reads its shipped packs with (ocean-pack.ts) against node's zlib: every kind of block, and what is not a stream.
const bytes = (n: number, make: (i: number) => number) => Uint8Array.from({ length: n }, (_, i) => make(i) & 255);
let seed = 12345;
const random = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed >>> 8; };
const same = (a: Uint8Array, b: Uint8Array) => { expect(a.length).toBe(b.length); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error(`byte ${i}: ${a[i]} and ${b[i]}`); };

const inputs: [string, Uint8Array][] = [
  ['nothing', new Uint8Array(0)],
  ['one byte', Uint8Array.of(7)],
  ['a run', new Uint8Array(70000).fill(9)],
  ['noise', bytes(50000, () => random())],
  ['a ramp that repeats', bytes(100000, (i) => (i * 7) % 251)],
  ['text', Uint8Array.from(Buffer.from('the sea is the sea is the sea and a seabed under the sea. '.repeat(900)))],
  ['smooth with noise (like a depth map)', bytes(120000, (i) => Math.round(120 + 100 * Math.sin(i / 700) + (random() % 3)))],
];
const levels = [0, 1, 6, 9];

test.each(inputs.flatMap(([name, data]) => levels.map((level) => [name, level, data] as const)))('%s, zlib level %s', (_name, level, data) => {
  const packed = deflateRawSync(Buffer.from(data), { level });
  same(inflate(new Uint8Array(packed), data.length), data);
});

test('fixed-code blocks and a stream of many blocks', () => {
  const data = bytes(3000, (i) => (i % 17) + (random() % 2));
  same(inflate(new Uint8Array(deflateRawSync(Buffer.from(data), { strategy: constants.Z_FIXED })), data.length), data);
  const many = bytes(400000, (i) => (i >> 4) + (random() % 5));
  same(inflate(new Uint8Array(deflateRawSync(Buffer.from(many), { level: 9, memLevel: 1 })), many.length), many);
});

test('works on a view into a larger buffer', () => {
  const data = bytes(9000, (i) => (i * 3) % 41);
  const packed = deflateRawSync(Buffer.from(data));
  const inside = new Uint8Array(packed.length + 20);
  inside.set(packed, 7);
  same(inflate(inside.subarray(7, 7 + packed.length), data.length), data);
});

test('a stream that is cut short, damaged, or not the size said is refused', () => {
  const data = bytes(20000, (i) => (i * 13) % 97);
  const packed = new Uint8Array(deflateRawSync(Buffer.from(data), { level: 9 }));
  expect(() => inflate(packed.subarray(0, packed.length >> 1), data.length)).toThrow();
  expect(() => inflate(packed, data.length - 1)).toThrow();
  expect(() => inflate(packed, data.length + 1)).toThrow();
  expect(() => inflate(Uint8Array.of(7, 7, 7, 7), 10)).toThrow();
  const broken = packed.slice();
  for (let i = 5; i < broken.length; i += 97) broken[i] ^= 0x5a;
  let threw = false, differs = false;
  try { const out = inflate(broken, data.length); differs = out.some((v, i) => v !== data[i]); } catch { threw = true; }
  expect(threw || differs).toBe(true);
});
