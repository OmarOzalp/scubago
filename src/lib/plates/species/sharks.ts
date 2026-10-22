/**
 * The sharks. Each starts from the requiem-shark base and changes what makes it itself; the notes
 * above each one are the field marks it has to show (see docs/species-plates.md).
 */
import { add, clipLine, ellipse, lerp, type Pt, spline } from '../kit';
import { bar, between, edgeBand, patch, scatter, scatterIn, shapeIn } from '../marks';
import { swell } from '../render';
import type { PlateDef } from '../registry';
import { bodyShape, requiem, shark, type SharkCtx, type SharkSpec, variant } from '../shark';
import { at, atX, finTip, lineAlong, ragged, region, tAtX } from '../side';
import type { Fill, Line } from '../types';

const swellPoly = (pts: Pt[], w: number) => swell(pts, w, 'both');
const tipOf = (c: SharkCtx) => c.caudal;
/** The caudal outline's trailing edge, from the upper tip round to the lower tip. */
const trailing = (c: SharkCtx) => between(c.caudal.outline, c.caudal.apex, c.caudal.lower.apex);
/** A line along the back between the dorsal fins (the interdorsal ridge). */
const ridge = (c: SharkCtx): Line[] => {
  if (!c.d2) return [];
  const x0 = c.d1!.outline[c.d1!.outline.length - 1][0] + 2;
  const x1 = c.d2.outline[0][0] - 0.5;
  return [{ pts: lineAlong(c.s, 0.035, tAtX(c.s, x0), tAtX(c.s, x1)), w: 0.9, detail: true }];
};
/** Upper labial furrow: a crease forward and up from the mouth corner. */
const furrow = (c: SharkCtx, from: [number, number], to: [number, number]): Line => ({
  pts: spline([atX(c.s, ...from), atX(c.s, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 0.03), atX(c.s, ...to)], false),
  w: 0.9,
});

// ── Grey reef shark ──────────────────────────────────────────────────────────
// Classic reef-shark profile; the whole trailing edge of the tail in a broad black band; plain
// first dorsal; black-tipped pectorals, pelvics, second dorsal and anal.
const greyReef: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 73.5, depth: 17, at: 31, riseTop: 2.4, riseBot: 2, pedH: 5.2 }),
  blunt: 0.55,
  eye: { x: 7, f: 0.36, r: 1 },
  d1: { at: 31, base: 9.2, h: 10, sweep: 0.66, rear: 3.2, round: 0.8, concave: 0.13 },
  d2: { at: 61, base: 3.2, h: 3.2, rear: 3.2 },
  anal: { at: 61.5, base: 3.4, h: 3.3, rear: 3 },
  pec: { at: [21, 0.72], len: 18, angle: 48, width: 0.33, concave: 0.15, round: 0.5 },
  caudal: { upper: [100, -17], lower: [86.5, 11.5], fork: [84.8, 1.6], notch: 3.6 },
  extra: (c) => {
    const [a, b] = trailing(c);
    return {
      median: [
        // The band thins to nothing at both lobe tips, so it can't hook past the upper one.
        { fin: 'caudal', marks: [edgeBand(c.caudal.outline, a, b, (t) => 3.4 * Math.sin(Math.PI * Math.min(1, t / 0.9)) ** 0.6, 'ink', 1, 0.92)] },
        { fin: 'd2', marks: [finTip(c.d2!, 0.45, 'ink', 0.85)] },
        { fin: 'anal', marks: [finTip(c.anal!, 0.45, 'ink', 0.85)] },
        { fin: 'pelvic', marks: [finTip(c.pelvic!, 0.55, 'ink', 0.7)] },
        { fin: 'pec', marks: [finTip(c.pec, 0.62, 'ink', 0.8)] },
      ],
    };
  },
});

// ── Blacktip reef shark ──────────────────────────────────────────────────────
// Ink-black first-dorsal tip over a white band; black-tipped lower tail lobe; black tips on every
// fin; a pale wedge along the flank; short blunt snout.
const blacktip: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 74, depth: 16, at: 31, riseTop: 2.6, riseBot: 2.1, pedH: 5, nose: 0.47 }),
  blunt: 0.7,
  eye: { x: 6.2, f: 0.36, r: 0.95 },
  d1: { at: 31, base: 8.6, h: 10.5, sweep: 0.62, rear: 3, round: 0.3, concave: 0.13 },
  d2: { at: 61, base: 3.4, h: 3.9, rear: 3 },
  anal: { at: 61.5, base: 3.4, h: 3.6, rear: 2.8 },
  pec: { at: [21, 0.72], len: 17, angle: 47, width: 0.32, concave: 0.15, round: 0.2 },
  caudal: { upper: [100, -16.5], lower: [87, 11], fork: [85, 1.6], notch: 3.4 },
  mouth: [
    [3.9, 0.95],
    [6.2, 0.9],
    [8.4, 0.84],
  ],
  extra: (c) => {
    const [a, b] = trailing(c);
    const s = c.s;
    // The pale flank band: a white wedge reaching forward from above the pelvic fin.
    const wedge = shapeIn(s, [
      [tAtX(s, 30), 0.66],
      [tAtX(s, 42), 0.6],
      [tAtX(s, 52), 0.62],
      [tAtX(s, 56), 0.7],
      [tAtX(s, 44), 0.7],
    ]);
    return {
      tint: [{ poly: wedge, paint: 'belly', o: 0.9, clip: 'trunk' }],
      median: [
        { fin: 'd1', marks: [finTip(c.d1!, 0.5, 'light', 1), finTip(c.d1!, 0.62, 'ink', 0.95)] },
        { fin: 'caudal', marks: [edgeBand(c.caudal.outline, a, (a + b) / 2, 1.6, 'ink', 1, 0.85), finTip(c.caudal.lower, 0.55, 'ink', 0.95)] },
        { fin: 'd2', marks: [finTip(c.d2!, 0.55, 'ink', 0.9)] },
        { fin: 'anal', marks: [finTip(c.anal!, 0.55, 'ink', 0.9)] },
        { fin: 'pelvic', marks: [finTip(c.pelvic!, 0.6, 'ink', 0.9)] },
        { fin: 'pec', marks: [finTip(c.pec, 0.7, 'ink', 0.95)] },
      ],
    };
  },
});

// ── Whitetip reef shark ──────────────────────────────────────────────────────
// Slim, near-parallel back and belly; small triangular first dorsal set far back; crisp white tips
// on the first dorsal and upper tail lobe; short broad blunt snout with tubular nasal flaps and a
// brow ridge; scattered dark spots; big second dorsal.
const whitetip: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 73, depth: 12.5, at: 30, riseTop: 3, riseBot: 2.4, pedH: 4.6, up: 0.5, nose: 0.72 }),
  blunt: 0.85,
  eye: { x: 5.6, f: 0.34, r: 0.75 },
  d1: { at: 36.5, base: 7.6, h: 7.6, sweep: 0.6, rear: 2.8, round: 0.5, concave: 0.08 },
  d2: { at: 61, base: 3.8, h: 4.6, rear: 2.6, sweep: 0.5 },
  anal: { at: 62, base: 3.8, h: 4.2, rear: 2.4 },
  pelvic: { at: 47, base: 4, h: 3.8, rear: 2 },
  pec: { at: [20, 0.74], base: 5, len: 14, angle: 42, width: 0.42, concave: 0.06, round: 0.6 },
  caudal: { upper: [100, -14], lower: [86.5, 8.8], fork: [84.6, 1.4], notch: 3.4 },
  gills: { n: 5, x: 14.5, step: 1.5, f0: 0.33, f1: 0.73 },
  mouth: [
    [3.4, 0.95],
    [5.6, 0.9],
    [7.8, 0.84],
  ],
  extra: (c) => {
    const s = c.s;
    const brow = spline([atX(s, 4.3, 0.23), atX(s, 5.6, 0.18), atX(s, 7, 0.22)], false);
    const flap = ellipse(atX(s, 1.6, 0.74), 0.55, 0.85, -20);
    return {
      marks: [
        ...scatter(s, { t0: tAtX(s, 18), t1: 0.98, f0: 0.15, f1: 0.62, r: 0.42, gap: 2.4, paint: 'dark', rand: c.rand, tries: 260, o: 0.8 }),
        { poly: flap, paint: 'back', edge: 1 },
      ],
      lines: [{ pts: brow, w: 0.9 }],
      median: [
        { fin: 'd1', marks: [finTip(c.d1!, 0.55, 'light', 1)] },
        { fin: 'caudal', marks: [finTip(tipOf(c), 0.7, 'light', 1)] },
        { fin: 'd2', marks: [finTip(c.d2!, 0.75, 'light', 0.8)] },
      ],
    };
  },
});

// ── Bull shark ───────────────────────────────────────────────────────────────
// Very short blunt snout and a small eye; heavy, deep body; broad triangular first dorsal over the
// pectoral insertion; large second dorsal; plain grey.
const bull: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 74, depth: 21.5, at: 29, riseTop: 3, riseBot: 2.5, pedH: 5.8, nose: 0.62 }),
  blunt: 0.9,
  noseTilt: 0.2,
  eye: { x: 5.8, f: 0.34, r: 0.75 },
  d1: { at: 28, base: 10.5, h: 10, sweep: 0.6, rear: 2.6, round: 0.3, concave: 0.06, convex: 0.05 },
  d2: { at: 60, base: 4, h: 4, rear: 2.8 },
  anal: { at: 60.5, base: 4, h: 3.8, rear: 2.6 },
  pelvic: { at: 46, base: 4.6, h: 5, rear: 2.4 },
  pec: { at: [20, 0.72], base: 6, len: 19, angle: 46, width: 0.42, concave: 0.1, round: 0.4 },
  caudal: { upper: [100, -18.5], lower: [87.5, 12.5], fork: [85.5, 1.8], notch: 3.6 },
  mouth: [
    [3.7, 0.95],
    [6.4, 0.9],
    [9, 0.83],
  ],
});

// ── Silky shark ──────────────────────────────────────────────────────────────
// Slender, bronze-grey; small, low, round-topped first dorsal well behind the pectorals; long
// sickle pectorals; tiny second dorsal with a very long trailing tip; interdorsal ridge.
const silky: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 73, depth: 14.8, at: 31, riseTop: 2.1, riseBot: 1.8, pedH: 4.4 }),
  blunt: 0.35,
  eye: { x: 7.6, f: 0.36, r: 1.05 },
  d1: { at: 34, base: 8, h: 6.8, sweep: 0.68, rear: 3.6, round: 1.4, concave: 0.12, convex: 0.12 },
  d2: { at: 62, base: 2.2, h: 1.8, rear: 5, rearLift: 0.4, sweep: 0.5 },
  anal: { at: 61.5, base: 3, h: 2.6, rear: 3.2 },
  pec: { at: [21, 0.72], base: 4.4, len: 20, angle: 42, width: 0.27, concave: 0.18, round: 0.3 },
  caudal: { upper: [100, -15.5], lower: [86.5, 10], fork: [84.6, 1.4], notch: 3.4 },
  mouth: [
    [5.3, 0.95],
    [7.8, 0.9],
    [10, 0.84],
  ],
  extra: (c) => ({ lines: ridge(c), median: [{ fin: 'pec', marks: [finTip(c.pec, 0.72, 'dark', 0.5)] }] }),
});

// ── Galápagos shark ──────────────────────────────────────────────────────────
// Tall first dorsal over the pectoral inner margins, straightish front edge; low interdorsal
// ridge; moderately long rounded snout; plain fins and tail edge.
const galapagos: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 74, depth: 18, at: 30, riseTop: 2.3, riseBot: 1.9, pedH: 5.3 }),
  blunt: 0.5,
  eye: { x: 7, f: 0.36, r: 0.9 },
  d1: { at: 29.5, base: 9.6, h: 11.8, sweep: 0.6, rear: 3, round: 0.6, concave: 0.12, convex: 0.02 },
  d2: { at: 61, base: 3.2, h: 2.7, rear: 2.4 },
  anal: { at: 61.4, base: 3.4, h: 3, rear: 2.6 },
  pec: { at: [21, 0.72], base: 5.6, len: 19, angle: 47, width: 0.35, concave: 0.15, round: 0.5 },
  caudal: { upper: [100, -17.5], lower: [87, 12], fork: [85, 1.7], notch: 3.6 },
  extra: (c) => ({ lines: ridge(c), median: [{ fin: 'pec', marks: [finTip(c.pec, 0.75, 'dark', 0.35)] }] }),
});

// ── Oceanic whitetip ─────────────────────────────────────────────────────────
// Giant round-topped first dorsal like a paddle; very long, broad, round-tipped pectorals spread
// wide; mottled white tips on the dorsal, pectorals, pelvics and both tail lobes; stocky, bronze.
const oceanic: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 73.5, depth: 19, at: 32, riseTop: 2.7, riseBot: 2.2, pedH: 5.4, hump: [31, 0.8], nose: 0.52 }),
  blunt: 0.75,
  eye: { x: 6.2, f: 0.35, r: 0.75 },
  d1: { at: 31.5, base: 10.5, h: 13, sweep: 0.5, rear: 2.6, round: 4.2, concave: 0.02, convex: 0.16 },
  d2: { at: 61, base: 3.3, h: 3.4, rear: 2.6 },
  anal: { at: 61.6, base: 3.4, h: 3.4, rear: 2.6 },
  pelvic: { at: 47, base: 4.4, h: 4.6, rear: 2, round: 1 },
  pec: { at: [21, 0.7], base: 7.5, len: 27, angle: 28, width: 0.46, convex: 0.05, concave: 0.02, round: 4, rear: 0.05 },
  caudal: { upper: [100, -17.5], lower: [87.5, 12.5], fork: [85.3, 1.7], notch: 3.4 },
  mouth: [
    [4.2, 0.95],
    [6.6, 0.9],
    [9, 0.84],
  ],
  extra: (c) => {
    const mottle = (shape: { poly: Pt[]; le: Pt[]; te: Pt[] }, from: number) => {
      const tip = finTip(shape, from, 'light', 1);
      // The white is blotchy: a solid tip with a few pale blotches below it.
      const flecks = scatterIn(finTip(shape, from - 0.14, 'light').poly, { r: 0.7, gap: 0.4, paint: 'light', rand: c.rand, o: 0.85, tries: 80 });
      return [tip, ...flecks];
    };
    return {
      median: [
        { fin: 'd1', marks: mottle(c.d1!, 0.72) },
        { fin: 'caudal', marks: [...mottle(tipOf(c), 0.8), ...mottle(c.caudal.lower, 0.68)] },
        { fin: 'pelvic', marks: [finTip(c.pelvic!, 0.66, 'light', 0.9)] },
        { fin: 'pec', marks: mottle(c.pec, 0.78) },
      ],
    };
  },
});

// ── Lemon shark ──────────────────────────────────────────────────────────────
// Two nearly equal dorsals; yellow-brown; broad, short, blunt snout; stocky requiem body.
const lemon: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 74, depth: 18, at: 31, riseTop: 2.8, riseBot: 2.3, pedH: 5.6, nose: 0.6 }),
  blunt: 0.85,
  eye: { x: 6, f: 0.35, r: 0.8 },
  d1: { at: 33, base: 8.4, h: 8.6, sweep: 0.62, rear: 3, round: 0.5, concave: 0.12 },
  d2: { at: 58.5, base: 7.2, h: 7.6, sweep: 0.62, rear: 2.8, round: 0.5, concave: 0.13 },
  anal: { at: 59.5, base: 5.6, h: 5.4, sweep: 0.55, rear: 2.6, concave: 0.14 },
  pec: { at: [21, 0.72], base: 5.8, len: 17, angle: 46, width: 0.38, concave: 0.12, round: 0.5 },
  caudal: { upper: [100, -16.5], lower: [87, 12], fork: [85, 1.7], notch: 3.4 },
  mouth: [
    [3.9, 0.95],
    [6.4, 0.9],
    [8.8, 0.84],
  ],
});

// ── Tiger shark ──────────────────────────────────────────────────────────────
// Square, very blunt snout with long labial furrows; dark vertical bars on the rear flank and
// tail; long, pointed upper tail lobe over a slender keeled stalk; heavy chest tapering away.
const tiger: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 70, depth: 19, at: 28, riseTop: 3.2, riseBot: 2.6, pedH: 4.2, taper: 1.35, sag: 1, nose: 0.55 }),
  blunt: 0.85,
  eye: { x: 5.4, f: 0.33, r: 1 },
  gills: { n: 5, x: 15.5, step: 1.45, f0: 0.4, f1: 0.66 },
  d1: { at: 27.5, base: 8.8, h: 8.8, sweep: 0.62, rear: 2.8, round: 0.6, convex: 0.12, concave: 0.13 },
  d2: { at: 60, base: 3, h: 3, rear: 2.6 },
  anal: { at: 60.5, base: 3.2, h: 3, rear: 2.6, concave: 0.2 },
  pec: { at: [20, 0.72], base: 5.4, len: 16, angle: 47, width: 0.36, concave: 0.14, round: 0.5 },
  caudal: { upper: [100, -14.5], lower: [80.5, 10.5], fork: [79.5, 1.2], notch: 2.8, upperBow: 0.03 },
  keel: true,
  mouth: [
    [3.1, 0.96],
    [5.6, 0.9],
    [8.2, 0.84],
  ],
  extra: (c) => {
    const s = c.s;
    const bars: Fill[] = [];
    // The bars are dark, wide at the back and tapering to a point down the flank, leaning forward
    // as they fall; strongest over the rear flank and tail stock, fading towards the head.
    const streak = (t: number, w: number, f0: number, f1: number, lean: number, o: number): Fill => {
      const n = 8;
      const left: Pt[] = [];
      const right: Pt[] = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const f = f0 + (f1 - f0) * u;
        const half = (w / 2) * (1 - 0.82 * u ** 1.4) * (0.85 + 0.3 * c.rand());
        const tc = t + lean * (f - f0) + 0.004 * Math.sin(u * 5 + t * 90);
        left.push(at(s, tc - half, f));
        right.push(at(s, tc + half, f));
      }
      return { poly: spline([...left, ...right.reverse()], true), paint: 'pattern', o, clip: 'trunk' };
    };
    for (let x = 19; x < 69; x += 2.3 + c.rand() * 2.1) {
      const t = tAtX(s, x);
      const k = Math.min(1, Math.max(0.3, (x - 15) / 32));
      const end = 0.42 + k * 0.24 + c.rand() * 0.06;
      const lean = -0.016 - c.rand() * 0.02;
      const w = 0.02 + k * 0.008 + c.rand() * 0.008;
      const o = 0.82 + 0.14 * k;
      // Now and then a bar breaks in two.
      if (c.rand() < 0.3) {
        const cut = 0.16 + c.rand() * 0.14;
        bars.push(streak(t, w, 0.02, cut, lean, o));
        bars.push(streak(t + lean * cut + 0.003, w * 0.85, cut + 0.05, end, lean, o));
      } else bars.push(streak(t, w, 0.02, end, lean, o));
    }
    // Three short tapered bars across the upper tail lobe.
    const lobe = c.caudal;
    const lobeBars = [0.26, 0.42, 0.58, 0.73].map((f, i) => {
      const j = Math.floor((lobe.le.length - 1) * f);
      const k = Math.floor((lobe.te.length - 1) * f);
      const a = lerp(lobe.le[j], lobe.te[k], -0.1);
      const b = lerp(lobe.le[j], lobe.te[k], 0.9 - i * 0.08);
      return { poly: swell([a, lerp(a, b, 0.5), b], 1.9 - i * 0.2, 'end'), paint: 'pattern' as const, o: 0.88 };
    });
    return {
      marks: bars,
      lines: [furrow(c, [8.2, 0.84], [4.6, 0.62]), ...ridge(c)],
      median: [{ fin: 'caudal', marks: lobeBars }],
    };
  },
});

// ── Great white ──────────────────────────────────────────────────────────────
// Heavy torpedo, conical snout, black doll's eye; big triangular first dorsal over the pectoral
// inner margin; near-symmetric crescent tail with a strong keel; minute second dorsal and anal;
// a jagged grey/white boundary; black pectoral tip and axil spot.
const greatWhite: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 76, depth: 21, at: 31, riseTop: 2.1, riseBot: 1.8, pedH: 4.2, taper: 1.15 }),
  blunt: 0.3,
  eye: { x: 7, f: 0.34, r: 0.85 },
  gills: { n: 5, x: 15.2, step: 1.85, f0: 0.18, f1: 0.8, grow: 0 },
  d1: { at: 30.5, base: 10, h: 10, sweep: 0.55, rear: 2.6, round: 0.7, concave: 0.05, convex: 0.07 },
  d2: { at: 67, base: 1.4, h: 1.1, rear: 1.2, sweep: 0.5 },
  anal: { at: 68, base: 1.4, h: 1.1, rear: 1.1, sweep: 0.5 },
  pelvic: { at: 50, base: 4.4, h: 4.2, rear: 1.8 },
  pec: { at: [24, 0.74], base: 6, len: 19.5, angle: 44, width: 0.33, concave: 0.1, round: 0.4 },
  caudal: { upper: [100, -21.5], lower: [91, 17], fork: [83.6, 0.6], notch: 0, upperBow: 0.04, lowerBow: 0.06, trail: 0.12, lowerTrail: 0.1 },
  keel: true,
  mouth: [
    [4.6, 0.96],
    [7.8, 0.92],
    [11, 0.82],
  ],
  belly: ragged((t) => 0.58 + 0.06 * Math.sin(t * 3.1), 0.035, 7, 2),
  softBelly: false,
  extra: (c) => {
    const s = c.s;
    // White wedges reaching up the flank behind the pectoral fin.
    const wedges = [
      [0.33, 0.52, 0.035],
      [0.395, 0.47, 0.03],
      [0.45, 0.53, 0.022],
      [0.52, 0.56, 0.02],
    ].map(([t, f, w]) => [at(s, t - w, 0.68), at(s, t - w * 0.15, f), at(s, t + w * 0.25, f + 0.05), at(s, t + w * 0.55, f - 0.01), at(s, t + w, 0.68)]);
    const axil = add(c.pec.poly[c.pec.poly.length - 2] ?? c.pec.apex, [1.2, -0.4]);
    return {
      tint: wedges.map((poly) => ({ poly, paint: 'belly' as const, clip: 'trunk' as const })),
      marks: [{ poly: ellipse(axil, 1.3, 0.8, 10), paint: 'ink', o: 0.8, clip: 'trunk' }],
      median: [{ fin: 'pec', marks: [finTip(c.pec, 0.82, 'ink', 0.9)] }],
    };
  },
});

// ── Shortfin mako ────────────────────────────────────────────────────────────
// Needle-pointed conical snout; big black eye; lunate tail with a keel; metallic indigo over pure
// white, with a white chin; minute second dorsal and anal; slimmer than the great white, its
// dorsal behind the pectoral tip and its pectorals shorter than the head.
const mako: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 77, depth: 16, at: 33, riseTop: 1.7, riseBot: 1.5, pedH: 3.6, taper: 1.2, up: 0.5 }),
  blunt: 0.08,
  eye: { x: 8, f: 0.36, r: 1.15 },
  gills: { n: 5, x: 16.2, step: 1.75, f0: 0.2, f1: 0.8, grow: 0 },
  d1: { at: 34, base: 8.4, h: 8.6, sweep: 0.55, rear: 2, round: 0.8, concave: 0.05 },
  d2: { at: 67, base: 1.2, h: 1, rear: 1, sweep: 0.5 },
  anal: { at: 68, base: 1.2, h: 1, rear: 1, sweep: 0.5 },
  pelvic: { at: 52, base: 3.6, h: 3.4, rear: 1.6 },
  pec: { at: [23.5, 0.74], base: 4.4, len: 15, angle: 40, width: 0.3, concave: 0.12, round: 0.3 },
  caudal: { upper: [100, -19.5], lower: [92.5, 15.5], fork: [84.8, 0.4], notch: 0, upperBow: 0.03, lowerBow: 0.05, trail: 0.12, lowerTrail: 0.1 },
  keel: true,
  mouth: [
    [5.8, 0.96],
    [9, 0.92],
    [12, 0.82],
  ],
  belly: (t) => 0.5 + 0.08 * Math.min(1, t * 6),
  softBelly: false,
  extra: (c) => {
    const s = c.s;
    // Slender teeth jutting from the lower jaw.
    const teeth: Fill[] = [0.8, 1.6, 2.4, 3.2].map((k) => {
      const base = atX(s, 6 + k, 0.97);
      return { poly: [add(base, [-0.35, 0]), add(base, [0.05, -1.5]), add(base, [0.35, 0])], paint: 'light', edge: 0.8 };
    });
    return { marks: teeth };
  },
});

// ── Basking shark ────────────────────────────────────────────────────────────
// Gill slits wrapping almost round the head; conical snout over a vast gaping mouth with gill
// rakers inside; tiny eye; tall triangular first dorsal; lunate keeled tail; mottled grey-brown.
const baskingBody = bodyShape({ ped: 75, depth: 17.5, at: 33, riseTop: 2, riseBot: 1.4, pedH: 4, taper: 1.2 });
const basking: SharkSpec = variant(requiem, {
  ...baskingBody,
  // The lower jaw hangs open: the belly line drops under the head, then returns at the throat.
  bot: [[1.2, 1.4], [3, 3.2], [6, 6.8], [9.5, 8.6], [12, 8.2], [14, 7.4], ...baskingBody.bot.filter((p) => p[0] > 17)],
  blunt: 0.2,
  noseTilt: -0.2,
  eye: { x: 5.6, f: 0.32, r: 0.5 },
  gills: { n: 5, x: 12.2, step: 2.8, f0: 0.05, f1: 0.96, grow: 0.02, bow: 1.4, weight: 2.4 },
  d1: { at: 33.5, base: 10, h: 11.5, sweep: 0.52, rear: 2.4, round: 0.6, concave: 0.02, convex: 0.03 },
  d2: { at: 64, base: 2.8, h: 2.8, rear: 1.8 },
  anal: { at: 65, base: 2.8, h: 2.6, rear: 1.8 },
  pelvic: { at: 50, base: 4.4, h: 4, rear: 1.8 },
  pec: { at: [25, 0.76], base: 5, len: 14, angle: 50, width: 0.4, concave: 0.06, round: 0.6 },
  caudal: { upper: [100, -20], lower: [90.5, 14.5], fork: [83.5, 0.8], notch: 1.6, trail: 0.12, lowerTrail: 0.08 },
  keel: true,
  mouth: undefined,
  softBelly: true,
  belly: 0.66,
  extra: (c) => {
    const s = c.s;
    // The gaping mouth: a dark cavity under the snout, the comb of gill rakers inside it.
    const gape = shapeIn(s, [
      [tAtX(s, 2), 0.6],
      [tAtX(s, 5.5), 0.47],
      [tAtX(s, 10.8), 0.42],
      [tAtX(s, 12.6), 0.6],
      [tAtX(s, 12), 0.86],
      [tAtX(s, 8), 0.93],
      [tAtX(s, 3.6), 0.88],
    ]);
    // Inside: the pale gill arches, bowed, each fringed with its comb of rakers.
    const rakers: Line[] = [];
    for (let i = 0; i < 5; i++) {
      const x = 6.4 + i * 1.25;
      const arch = spline([atX(s, x, 0.46), atX(s, x - 1, 0.66), atX(s, x - 0.2, 0.9)], false);
      rakers.push({ pts: arch, w: 2.2, o: 0.0001 });
      rakers.push({ pts: arch, w: 1.6, o: 1 });
    }
    const blotches = [12, 22, 33, 45, 56].flatMap((x, i) => patch(atX(s, x + c.rand() * 3, 0.25 + (i % 2) * 0.12), 2.4, 'dark', c.rand, 0.35, 1.6));
    return {
      marks: [
        ...blotches.map((f) => ({ ...f, clip: 'trunk' as const })),
        { poly: gape, paint: '#2A2624', edge: 1.6 },
        ...rakers
          .filter((l) => l.o === 1)
          .flatMap((l) => clipLine(l.pts, gape).map((pts) => ({ poly: swellPoly(pts, 0.9), paint: '#D9D0BE' as const }))),
      ],
    };
  },
});

// ── Whale shark ──────────────────────────────────────────────────────────────
// Square, flat head with a full-width mouth right at the front; light spots between pale
// vertical and horizontal stripes (a checkerboard); three ridges along the flank into the tail
// keel; tiny eye just behind the mouth corner; crescent tail with a strong lower lobe.
const whale: SharkSpec = variant(requiem, {
  tip: [0, 0.6],
  top: [
    [0.12, -1.1],
    [0.7, -2.3],
    [2.2, -3],
    [6, -3.5],
    [10, -4.3],
    [15, -5.8],
    [22, -8.4],
    [30, -9.6],
    [38, -9.8],
    [46, -9],
    [54, -7.2],
    [62, -5],
    [68, -3.4],
    [73, -2.4],
  ],
  bot: [
    [0.15, 2.2],
    [0.9, 3.3],
    [3.4, 4.1],
    [8, 5],
    [12, 6.2],
    [18, 7.6],
    [27, 8.6],
    [36, 8.6],
    [45, 7.8],
    [54, 6.2],
    [62, 4.4],
    [68, 3],
    [73, 2.2],
  ],
  blunt: 1,
  eye: { x: 5.4, f: 0.42, r: 0.42 },
  gills: { n: 5, x: 14, step: 2, f0: 0.14, f1: 0.86, grow: -0.03, bow: 0.8 },
  d1: { at: 39, base: 10, h: 9.4, sweep: 0.58, rear: 2.6, round: 1.4, concave: 0.06, convex: 0.06 },
  d2: { at: 62, base: 3.4, h: 3, rear: 1.6 },
  anal: { at: 63, base: 3.4, h: 2.8, rear: 1.6 },
  pelvic: { at: 42.5, base: 5, h: 4, rear: 1.8 },
  pec: { at: [19.5, 0.72], base: 6.4, len: 16, angle: 44, width: 0.36, concave: 0.14, round: 0.4 },
  caudal: { upper: [100, -19], lower: [87, 13.5], fork: [82.5, 0.6], notch: 1.2, trail: 0.1, lowerTrail: 0.08, lowerBow: 0.08 },
  keel: true,
  mouth: [
    [0.08, 0.46],
    [2.6, 0.49],
    [5.8, 0.55],
  ],
  belly: 0.74,
  softBelly: false,
  extra: (c) => {
    const s = c.s;
    const ridges = [0.2, 0.34, 0.48].map((f, i) => ({
      pts: lineAlong(s, (t) => f + (0.52 - f) * Math.max(0, (t - 0.55) / 0.45) ** 1.5, tAtX(s, 16 + i * 2), 1),
      w: 1.05,
    }));
    const pale: Fill[] = [];
    // Pale vertical stripes, and the pale lines along the ridges.
    const cols: number[] = [];
    for (let x = 17.5; x < 72; x += 3.6 + c.rand() * 1.4) cols.push(x);
    for (const x of cols) pale.push(bar(s, tAtX(s, x), 0.0045 + c.rand() * 0.002, 0.03, 0.7 + c.rand() * 0.05, 'light', c.rand, 0.85, (c.rand() - 0.5) * 0.02));
    const rows = [0.2, 0.34, 0.48];
    for (const f of rows) pale.push({ poly: region(s, tAtX(s, 17), 0.98, (t) => f - 0.01 + 0.006 * Math.sin(t * 40), (t) => f + 0.01 + 0.006 * Math.sin(t * 40)), paint: 'light', o: 0.8, clip: 'trunk' });
    // Spots in the cells between the stripes (one or two each, uneven), smaller and denser on the head.
    const spots: Fill[] = [];
    const bands = [0.04, 0.2, 0.34, 0.48, 0.62, 0.72];
    for (let i = 0; i < cols.length - 1; i++) {
      for (let j = 0; j < bands.length - 1; j++) {
        const n = c.rand() < 0.35 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const x = cols[i] + (cols[i + 1] - cols[i]) * (n === 1 ? 0.5 : 0.3 + k * 0.4) + (c.rand() - 0.5) * 0.8;
          const f = bands[j] + (bands[j + 1] - bands[j]) * (0.5 + (c.rand() - 0.5) * 0.35);
          spots.push({ poly: ellipse(atX(s, x, f), 0.42 + c.rand() * 0.32), paint: 'light', clip: 'trunk' });
        }
      }
    }
    spots.push(...scatter(s, { t0: tAtX(s, 1.2), t1: tAtX(s, 16.5), f0: 0.05, f1: 0.66, r: (t) => 0.26 + t * 0.4, gap: 0.75, paint: 'light', rand: c.rand, tries: 600 }));
    const finSpots = (poly: Pt[]) => scatterIn(poly, { r: 0.45, gap: 1.1, paint: 'light', rand: c.rand, tries: 120 });
    const spiracle = { poly: ellipse(atX(s, 6.8, 0.36), 0.32, 0.22), paint: 'ink' as const };
    return {
      marks: [...pale, ...spots, spiracle],
      lines: ridges,
      median: [
        { fin: 'd1', marks: finSpots(c.d1!.poly) },
        { fin: 'caudal', marks: finSpots(c.caudal.poly) },
        { fin: 'pec', marks: finSpots(c.pec.poly) },
      ],
    };
  },
});

// ── Sand tiger ───────────────────────────────────────────────────────────────
// Ragged teeth showing; two equal dorsals and a similar anal, all set far back; humpbacked
// profile; flattened conical snout and small eye; asymmetric tail with a short lower lobe; rusty
// spots on the rear half.
const sandTiger: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 71, depth: 19, at: 35, riseTop: 2.2, riseBot: 1.7, pedH: 4.6, hump: [30, 1.6], sag: 1.4 }),
  blunt: 0.3,
  noseTilt: 0.4,
  eye: { x: 6.2, f: 0.32, r: 0.6 },
  d1: { at: 38, base: 9.6, h: 7.6, sweep: 0.55, rear: 2, round: 1.3, concave: 0.06, convex: 0.06 },
  d2: { at: 57.5, base: 8, h: 6.6, sweep: 0.55, rear: 1.8, round: 1.2, concave: 0.06 },
  anal: { at: 61.5, base: 7, h: 5.6, sweep: 0.5, rear: 1.8, round: 1, concave: 0.08 },
  pelvic: { at: 45, base: 6, h: 5, rear: 2, round: 0.8 },
  pec: { at: [20, 0.76], base: 6, len: 13, angle: 48, width: 0.48, concave: 0.04, round: 1.4 },
  caudal: { upper: [100, -15.5], lower: [81.5, 9.5], fork: [80, 1.4], notch: 4.2, upperBow: 0.03 },
  mouth: [
    [3.4, 0.94],
    [6.5, 0.88],
    [10.2, 0.84],
  ],
  extra: (c) => {
    const s = c.s;
    // Awl-shaped teeth jutting out along both jaws.
    const teeth: Fill[] = [];
    for (let i = 0; i < 9; i++) {
      const x = 3.8 + i * 0.75;
      const f = 0.94 - (i / 9) * 0.1;
      const b = atX(s, x, f);
      const up = i % 2 === 0;
      teeth.push({ poly: [add(b, [-0.28, 0]), add(b, [0.15 + (up ? 0.1 : -0.2), up ? 1.4 : -1.3]), add(b, [0.28, 0])], paint: 'light', edge: 0.7 });
    }
    return {
      marks: [
        ...scatter(s, { t0: tAtX(s, 34), t1: 0.98, f0: 0.08, f1: 0.62, r: (t) => 0.5 + c.rand() * 0.6, gap: 1.6, paint: 'pattern', rand: c.rand, tries: 300, o: 0.85 }),
        ...teeth,
      ],
      median: [
        { fin: 'caudal', marks: scatterIn(c.caudal.poly, { r: 0.6, gap: 2, paint: 'pattern', rand: c.rand, tries: 60, o: 0.8 }) },
        { fin: 'd2', marks: scatterIn(c.d2!.poly, { r: 0.55, gap: 1.6, paint: 'pattern', rand: c.rand, tries: 40, o: 0.8 }) },
      ],
    };
  },
});

// ── Zebra (leopard) shark, adult ─────────────────────────────────────────────
// A low, flag-like tail as long as the body; ridges along the back and flanks; even leopard
// spots; small barbelled mouth on a blunt head; large rounded pectorals.
const zebra: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 48, depth: 13.5, at: 18, riseTop: 2.6, riseBot: 2.4, pedH: 4.2, up: 0.55, taper: 0.8, nose: 0.81 }),
  blunt: 1,
  eye: { x: 3.8, f: 0.36, r: 0.45 },
  gills: { n: 5, x: 10.2, step: 1.1, f0: 0.42, f1: 0.66 },
  d1: { at: 25, base: 8.6, h: 7.5, sweep: 0.5, rear: 1.4, round: 2.6, concave: 0.04, convex: 0.14 },
  d2: { at: 38.5, base: 4.2, h: 2.7, sweep: 0.5, rear: 1, round: 0.8 },
  anal: { at: 41, base: 3.2, h: 2, sweep: 0.5, rear: 0.8, round: 0.6 },
  pelvic: { at: 27, base: 5.4, h: 3.6, sweep: 0.5, rear: 1, round: 1.4 },
  pec: { at: [12.4, 0.72], base: 6, len: 13, angle: 42, width: 0.62, convex: 0.12, concave: 0.0, round: 3.6, rear: 0.05 },
  caudal: { upper: [100, -2.6], lower: [66, 5.2], fork: [93.4, -0.1], notch: 0, upperBow: 0.02, lowerBow: 0.1, trail: 0.12, lowerTrail: 0.02, lowerRound: 4 },
  mouth: [
    [1.6, 0.9],
    [2.8, 0.92],
  ],
  belly: 0.78,
  extra: (c) => {
    const s = c.s;
    const ridges = [0.06, 0.3, 0.56].map((f) => ({ pts: lineAlong(s, f, tAtX(s, 9), 1), w: 0.95 }));
    const barbel = spline([atX(s, 1, 0.8), atX(s, 1.6, 0.98), add(atX(s, 1.8, 1), [0.3, 1.2])], false);
    const spots = scatter(s, { t0: 0.03, t1: 1, f0: 0.02, f1: 0.8, r: 0.7, gap: 1.3, paint: 'pattern', rand: c.rand, tries: 700 });
    const tailSpots = scatterIn(c.caudal.poly, { r: 0.55, gap: 1.4, paint: 'pattern', rand: c.rand, tries: 500 });
    return {
      marks: spots,
      lines: [...ridges, { pts: barbel, w: 1 }, { pts: [atX(s, 5.4, 0.3), atX(s, 6, 0.32)], w: 1.2 }],
      median: [
        { fin: 'caudal', marks: tailSpots },
        { fin: 'd1', marks: scatterIn(c.d1!.poly, { r: 0.45, gap: 0.8, paint: 'pattern', rand: c.rand, tries: 120 }) },
        { fin: 'pec', marks: scatterIn(c.pec.poly, { r: 0.45, gap: 0.8, paint: 'pattern', rand: c.rand, tries: 160 }) },
      ],
    };
  },
});

// ── Nurse shark ──────────────────────────────────────────────────────────────
// Nasal barbels at the mouth; two big rounded dorsals set far back, the first over the pelvics;
// long tail with almost no lower lobe; broad flat head with small high eyes; plain brown.
const nurse: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 73, depth: 15, at: 24, riseTop: 3, riseBot: 3.2, pedH: 5, up: 0.55, taper: 0.9, nose: 0.81 }),
  blunt: 1,
  noseTilt: 0.3,
  eye: { x: 4.6, f: 0.24, r: 0.45 },
  gills: { n: 5, x: 13.5, step: 1.1, f0: 0.44, f1: 0.7 },
  d1: { at: 45, base: 11, h: 8.4, sweep: 0.5, rear: 1.6, round: 3.6, convex: 0.12, concave: 0.0 },
  d2: { at: 60.5, base: 8, h: 6.4, sweep: 0.5, rear: 1.4, round: 2.8, convex: 0.1, concave: 0 },
  anal: { at: 62.5, base: 6, h: 3.4, sweep: 0.5, rear: 1.2, round: 1.6 },
  pelvic: { at: 43, base: 7, h: 4.2, sweep: 0.5, rear: 1.4, round: 2 },
  pec: { at: [17, 0.78], base: 6.4, len: 13, angle: 40, width: 0.55, convex: 0.1, concave: 0.0, round: 3, rear: 0.05 },
  caudal: { upper: [100, -5.6], lower: [80, 5.6], fork: [82, 3.6], notch: 3.4, upperBow: 0.02, lowerBow: 0.04, trail: 0.02, lowerTrail: 0, lowerRound: 3 },
  mouth: [
    [1.5, 0.92],
    [3, 0.94],
    [4.2, 0.92],
  ],
  belly: 0.8,
  extra: (c) => {
    const s = c.s;
    const barbel = spline([atX(s, 0.9, 0.86), atX(s, 1.7, 1.0), add(atX(s, 2.2, 1), [0.6, 2])], false);
    return {
      lines: [{ pts: barbel, w: 1.2 }, { pts: [atX(s, 5.8, 0.22), atX(s, 6.3, 0.24)], w: 1.1 }],
    };
  },
});

// ── Pelagic thresher ─────────────────────────────────────────────────────────
// Upper tail lobe as long as the whole body; small short head with a big round eye; broad,
// straight, round-tipped pectorals; dark colour reaching down over the pectoral base.
const thresher: SharkSpec = variant(requiem, {
  ...bodyShape({ ped: 50, depth: 11.5, at: 19, riseTop: 2.4, riseBot: 2, pedH: 3.2, taper: 1.2 }),
  blunt: 0.6,
  eye: { x: 4, f: 0.38, r: 0.95 },
  gills: { n: 5, x: 9.2, step: 0.8, f0: 0.36, f1: 0.66 },
  d1: { at: 22.5, base: 4.6, h: 5.6, sweep: 0.55, rear: 1.4, round: 0.6, concave: 0.08 },
  d2: { at: 45.5, base: 0.9, h: 0.8, rear: 0.8, sweep: 0.5 },
  anal: { at: 46.5, base: 0.9, h: 0.7, rear: 0.7, sweep: 0.5 },
  pelvic: { at: 31.5, base: 3.6, h: 4.4, rear: 1.4, round: 0.6 },
  pec: { at: [12.5, 0.72], base: 3.4, len: 13, angle: 50, width: 0.34, concave: 0.02, convex: 0.03, round: 1.4 },
  caudal: { upper: [100, -19], lower: [55, 6.4], fork: [53.5, 1.2], notch: 1.8, upperBow: -0.05, trail: -0.035, lowerTrail: 0.05 },
  mouth: [
    [2.5, 0.94],
    [4, 0.9],
    [5.4, 0.86],
  ],
  belly: (t) => 0.62 + 0.14 * Math.exp(-(((t - 0.3) / 0.12) ** 2)),
});

const PALETTES: Record<string, { spec: SharkSpec; palette: PlateDef['palette'] }> = {
  'grey-reef-shark': { spec: greyReef, palette: { back: '#6E747A', belly: '#F1F1EE' } },
  'blacktip-reef-shark': { spec: blacktip, palette: { back: '#8C8478', belly: '#F2F0EB' } },
  'whitetip-reef-shark': { spec: whitetip, palette: { back: '#757A7C', belly: '#F0EFEA', dark: '#3E4144' } },
  'bull-shark': { spec: bull, palette: { back: '#7B8186', belly: '#F1F0EC' } },
  'silky-shark': { spec: silky, palette: { back: '#7A705F', belly: '#EFEDE7' } },
  'galapagos-shark': { spec: galapagos, palette: { back: '#6C6A66', belly: '#F0EFEA' } },
  'oceanic-whitetip': { spec: oceanic, palette: { back: '#7B7466', belly: '#EDE6D2' } },
  'lemon-shark': { spec: lemon, palette: { back: '#A8924F', belly: '#EAE0C2' } },
  'tiger-shark': { spec: tiger, palette: { back: '#6A6F72', belly: '#EFEDE6', pattern: '#262828' } },
  'great-white-shark': { spec: greatWhite, palette: { back: '#6E7378', belly: '#F4F2EC' } },
  'shortfin-mako': { spec: mako, palette: { back: '#2E4A7A', belly: '#F6F6F3' } },
  'basking-shark': { spec: basking, palette: { back: '#5D605E', belly: '#C9C6BE', dark: '#3A3C3B' } },
  'whale-shark': { spec: whale, palette: { back: '#3F5060', belly: '#ECEAE2' } },
  'sand-tiger-shark': { spec: sandTiger, palette: { back: '#8A7A63', belly: '#EDE7DA', pattern: '#6E4A33' } },
  'zebra-shark': { spec: zebra, palette: { back: '#D2BC8A', belly: '#EEE6D2', pattern: '#3E2E20' } },
  'nurse-shark': { spec: nurse, palette: { back: '#8B7655', belly: '#C9B998' } },
  'thresher-shark': { spec: thresher, palette: { back: '#3F5873', belly: '#F2F2EF' } },
};

export const SHARKS: Record<string, PlateDef> = Object.fromEntries(
  Object.entries(PALETTES).map(([id, { spec, palette }]) => [id, { build: () => shark({ ...spec, seed: id.length * 31 }), palette }]),
);

// Re-exported for the top-view sharks.
export { at, region };
