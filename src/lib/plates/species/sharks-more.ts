/**
 * Five more sharks: the epaulette and brownbanded bamboo sharks (small, slender bottom-dwellers
 * with long low tails), the blue shark, the silvertip, and the angelshark (drawn from above).
 */
import { add, blob, ellipse, type Pt, spline } from '../kit';
import { bar, between, edgeBand, scatter, scatterIn } from '../marks';
import type { PlateDef } from '../registry';
import { type CaudalSpec, requiem, shark, type SharkSpec, variant, bodyShape } from '../shark';
import { atX, finTip, lineAlong, tAtX } from '../side';
import { topShark, type TopSharkSpec } from '../topshark';
import type { Fill, Line } from '../types';

/** A long low tail with hardly any lower lobe, as the carpet-shark relatives have. */
const lowTail = (upperY: number, lowerX: number, lowerY: number): CaudalSpec => ({
  upper: [100, upperY],
  lower: [lowerX, lowerY],
  fork: [lowerX + (100 - lowerX) * 0.72, upperY * 0.05 + 0.2],
  notch: 0,
  upperBow: 0.02,
  lowerBow: 0.1,
  trail: 0.1,
  lowerTrail: 0.02,
  lowerRound: 3.4,
});

// ── Epaulette shark ──────────────────────────────────────────────────────────
// Slender, tan, with widely spaced dark leopard spots; a big black false eye ringed in pale on
// the shoulder above the pectoral fin; two rounded, equal dorsals far back on a long low tail
// with almost no lower lobe; paddle-shaped pectorals it walks on; small barbelled mouth.
const epaulette: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 74, depth: 13, at: 20, riseTop: 2.6, riseBot: 2.4, pedH: 4.4, up: 0.54, taper: 1.1, nose: 0.8 }),
  blunt: 1,
  eye: { x: 4.4, f: 0.34, r: 0.5, iris: '#6B5A3C' },
  gills: { n: 5, x: 11, step: 1.1, f0: 0.4, f1: 0.66 },
  d1: { at: 49, base: 7, h: 5.6, sweep: 0.5, rear: 1.4, round: 2, convex: 0.1, concave: 0.02 },
  d2: { at: 62, base: 6.4, h: 5, sweep: 0.5, rear: 1.2, round: 1.8, convex: 0.1, concave: 0.02 },
  anal: { at: 66, base: 4, h: 2.6, sweep: 0.5, rear: 1, round: 1 },
  pelvic: { at: 40, base: 5, h: 4, sweep: 0.5, rear: 1.2, round: 1.6 },
  pec: { at: [14.5, 0.74], base: 5.2, len: 11, angle: 44, width: 0.6, convex: 0.12, concave: 0, round: 3.2, rear: 0.05 },
  caudal: lowTail(-7, 77, 6.4),
  mouth: [
    [1.8, 0.9],
    [3.2, 0.92],
  ],
  belly: 0.74,
  extra: (c) => {
    const s = c.s;
    const spots = scatter(s, { t0: tAtX(s, 4), t1: 0.99, f0: 0.04, f1: 0.66, r: (t) => 0.5 + 0.35 * Math.sin(t * 40) ** 2, gap: 1.5, paint: 'pattern', rand: c.rand, tries: 900, o: 0.92 });
    // The false eye: a black disc with a pale ring, just behind the gills over the pectoral fin.
    const centre = atX(s, 21.5, 0.3);
    const ring: Fill = { poly: ellipse(centre, 2.7, 2.4), paint: 'light', o: 0.95 };
    const disc: Fill = { poly: ellipse(centre, 1.95, 1.65), paint: 'ink', o: 1 };
    const finSpots = (poly: Pt[]) => scatterIn(poly, { r: 0.55, gap: 1.5, paint: 'pattern', rand: c.rand, tries: 160, o: 0.9 });
    const barbel: Line = { pts: spline([atX(s, 1.7, 0.9), atX(s, 2.2, 1.02), add(atX(s, 2.4, 1), [0.1, 0.9])], false), w: 1.2 };
    return {
      marks: [...spots, ring, disc],
      lines: [barbel],
      median: [
        { fin: 'd1', marks: finSpots(c.d1!.poly) },
        { fin: 'd2', marks: finSpots(c.d2!.poly) },
        { fin: 'caudal', marks: scatterIn(c.caudal.poly, { r: 0.6, gap: 2.2, paint: 'pattern', rand: c.rand, tries: 160, o: 0.9 }) },
        { fin: 'pec', marks: finSpots(c.pec.poly) },
      ],
    };
  },
});

// ── Brownbanded bamboo shark (young) ─────────────────────────────────────────
// Slender and long-tailed; broad dark brown saddles over a pale tan ground, crossing the back and
// tail (no spots, no false eye); a ridge along the back and each flank; two equal rounded dorsals
// far back; nasal barbels; small mouth near the snout tip.
const bamboo: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 74, depth: 12, at: 19, riseTop: 2.6, riseBot: 2.4, pedH: 4, up: 0.54, taper: 1.1, nose: 0.78 }),
  blunt: 0.9,
  eye: { x: 4.6, f: 0.32, r: 0.5 },
  gills: { n: 5, x: 11, step: 1.05, f0: 0.4, f1: 0.66 },
  d1: { at: 51, base: 7.2, h: 5.2, sweep: 0.5, rear: 1.2, round: 1.8, convex: 0.1, concave: 0.04 },
  d2: { at: 63, base: 6.2, h: 4.6, sweep: 0.5, rear: 1.1, round: 1.6, convex: 0.1, concave: 0.04 },
  anal: { at: 67.5, base: 4, h: 2.6, sweep: 0.5, rear: 1, round: 1 },
  pelvic: { at: 41, base: 5, h: 3.6, sweep: 0.5, rear: 1.2, round: 1.4 },
  pec: { at: [14.5, 0.74], base: 5, len: 10, angle: 44, width: 0.6, convex: 0.12, concave: 0, round: 3, rear: 0.05 },
  caudal: lowTail(-6, 78, 5.6),
  mouth: [
    [1.6, 0.9],
    [3, 0.92],
  ],
  belly: 0.78,
  extra: (c) => {
    const s = c.s;
    const bands: Fill[] = [];
    // Saddles: wide at the back, tapering down the flank, leaning back a little.
    const xs = [10.5, 17, 25, 33, 41, 49, 57, 65];
    xs.forEach((x, i) => {
      bands.push(bar(s, tAtX(s, x), 0.052, 0.0, 0.78 - (i % 2) * 0.08, 'pattern', c.rand, 0.95, 0.012));
    });
    // The head is plain, with a dark smudge across the brow.
    bands.push(bar(s, tAtX(s, 6.2), 0.04, 0.02, 0.3, 'pattern', c.rand, 0.8));
    const tailBars = [74, 81, 88].map((x): Fill => ({ poly: [[x, -6], [x + 2.6, -6], [x + 3.4, 3], [x + 0.8, 3]], paint: 'pattern', o: 0.9 }));
    const ridges = [0.05, 0.36].map((f): Line => ({ pts: lineAlong(s, f, tAtX(s, 12), tAtX(s, 56)), w: 0.8, detail: true }));
    const barbel: Line = { pts: spline([atX(s, 1.7, 0.9), atX(s, 2.2, 1.02), add(atX(s, 2.4, 1), [0.1, 0.9])], false), w: 1.1 };
    return {
      marks: bands,
      lines: [...ridges, barbel],
      median: [
        { fin: 'd1', marks: [{ poly: [[52, -8], [57, -8], [58, 1], [53, 1]], paint: 'pattern', o: 0.5, clip: undefined } as Fill] },
        { fin: 'caudal', marks: tailBars },
      ],
    };
  },
});

// ── Blue shark ───────────────────────────────────────────────────────────────
// Very slim, torpedo body with a long cone snout and huge dark eye; extremely long, narrow,
// scythe-like pectorals; small first dorsal set well back; bright indigo back that cuts sharply
// to a white belly; upper tail lobe much longer than the lower; no ridge between the dorsals.
const blue: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 76, depth: 11, at: 28, riseTop: 2.1, riseBot: 1.9, pedH: 3.6, taper: 1.15, nose: 0 }),
  blunt: 0.18,
  eye: { x: 6.2, f: 0.38, r: 1.35 },
  gills: { n: 5, x: 15, step: 1.3, f0: 0.3, f1: 0.74 },
  d1: { at: 36.5, base: 6.4, h: 6.4, sweep: 0.58, rear: 2.2, round: 0.6, convex: 0.06, concave: 0.12 },
  d2: { at: 61.5, base: 2.4, h: 1.9, sweep: 0.5, rear: 1.8, rearLift: 0.4, concave: 0.1 },
  anal: { at: 61, base: 3.6, h: 2.8, sweep: 0.5, rear: 2, concave: 0.14 },
  pelvic: { at: 47, base: 3.4, h: 3.2, sweep: 0.5, rear: 2, round: 0.8 },
  pec: { at: [20.5, 0.72], base: 4.6, len: 30, angle: 52, width: 0.2, convex: 0.07, concave: 0.1, round: 0.6, rear: 0.05 },
  caudal: { upper: [100, -20], lower: [86, 10.8], fork: [85, 0.9], notch: 2.6, upperBow: 0.04, lowerBow: 0.14, trail: 0.05 },
  mouth: [
    [4.8, 0.96],
    [8, 0.92],
    [11, 0.86],
  ],
  belly: 0.56,
  softBelly: false,
  extra: (c) => ({
    median: [{ fin: 'pec', marks: [finTip(c.pec, 0.82, 'dark', 0.45)] }],
  }),
});

// ── Silvertip shark ──────────────────────────────────────────────────────────
// Robust grey-bronze reef-edge shark; every fin edged in brilliant white: the tips of both
// dorsals, the pectorals, the pelvics and anal, and both tail lobes; the first dorsal has a
// white rear edge too; a faint pale stripe along the flank; no black anywhere.
const silvertip: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 74, depth: 17.5, at: 31, riseTop: 2.4, riseBot: 2, pedH: 5.2, nose: 0.3 }),
  blunt: 0.6,
  eye: { x: 7, f: 0.36, r: 1 },
  d1: { at: 30.5, base: 10, h: 10.5, sweep: 0.64, rear: 3.2, round: 0.7, concave: 0.13 },
  d2: { at: 60.5, base: 3.4, h: 3.2, rear: 3 },
  anal: { at: 61.5, base: 3.4, h: 3.3, rear: 3 },
  pec: { at: [21, 0.72], base: 5.6, len: 20, angle: 45, width: 0.33, concave: 0.15, round: 0.5 },
  caudal: { upper: [100, -17.2], lower: [86.5, 11.8], fork: [84.8, 1.6], notch: 3.6 },
  extra: (c) => {
    const s = c.s;
    const white = (f: { poly: Pt[]; le: Pt[]; te: Pt[] }, from: number): Fill => finTip(f, from, 'light', 1);
    const rim = (outline: Pt[], a: Pt, b: Pt, w: number): Fill => {
      const idx = (p: Pt) => outline.reduce((bi, q, i) => (Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(outline[bi][0] - p[0], outline[bi][1] - p[1]) ? i : bi), 0);
      const i0 = Math.min(idx(a), idx(b));
      const i1 = Math.max(idx(a), idx(b));
      return edgeBand(outline, i0 / (outline.length - 1), i1 / (outline.length - 1), w, 'light', 1, 1);
    };
    const flank: Fill = { poly: spline([atX(s, 24, 0.5), atX(s, 40, 0.5), atX(s, 58, 0.52), atX(s, 58, 0.58), atX(s, 40, 0.56), atX(s, 24, 0.55)], true), paint: 'light', o: 0.35, clip: 'trunk' };
    return {
      marks: [flank],
      median: [
        { fin: 'd1', marks: [white(c.d1!, 0.62), rim(c.d1!.outline, c.d1!.apex, c.d1!.outline[c.d1!.outline.length - 1], 1.2)] },
        { fin: 'd2', marks: [white(c.d2!, 0.4)] },
        { fin: 'anal', marks: [white(c.anal!, 0.4)] },
        { fin: 'pelvic', marks: [white(c.pelvic!, 0.5)] },
        { fin: 'pec', marks: [white(c.pec, 0.74), rim(c.pec.outline, c.pec.apex, c.pec.outline[c.pec.outline.length - 1], 1)] },
        { fin: 'caudal', marks: [white(c.caudal, 0.62), white(c.caudal.lower, 0.55), edgeBand(c.caudal.outline, ...between(c.caudal.outline, c.caudal.apex, c.caudal.lower.apex), (t) => 2.1 * Math.sin(Math.PI * Math.min(1, t / 0.9)) ** 0.6, 'light', 1, 0.95)] },
      ],
    };
  },
});

// ── Angelshark ───────────────────────────────────────────────────────────────
// Seen from above: a flattened, ray-like shark with a broad rounded head, eyes and spiracles on
// top, huge wing-like pectorals whose front lobes stand out beside the head, big pelvics, then a
// slim shark tail with two small dorsals and a lower lobe longer than the upper; sandy grey-brown
// with dark flecks and pale spots; a row of small thorns down the middle of the back.
const halfWidths = (half: [number, number][]) => half.map(([x, w]) => [x, w] as [number, number]);
const BODY = halfWidths([
  [0.6, 4],
  [2, 6.4],
  [5, 8.4],
  [9, 9.4],
  [14, 9.8],
  [22, 9.4],
  [30, 8.4],
  [38, 7],
  [46, 5.4],
  [54, 3.8],
  [62, 2.8],
  [70, 2.2],
  [76, 1.8],
]);
const angel: TopSharkSpec = {
  tip: [0, 0],
  blunt: 1,
  top: BODY.map(([x, w]) => [x, -w] as [number, number]),
  bot: BODY,
  pec: { at: 14, base: 31, h: 16, sweep: 0.3, rear: 0, convex: 0.14, concave: 0.0, round: 9 },
  pelvic: { at: 45, base: 14, h: 8.4, sweep: 0.45, rear: 1.4, convex: 0.1, concave: 0.0, round: 3.4 },
  d1: { at: 64, base: 5.4, h: 4.2, sweep: 0.5, rear: 1.2, round: 1.2, convex: 0.1, concave: 0.04 },
  d2: { at: 72, base: 4.6, h: 3.6, sweep: 0.5, rear: 1, round: 1, convex: 0.1, concave: 0.04 },
  caudal: { upper: [100, -5.4], lower: [92, 8.6], fork: [95, 1.6], notch: 0, upperBow: 0.02, lowerBow: 0.06, trail: 0.03, lowerTrail: 0.06, lowerRound: 2.4 },
  eyes: [
    [9.4, -4.6],
    [9.4, 4.6],
  ],
  eyeR: 0.85,
  rings: { top: [0.04, 0.09], bot: [0.9, 0.96] },
  extra: (c) => {
    const s = c.s;
    const flecks = scatter(s, { t0: 0.03, t1: 0.97, f0: 0.04, f1: 0.96, r: 0.5, gap: 1.2, paint: 'dark', rand: c.rand, tries: 500, o: 0.6 });
    const pale = scatter(s, { t0: 0.03, t1: 0.97, f0: 0.04, f1: 0.96, r: 0.38, gap: 1.6, paint: 'light', rand: c.rand, tries: 300, o: 0.7 });
    const finMarks = [...c.pecs, ...c.pelvics].flatMap((f) => [
      ...scatterIn(f.poly, { r: 0.55, gap: 1.5, paint: 'dark', rand: c.rand, tries: 260, o: 0.55 }),
      ...scatterIn(f.poly, { r: 0.4, gap: 1.8, paint: 'light', rand: c.rand, tries: 200, o: 0.7 }),
    ]);
    const thorns: Fill[] = [];
    for (let x = 10; x < 62; x += 4.6) thorns.push({ poly: ellipse(atX(s, x, 0.5), 0.45, 0.35), paint: 'light', o: 0.9 });
    // Mouth across the very front of the head, nasal flaps either side of it.
    const mouth: Line = { pts: spline([[1.6, -3.2], [2.6, -1.2], [2.8, 0], [2.6, 1.2], [1.6, 3.2]], false), w: 1.3 };
    const flaps: Fill[] = [-1, 1].map((k) => ({ poly: ellipse([1.4, k * 1.9], 0.7, 0.35, 0), paint: 'light', o: 0.9, edge: 0.5 }));
    const spiracles: Fill[] = [-1, 1].map((k) => ({ poly: blob([13, k * 5.4], 0.75, 0.15, c.rand, 8, 1.6), paint: 'ink', o: 0.75 }));
    return {
      marks: [...flecks, ...pale, ...finMarks.map((f) => ({ ...f, clip: 'body' as const })), ...thorns, ...flaps, ...spiracles],
      lines: [mouth],
    };
  },
};

const SPECS: Record<string, { spec: SharkSpec; palette: PlateDef['palette']; seed: number }> = {
  'epaulette-shark': { spec: epaulette, palette: { back: '#C9AE80', belly: '#EBDFC4', pattern: '#3C2B1C' }, seed: 41 },
  'brownbanded-bamboo-shark': { spec: bamboo, palette: { back: '#C2AA84', belly: '#E8DCC2', pattern: '#5A3E26' }, seed: 43 },
  'blue-shark': { spec: blue, palette: { back: '#2B4C8C', belly: '#F4F5F2' }, seed: 47 },
  'silvertip-shark': { spec: silvertip, palette: { back: '#7C746A', belly: '#F2F0EA', dark: '#3D3A36' }, seed: 53 },
};

export const MORE_SHARKS: Record<string, PlateDef> = {
  ...Object.fromEntries(Object.entries(SPECS).map(([id, { spec, palette, seed }]) => [id, { build: () => shark({ ...spec, seed }), palette }])),
  angelshark: { build: () => topShark({ ...angel, seed: 17 }), palette: { back: '#A39A78', belly: '#E4DCC4', fin: '#A39A78', dark: '#4A402C' } },
};
