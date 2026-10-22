/**
 * Big fish: groupers, wrasse and parrotfish, jacks, barracudas, tarpon, tunas, sailfish and the
 * ocean sunfish. Side on, facing left, 1% of total length per unit.
 */
import { add, blob, ellipse, lerp, type Pt, rng, spline } from '../kit';
import { bar, scatter, scatterIn, shapeIn } from '../marks';
import type { PlateDef } from '../registry';
import { bodyShape } from '../shark';
import { at, atX, lineAlong, region, tAtX } from '../side';
import { band, fish, type FishCtx, type FishSpec } from '../fish';
import type { Fill, Line, Part } from '../types';

const F = (spec: FishSpec, palette: PlateDef['palette'], seed: number): PlateDef => ({ build: () => fish({ ...spec, seed }), palette });

/** Finlets along an edge (tunas): small triangles from x0 to x1. */
function finlets(c: FishCtx, x0: number, x1: number, n: number, side: 'top' | 'bot', size: number): Part[] {
  const dir = side === 'top' ? -1 : 1;
  return Array.from({ length: n }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / (n - 1);
    const p = atX(c.s, x, side === 'top' ? 0 : 1);
    const k = size * (1 - (i / n) * 0.3);
    return { poly: [add(p, [-k * 0.3, 0]), add(p, [k * 0.9, dir * k * 0.9]), add(p, [k * 0.8, 0])], paint: 'accent', lines: [], edge: 0.7 } as Part;
  });
}

/** Small dark spots scattered over a fin. */
const finSpots = (poly: Pt[], rand: () => number, r = 0.45, gap = 1.3): Fill[] => scatterIn(poly, { r, gap, paint: 'ink', rand, tries: 160, o: 0.8 });

// ── Giant grouper ────────────────────────────────────────────────────────────
// A huge, thick body with a massive head (a third of its length); rounded tail and fins; small
// black spots on the yellowish fins; pale mottling on a dark adult body; a small eye over a
// cavernous mouth.
/** A grouper's head: blunt and deep, the upper jaw drawn back a little so the lower one juts out. */
const grouperHead = (b: { top: [number, number][]; bot: [number, number][] }) => ({
  top: b.top.map(([x, y]) => [x < 7 ? x + 0.9 * (1 - x / 7) ** 1.5 : x, y] as [number, number]),
  bot: b.bot,
});
/** The lower jaw and the corner of the mouth, drawn in as lines so the jaw shows in the head. */
const grouperJaw = (c: FishCtx): Line[] => [
  { pts: spline([atX(c.s, 1.4, 0.76), atX(c.s, 7, 0.8), atX(c.s, 13, 0.7), atX(c.s, 16.6, 0.56)], false), w: 1.4 },
  { pts: spline([atX(c.s, 15, 0.56), atX(c.s, 16.4, 0.64), atX(c.s, 16.6, 0.74)], false), w: 1.2 },
];
const grouperBase = {
  ...grouperHead(bodyShape({ ped: 84, depth: 32, at: 33, up: 0.5, pedH: 12, riseTop: 2.1, riseBot: 1.6, taper: 0.8, nose: 0.75 }) as { top: [number, number][]; bot: [number, number][] }),
  tip: [0, 2.2] as Pt,
  blunt: 0.8,
  dorsal: [
    { from: 31, to: 54, spines: 11, rays: 0, h: [[0, 3], [0.15, 5], [1, 4.6]] as [number, number][], notch: 0.3, rake: [25, 40] as [number, number] },
    { from: 55, to: 79, rays: 14, h: [[0, 5.2], [0.45, 8], [1, 3.2]] as [number, number][], rake: [35, 70] as [number, number] },
  ],
  anal: [{ from: 64, to: 78, spines: 3, rays: 8, h: [[0, 3], [0.3, 6.5], [0.7, 7], [1, 3.4]] as [number, number][], rake: [30, 60] as [number, number] }],
  caudal: { type: 'rounded' as const, len: 16, h: 10, rays: 14 },
  pectoral: { at: [31.5, 0.5] as [number, number], base: 5.5, h: [[0, 9], [0.45, 13], [1, 8]] as [number, number][], angles: [-18, 50] as [number, number], rays: 16 },
  pelvic: { at: [35, 0.9] as [number, number], base: 3.4, h: [[0, 8], [1, 5]] as [number, number][], angles: [30, 82] as [number, number], rays: 7 },
  eye: { x: 10, f: 0.28, r: 1.25, iris: '#9C8A4A' as const },
  gill: { x: 33, bow: 3.2 },
  // A wide gape reaching back under the eye, with thick lips.
  mouth: [[0.4, 0.58], [8, 0.64], [15, 0.56]] as [number, number][],
  lips: 1.7,
  mouthW: 2,
  lateral: (t: number) => 0.22 + 0.06 * t,
  belly: 0.82,
  softBelly: true,
  engraving: 'smooth' as const,
};
const giantGrouper: FishSpec = {
  ...grouperBase,
  extra: (c) => {
    const mottle = scatter(c.s, { t0: 0.05, t1: 1, f0: 0.05, f1: 0.9, r: (t) => 1.4 + c.rand() * 2.2, gap: 1.4, paint: 'light', rand: c.rand, tries: 300, o: 0.18, wobble: 0.45 });
    return {
      marks: mottle,
      lines: grouperJaw(c),
      median: [
        { part: 'dorsal', index: 1, marks: finSpots(c.dorsal[1].poly, c.rand) },
        { part: 'anal', marks: finSpots(c.anal[0].poly, c.rand) },
        { part: 'caudal', marks: finSpots(c.caudal.poly, c.rand) },
        { part: 'pectoral', marks: finSpots(c.pectoral!.poly, c.rand) },
      ],
    };
  },
};

// ── Goliath grouper ──────────────────────────────────────────────────────────
// Massive, broad, flat-topped head with tiny eyes; rounded tail and fins; low, even dorsal spines
// rising into a taller soft dorsal; fine black spots on the head and fins over a mottled body.
const goliath: FishSpec = {
  ...grouperBase,
  ...grouperHead(bodyShape({ ped: 84, depth: 29, at: 34, up: 0.48, pedH: 11.5, riseTop: 2.6, riseBot: 1.6, taper: 0.8, nose: 0.75 }) as { top: [number, number][]; bot: [number, number][] }),
  tip: [0, 1.6],
  eye: { x: 10, f: 0.27, r: 0.95, iris: '#9C8A4A' },
  dorsal: [
    { from: 31, to: 54, spines: 11, rays: 0, h: [[0, 2.4], [0.12, 3.6], [1, 3.4]], notch: 0.25, rake: [25, 40] },
    { from: 55, to: 79, rays: 15, h: [[0, 5.4], [0.45, 8.6], [1, 3.4]], rake: [35, 70] },
  ],
  extra: (c) => {
    const s = c.s;
    // Dark bars slanting back as they fall, as the species is drawn in the field guides.
    const bands: Fill[] = [24, 37, 50, 63].map((x, i) => bar(s, tAtX(s, x), 0.055, 0.02, 0.85, 'dark', c.rand, 0.5, 0.2 + i * 0.01));
    const mottle = scatter(s, { t0: 0.05, t1: 1, f0: 0.05, f1: 0.9, r: (t) => 1 + c.rand() * 1.2, gap: 2.4, paint: 'light', rand: c.rand, tries: 120, o: 0.15, wobble: 0.45 });
    const spots = scatter(s, { t0: 0.02, t1: 0.75, f0: 0.04, f1: 0.55, r: 0.35, gap: 1.2, paint: 'ink', rand: c.rand, tries: 500, o: 0.75 });
    return {
      marks: [...bands, ...mottle, ...spots],
      lines: grouperJaw(c),
      median: [
        { part: 'dorsal', index: 1, marks: finSpots(c.dorsal[1].poly, c.rand, 0.35, 1.2) },
        { part: 'caudal', marks: finSpots(c.caudal.poly, c.rand, 0.35, 1.2) },
        { part: 'pectoral', marks: finSpots(c.pectoral!.poly, c.rand, 0.35, 1.2) },
      ],
    };
  },
};

// ── Potato cod ───────────────────────────────────────────────────────────────
// Large, separate, dark "potato" blotches on a pale grey body; dark lines radiating from the eye;
// a rounded tail; a robust grouper a little slimmer than the giant and goliath.
const potato: FishSpec = {
  ...grouperBase,
  ...grouperHead(bodyShape({ ped: 84, depth: 26.5, at: 34, up: 0.5, pedH: 10.5, riseTop: 2.1, riseBot: 1.7, taper: 0.8, nose: 0.75 }) as { top: [number, number][]; bot: [number, number][] }),
  tip: [0, 1.4],
  belly: 0.88,
  extra: (c) => {
    const s = c.s;
    const rand = rng(77);
    const blotches: Fill[] = [];
    for (const [f, xs] of [
      [0.18, [36, 47, 58, 69, 79]],
      [0.42, [30, 41, 52, 63, 74]],
      [0.68, [36, 48, 60, 71]],
      [0.3, [20, 25]],
    ] as [number, number[]][]) {
      for (const x of xs) blotches.push({ poly: blob(atX(s, x + (rand() - 0.5) * 2, f + (rand() - 0.5) * 0.06), 2.2 + rand() * 1.2, 0.3, rand, 9, 1.3, rand() * 40), paint: 'dark', o: 0.9, clip: 'trunk' });
    }
    const eye = atX(s, 10, 0.28);
    const streaks: Line[] = [-30, 0, 30, 160, 200].map((a) => {
      const r = (a * Math.PI) / 180;
      return { pts: [add(eye, [Math.cos(r) * 1.8, Math.sin(r) * 1.8]), add(eye, [Math.cos(r) * 5.5, Math.sin(r) * 5.5])], w: 1.6, o: 0.8, taper: 'end' };
    });
    const flecks = scatter(s, { t0: 0.03, t1: 1, f0: 0.04, f1: 0.9, r: 0.3, gap: 1.6, paint: 'pattern', rand, tries: 400, o: 0.7 });
    return {
      marks: [...flecks, ...blotches],
      lines: [...streaks, ...grouperJaw(c)],
      median: [
        { part: 'dorsal', index: 1, marks: finSpots(c.dorsal[1].poly, rand, 0.4, 1.4) },
        { part: 'caudal', marks: finSpots(c.caudal.poly, rand, 0.4, 1.4) },
      ],
    };
  },
};

// ── Napoleon (humphead) wrasse ───────────────────────────────────────────────
// A forehead hump above a long snout with thick lips; wavy lines on the head and two dark lines
// behind the eye; a deep body with a short dark bar on every scale; pointed rear dorsal and anal
// fins; a rounded tail.
const napoleon: FishSpec = {
  tip: [0, 1],
  blunt: 0.7,
  // The snout dips, then the forehead rises steeply into the hump.
  top: [[0.6, -1.9], [1.8, -2.9], [3.6, -3.7], [5.6, -5], [7.6, -8.6], [10, -13.6], [13, -17.4], [18, -18.2], [22, -18.4], [30, -18.6], [40, -18], [50, -16], [60, -13], [70, -9.5], [78, -7], [84, -6.2]],
  bot: [[0.7, 3.6], [2, 5.4], [5, 7], [9, 8.6], [16, 10.8], [22, 13.5], [32, 15.5], [42, 16], [52, 15], [62, 12.5], [70, 9.5], [78, 7.2], [84, 6.4]],
  dorsal: [
    { from: 28, to: 50, spines: 9, rays: 0, h: [[0, 3], [0.2, 4.2], [1, 4]], notch: 0.3, rake: [30, 45] },
    { from: 51, to: 80, rays: 10, h: [[0, 4.5], [0.6, 8.5], [0.9, 11], [1, 9]], rake: [40, 75], smooth: true },
  ],
  anal: [{ from: 62, to: 80, spines: 3, rays: 8, h: [[0, 3], [0.6, 7.5], [0.9, 10], [1, 8]], rake: [35, 72] }],
  caudal: { type: 'rounded', len: 16, h: 11, rays: 14 },
  pectoral: { at: [30, 0.55], base: 4.5, h: [[0, 9], [0.4, 12], [1, 7]], angles: [-10, 45], rays: 12 },
  pelvic: { at: [32, 0.9], base: 3, h: [[0, 7.5], [1, 4.5]], angles: [30, 82], rays: 7 },
  eye: { x: 11, f: 0.3, r: 1.3, iris: '#C27A3A' },
  gill: { x: 28, bow: 3 },
  mouth: [[0.3, 0.5], [3, 0.57], [6.5, 0.6], [9, 0.57]],
  lips: 2.4,
  lipPaint: '#86A99A',
  mouthW: 1.8,
  scales: 9,
  lateral: (t) => 0.2 + 0.1 * t,
  belly: 0.88,
  extra: (c) => {
    const s = c.s;
    const rand = rng(91);
    // Head: wavy cream lines, tightly set across the forehead and looser over the cheek.
    const headLines: Line[] = [];
    for (let k = 0; k < 5; k++) {
      const f0 = 0.04 + k * 0.045;
      const x0 = 7.6 + k * 0.7;
      const pts: Pt[] = Array.from({ length: 9 }, (_, i) => atX(s, x0 + i * 1.7, f0 + Math.sin(i * 1.9 + k * 1.3) * 0.018 + i * 0.004));
      headLines.push({ pts: spline(pts, false), w: 0.95, o: 0.9 });
    }
    for (let k = 0; k < 4; k++) {
      const f0 = 0.5 + k * 0.08;
      const pts: Pt[] = Array.from({ length: 6 }, (_, i) => atX(s, 10 + rand() * 2.5 + i * 1.6, f0 + Math.sin(i * 1.8 + k * 2) * 0.025));
      headLines.push({ pts: spline(pts, false), w: 0.95, o: 0.75 });
    }
    const wavy: Fill[] = headLines.map((l) => ({ poly: [...l.pts, ...l.pts.slice().reverse().map(([x, y]) => [x + 0.15, y + 0.55] as Pt)], paint: '#E4D8AC', o: l.o, clip: 'trunk' }));
    const eye = atX(s, 11, 0.3);
    // Two dark lines run back from the eye.
    const eyeLines: Line[] = [
      { pts: spline([add(eye, [1.6, -0.6]), add(eye, [5, -2]), add(eye, [10, -2.4])], false), w: 2.8, taper: 'end' },
      { pts: spline([add(eye, [1.6, 0.8]), add(eye, [5, 2]), add(eye, [10.5, 2.2])], false), w: 2.8, taper: 'end' },
    ];
    // A short dark vertical bar on each scale.
    const bars: Fill[] = [];
    const t0 = tAtX(s, 30);
    for (let r = 0; r < 9; r++) {
      const f = 0.06 + (0.88 * (r + 0.5)) / 9;
      for (let k = 0; k < 22; k++) {
        const t = t0 + (1 - t0) * ((k + (r % 2) * 0.5) / 22);
        const a = at(s, t, f - 0.035);
        const b = at(s, t, f + 0.035);
        bars.push({ poly: [add(a, [-0.25, 0]), add(a, [0.25, 0]), add(b, [0.25, 0]), add(b, [-0.25, 0])], paint: 'dark', o: 0.24, clip: 'trunk' });
      }
    }
    return {
      marks: [...wavy, ...bars],
      lines: eyeLines,
      median: [{ part: 'caudal', marks: [{ poly: c.caudal.trailing.length > 1 ? [...c.caudal.trailing, ...c.caudal.trailing.slice().reverse().map(([x, y]) => [x - 1.3, y] as Pt)] : [], paint: 'light', o: 0.8 }] }],
    };
  },
};

// ── Bumphead parrotfish ──────────────────────────────────────────────────────
// A near-vertical bulbous forehead; exposed pale beak plates; huge mosaic scales; dark green body
// with a pale, pinkish front; square to concave tail.
const bumphead: FishSpec = {
  tip: [1.6, 5.4],
  blunt: 0.8,
  noseTilt: -0.4,
  // The bump overhangs the beak: a rounded wall bulging forward over the mouth.
  top: [[0.6, 2.4], [0, -1.6], [0.3, -6.4], [1.8, -10.8], [4.4, -14.6], [8, -17.4], [13, -19.2], [20, -20.2], [30, -20.4], [42, -19.2], [54, -16.4], [64, -12.6], [72, -9], [79, -7], [84, -6.5]],
  bot: [[2, 7], [4, 9], [8, 11.6], [14, 14.4], [24, 17.4], [34, 18.6], [44, 18.2], [54, 16.2], [64, 13], [72, 9.6], [79, 7.2], [84, 6.6]],
  dorsal: [{ from: 30, to: 81, spines: 9, rays: 10, h: [[0, 4], [0.1, 6], [0.8, 6], [1, 4]], notch: 0.2, rake: [30, 60] }],
  anal: [{ from: 63, to: 80, spines: 3, rays: 9, h: [[0, 3], [0.3, 6.5], [0.8, 6.5], [1, 3.6]], rake: [30, 60] }],
  caudal: { type: 'emarginate', len: 15, h: 12.5, rays: 14 },
  pectoral: { at: [29, 0.5], base: 4, h: [[0, 7], [0.4, 9], [1, 6]], angles: [-8, 40], rays: 11 },
  pelvic: { at: [32, 0.9], base: 3, h: [[0, 6.5], [1, 4]], angles: [30, 82], rays: 7 },
  eye: { x: 10.5, f: 0.2, r: 1.15, iris: '#B2783A' },
  gill: { x: 27, bow: 3 },
  scales: 8,
  scaleCols: 15,
  lateral: (t) => 0.22 + 0.05 * t,
  belly: 1.5,
  softBelly: false,
  extra: (c) => {
    const s = c.s;
    // The front of the head is pale and pinkish; the beak plates bare beneath it.
    // The pale, pinkish front fades back across the bump.
    const face = [3, 5.5, 8].map((x, i) => ({ poly: region(s, 0, tAtX(s, x), -0.05, 0.86), paint: '#D8C2B0' as const, o: [0.45, 0.3, 0.2][i], clip: 'trunk' as const }));
    const beakUpper = shapeIn(s, [[tAtX(s, 1.8), 0.6], [tAtX(s, 4.4), 0.6], [tAtX(s, 5.6), 0.72], [tAtX(s, 4), 0.8], [tAtX(s, 2), 0.78]]);
    const beakLower = shapeIn(s, [[tAtX(s, 2.2), 0.82], [tAtX(s, 4.2), 0.82], [tAtX(s, 6), 0.84], [tAtX(s, 4.6), 0.97], [tAtX(s, 2.6), 0.95]]);
    const nodules: Fill[] = Array.from({ length: 8 }, (_, i) => ({ poly: ellipse(atX(s, 2.6 + (i % 4) * 0.8, i < 4 ? 0.7 : 0.89), 0.32), paint: 'dark' as const, o: 0.35 }));
    return {
      tint: face,
      marks: [{ poly: beakUpper, paint: '#EDEADE', edge: 1 }, { poly: beakLower, paint: '#EDEADE', edge: 1 }, ...nodules],
    };
  },
};

// ── Giant trevally ───────────────────────────────────────────────────────────
// A steep, blunt forehead; deep compressed body with sickle-shaped dorsal and anal lobes; a row
// of bony scutes along the straight rear of the lateral line; a long sickle pectoral; a deeply
// forked tail.
const trevallyLL = (t: number) => (t < 0.55 ? 0.42 - 0.14 * Math.sin((Math.PI * t) / 0.55) : 0.42);
const trevally: FishSpec = {
  tip: [0, 1.2],
  blunt: 0.7,
  top: [[0.6, -1.4], [2, -4.5], [4.5, -8], [8, -11], [13, -13.4], [20, -14.6], [30, -14.8], [40, -14], [50, -12], [60, -9], [68, -6], [74, -3.4], [78, -1.8], [80, -1.4]],
  bot: [[1, 2.6], [4, 4.4], [8, 6.6], [14, 9], [22, 11.6], [32, 12.8], [42, 12.4], [52, 10.4], [60, 7.6], [67, 4.8], [73, 2.6], [78, 1.5], [80, 1.3]],
  dorsal: [
    { from: 32, to: 40, spines: 8, rays: 0, h: [[0, 3], [0.2, 4.4], [1, 2]], notch: 0.35, rake: [30, 50] },
    { from: 42, to: 78, rays: 22, h: [[0, 12], [0.1, 9], [0.28, 4], [1, 2.4]], rake: [40, 62] },
  ],
  anal: [{ from: 55, to: 78, rays: 17, h: [[0, 10], [0.14, 7], [0.36, 3.4], [1, 2.2]], rake: [40, 62] }],
  caudal: { type: 'forked', len: 20, h: 14, fork: 0.22, rays: 16 },
  pectoral: { at: [27, 0.58], base: 2.6, h: [[0, 26], [0.12, 22], [0.5, 8], [1, 3]], angles: [10, 58], rays: 12, smooth: false },
  pelvic: { at: [31, 0.96], base: 1.6, h: 5, angles: [45, 65], rays: 6 },
  eye: { x: 9, f: 0.36, r: 1.25, iris: '#C9B04A' },
  gill: { x: 24, bow: 2.6 },
  mouth: [[0.5, 0.62], [5, 0.66], [8.4, 0.6]],
  lateral: trevallyLL,
  belly: 0.6,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    // Scutes: overlapping shields along the straight part of the lateral line.
    const scutes: Fill[] = [];
    for (let x = 56; x < 80; x += 1.2) {
      const p = atX(s, x, 0.42);
      scutes.push({ poly: [add(p, [-0.6, -0.9]), add(p, [0.7, 0]), add(p, [-0.6, 0.9]), add(p, [-0.2, 0])], paint: 'back', edge: 0.6 });
    }
    return { marks: scutes };
  },
};

// ── Great barracuda ──────────────────────────────────────────────────────────
// A long, slim body; a jutting lower jaw with fangs; black blotches on the lower flank; dark bars
// only above the lateral line; a black, white-tipped forked tail with a scalloped edge.
const barracudaBody = {
  tip: [0, 0.8] as Pt,
  blunt: 0.05,
  top: [[1, -0.5], [4, -1.8], [8, -3], [13, -4.2], [18, -5], [25, -5.6], [35, -5.9], [45, -5.8], [55, -5.4], [65, -4.4], [75, -3], [82, -2], [85, -1.8]] as [number, number][],
  bot: [[1, 1.6], [4, 2.6], [8, 3.6], [13, 4.6], [20, 5.4], [30, 5.8], [40, 5.9], [50, 5.7], [60, 5], [70, 3.8], [78, 2.6], [83, 1.9], [85, 1.8]] as [number, number][],
  dorsal: [
    { from: 38, to: 43, spines: 5, rays: 0, h: [[0, 6], [1, 2.4]] as [number, number][], notch: 0.2, rake: [30, 55] as [number, number] },
    { from: 64.5, to: 69, rays: 9, h: [[0, 5], [1, 1.5]] as [number, number][], rake: [40, 60] as [number, number] },
  ],
  anal: [{ from: 65.5, to: 70.5, rays: 9, h: [[0, 4.5], [1, 1.4]] as [number, number][], rake: [40, 60] as [number, number] }],
  pectoral: { at: [27, 0.6] as [number, number], base: 2, h: [[0, 8], [0.5, 7], [1, 4]] as [number, number][], angles: [15, 45] as [number, number], rays: 10 },
  pelvic: { at: [38, 0.95] as [number, number], base: 2, h: 5, angles: [40, 60] as [number, number], rays: 6 },
  eye: { x: 15, f: 0.4, r: 1.25, iris: '#C9B04A' as const },
  gill: { x: 26, bow: 2.4 },
  mouth: [[0.6, 0.66], [7, 0.6], [12.4, 0.54]] as [number, number][],
  lateral: 0.42,
  belly: 0.55,
  engraving: 'smooth' as const,
};
const fangs = (c: FishCtx, n: number, size: number): Fill[] =>
  Array.from({ length: n }, (_, i) => {
    const x = 1.6 + i * (10 / n);
    const p = atX(c.s, x, 0.62 - i * 0.008);
    const up = i % 2 === 0;
    const k = size * (i % 3 === 0 ? 1.4 : 0.9);
    return { poly: [add(p, [-0.25, 0]), add(p, [0.1, up ? k : -k]), add(p, [0.3, 0])], paint: 'light', edge: 0.6 } as Fill;
  });
const greatBarracuda: FishSpec = {
  ...barracudaBody,
  caudal: { type: 'scalloped', len: 15, h: 9.5, fork: 0.5, rays: 14, paint: 'dark' },
  extra: (c) => {
    const s = c.s;
    const bars: Fill[] = [];
    for (let x = 18; x < 82; x += 3.2) bars.push(bar(s, tAtX(s, x), 0.012, 0.03, 0.4, 'pattern', c.rand, 0.75, -0.06));
    const blotches: Fill[] = [];
    for (let k = 0; k < 14; k++) {
      const x = 30 + c.rand() * 52;
      blotches.push({ poly: blob(atX(s, x, 0.62 + c.rand() * 0.28), 0.7 + c.rand() * 0.6, 0.3, c.rand, 7), paint: 'ink', o: 0.9, clip: 'trunk' });
    }
    return {
      marks: [...bars, ...blotches, ...fangs(c, 8, 1.2)],
      median: [{ part: 'caudal', marks: [{ poly: ellipse(c.caudal.trailing[0], 2, 1.4), paint: 'light' }, { poly: ellipse(c.caudal.trailing[c.caudal.trailing.length - 1], 2, 1.4), paint: 'light' }] }],
    };
  },
};

// ── Chevron (blackfin) barracuda ─────────────────────────────────────────────
// Bent chevron bars crossing the lateral line down the whole flank; a mostly black forked tail
// with a scalloped centre; dark fins; slender, no blotches.
const chevronBarracuda: FishSpec = {
  ...barracudaBody,
  top: barracudaBody.top.map(([x, y]) => [x, y * 0.92] as [number, number]),
  bot: barracudaBody.bot.map(([x, y]) => [x, y * 0.92] as [number, number]),
  dorsal: barracudaBody.dorsal.map((d) => ({ ...d, paint: 'dark' as const })),
  anal: barracudaBody.anal.map((d) => ({ ...d, paint: 'dark' as const })),
  caudal: { type: 'scalloped', len: 15, h: 9.5, fork: 0.62, rays: 14, paint: 'dark' },
  extra: (c) => {
    const s = c.s;
    const chevrons: Fill[] = [];
    for (let x = 18; x < 82; x += 3.1) {
      const t = tAtX(s, x);
      // Oblique above the lateral line, nearly upright below it.
      const pts: Pt[] = [at(s, t - 0.012, 0.02), at(s, t + 0.012, 0.42), at(s, t + 0.012, 0.95), at(s, t + 0.026, 0.95), at(s, t + 0.026, 0.42), at(s, t + 0.002, 0.02)];
      chevrons.push({ poly: pts, paint: 'pattern', o: 0.75, clip: 'trunk' });
    }
    return { marks: [...chevrons, ...fangs(c, 7, 0.9)] };
  },
};

// ── Tarpon ───────────────────────────────────────────────────────────────────
// Huge, mirror-like scales; an upturned mouth with a jutting lower jaw; a long filament off the
// last dorsal ray; a single dorsal mid-body; a deeply forked tail.
const tarpon: FishSpec = {
  // The lower jaw juts past the upper and the mouth slopes up at the front.
  tip: [0, 1.7],
  blunt: 0.35,
  top: [[1, -1], [2.5, -2.3], [4.5, -3.9], [7, -5.7], [10, -7.8], [14, -9.9], [22, -11.6], [32, -12], [42, -11.6], [52, -10.4], [62, -8.4], [70, -6], [76, -3.6], [80, -2.6]],
  bot: [[0.2, 2.9], [1.2, 4.1], [3.5, 5.7], [7, 7.6], [10, 8.9], [16, 10.6], [24, 11.7], [34, 12], [44, 11.6], [54, 10.4], [63, 8.2], [70, 5.6], [76, 3.4], [80, 2.6]],
  dorsal: [{ from: 45, to: 53, rays: 13, h: [[0, 11], [0.25, 9], [0.8, 3], [1, 2.5]], rake: [25, 60] }],
  anal: [{ from: 61, to: 74, rays: 20, h: [[0, 8], [0.2, 6], [0.5, 2.5], [1, 1.6]], rake: [35, 60] }],
  caudal: { type: 'forked', len: 20, h: 15, fork: 0.28, rays: 16 },
  pectoral: { at: [22, 0.84], base: 2, h: [[0, 9], [1, 5]], angles: [10, 40], rays: 10 },
  pelvic: { at: [41, 0.96], base: 2, h: 6, angles: [35, 60], rays: 7 },
  eye: { x: 7.5, f: 0.36, r: 1.4, iris: '#C9B04A' },
  gill: { x: 21, bow: 3 },
  mouth: [[0.3, 0.4], [4.5, 0.46], [9.6, 0.56]],
  mouthW: 2,
  lips: 1.3,
  lipPaint: '#B7C3C8',
  scales: 8,
  scaleCols: 17,
  lateral: (t) => 0.48 + 0.04 * Math.sin(Math.min(1, t * 3) * Math.PI),
  belly: 0.5,
  extra: (c) => {
    const s = c.s;
    // The filament trails from the last ray, following the line of the back.
    const tips = c.dorsal[0].tips;
    const last = tips[tips.length - 1];
    const filament = spline(
      [0, 4, 9, 15, 21].map((dx, i) => [last[0] + dx, Math.min(last[1], atX(s, Math.min(79, last[0] + dx), 0)[1] - 3.4 + i * 0.1)] as Pt).map((p, i) => (i === 0 ? last : p)),
      false,
    );
    return {
      lines: [
        { pts: filament, w: 1.4, taper: 'end' },
        { pts: spline([atX(s, 1, 0.62), atX(s, 4.5, 0.78), atX(s, 8.5, 0.86)], false), w: 0.9 },
      ],
    };
  },
};

// ── Yellowfin tuna ───────────────────────────────────────────────────────────
// Very long, yellow, sickle-shaped second dorsal and anal; yellow, black-edged finlets; a tuna
// spindle with a lunate tail and keels; a golden side band and broken white belly lines.
const tunaBody = {
  tip: [0, 0.4] as Pt,
  blunt: 0.25,
  top: [[1, -1.2], [3, -2.8], [6, -4.8], [10, -7], [15, -9], [22, -11], [30, -12.2], [38, -12.4], [46, -11.6], [54, -9.6], [62, -7], [70, -4.4], [77, -2.4], [82, -1.4], [85, -1.2]] as [number, number][],
  bot: [[1, 1.4], [3, 2.8], [6, 4.6], [10, 6.6], [16, 8.8], [24, 10.6], [32, 11.6], [40, 11.8], [48, 11], [56, 9], [64, 6.4], [71, 4], [78, 2.2], [82, 1.3], [85, 1.1]] as [number, number][],
  caudal: { type: 'lunate' as const, len: 15, h: 15, fork: 0.28, rays: 14 },
  pelvic: { at: [28, 0.96] as [number, number], base: 1.5, h: 4, angles: [40, 65] as [number, number], rays: 5 },
  gill: { x: 24, bow: 3 },
  belly: 0.55,
  engraving: 'smooth' as const,
};
const keels = (c: FishCtx): Line[] => [
  { pts: lineAlong(c.s, 0.5, tAtX(c.s, 78), 1), w: 1.3 },
  { pts: lineAlong(c.s, 0.38, tAtX(c.s, 80), 1), w: 0.7, detail: true },
  { pts: lineAlong(c.s, 0.62, tAtX(c.s, 80), 1), w: 0.7, detail: true },
];
const yellowfin: FishSpec = {
  ...tunaBody,
  dorsal: [
    { from: 30, to: 44, spines: 13, rays: 0, h: [[0, 8], [0.15, 7], [1, 1.5]], notch: 0.3, rake: [30, 60], paint: 'dark' },
    { from: 47, to: 53, rays: 12, h: [[0, 18], [0.2, 13], [1, 2]], rake: [42, 72], paint: 'accent' },
  ],
  anal: [{ from: 52, to: 57.5, rays: 11, h: [[0, 16], [0.2, 11], [1, 2]], rake: [42, 72], paint: 'accent' }],
  pectoral: { at: [26, 0.42], base: 2, h: [[0, 22], [0.4, 16], [1, 4]], angles: [4, 38], rays: 10, smooth: false },
  eye: { x: 9.5, f: 0.42, r: 1.2, iris: '#C9B04A' },
  mouth: [[0.5, 0.56], [4, 0.6], [6.5, 0.56]],
  extra: (c) => {
    const s = c.s;
    const bandY = region(s, tAtX(s, 10), 0.98, (t) => 0.36 + 0.02 * t, (t) => 0.44 + 0.02 * t);
    const lines: Fill[] = [];
    for (let x = 36; x < 76; x += 2) {
      const t = tAtX(s, x);
      let f = 0.72 + c.rand() * 0.05;
      while (f < 0.95) {
        const l = 0.04 + c.rand() * 0.05;
        lines.push({ poly: [at(s, t - 0.002, f), at(s, t + 0.002, f), at(s, t + 0.002, f + l), at(s, t - 0.002, f + l)], paint: 'light', o: 0.9, clip: 'trunk' });
        f += l + 0.03;
      }
    }
    return {
      tint: [{ poly: bandY, paint: 'accent', o: 0.6, clip: 'trunk' }],
      marks: lines,
      lines: keels(c),
      near: [...finlets(c, 58, 83, 8, 'top', 2.2), ...finlets(c, 60, 83, 7, 'bot', 2)],
    };
  },
};

// ── Dogtooth tuna ────────────────────────────────────────────────────────────
// A large mouth with big visible conical teeth; a wavy lateral line; a plain dark-and-silver body;
// short, white-tipped second dorsal and anal; a short pectoral.
const dogtooth: FishSpec = {
  ...tunaBody,
  top: tunaBody.top.map(([x, y]) => [x, y * 0.86] as [number, number]),
  bot: tunaBody.bot.map(([x, y]) => [x, y * 0.86] as [number, number]),
  blunt: 0.12,
  dorsal: [
    { from: 28, to: 47, spines: 15, rays: 0, h: [[0, 8], [0.1, 7], [1, 1.4]], notch: 0.3, rake: [30, 60] },
    { from: 50, to: 55, rays: 10, h: [[0, 6], [0.3, 4.4], [1, 1.6]], rake: [40, 65] },
  ],
  anal: [{ from: 55, to: 60, rays: 10, h: [[0, 5.5], [0.3, 4], [1, 1.5]], rake: [40, 65] }],
  pectoral: { at: [26, 0.44], base: 2, h: [[0, 11], [0.4, 9], [1, 3]], angles: [6, 40], rays: 9 },
  eye: { x: 9.8, f: 0.42, r: 1.25, iris: '#B9B9B0' },
  mouth: [[0.4, 0.6], [5, 0.64], [9.8, 0.6]],
  lateral: (t) => 0.3 + 0.025 * Math.sin(t * 46) * Math.min(1, t * 2),
  extra: (c) => {
    const s = c.s;
    const teeth: Fill[] = Array.from({ length: 8 }, (_, i) => {
      const p = atX(s, 1.8 + i * 1, 0.62);
      const up = i % 2 === 0;
      return { poly: [add(p, [-0.3, 0]), add(p, [0, up ? 1.2 : -1.1]), add(p, [0.3, 0])], paint: 'light', edge: 0.6 } as Fill;
    });
    return {
      marks: teeth,
      lines: keels(c),
      near: [...finlets(c, 58, 82, 7, 'top', 2), ...finlets(c, 61, 82, 6, 'bot', 1.8)].map((p) => ({ ...p, paint: 'dark' as const })),
      median: [
        { part: 'dorsal', index: 0, marks: [{ poly: c.dorsal[0].le.length > 1 ? [...c.dorsal[0].le, ...c.dorsal[0].le.slice().reverse().map(([x, y]) => [x + 1, y + 0.4] as Pt)] : [], paint: 'ink', o: 0.85 }] },
        { part: 'dorsal', index: 1, marks: [{ poly: ellipse(c.dorsal[1].apex, 1.4, 1), paint: 'light' }] },
        { part: 'anal', marks: [{ poly: ellipse(c.anal[0].apex, 1.4, 1), paint: 'light' }] },
      ],
    };
  },
};

// ── Sailfish ─────────────────────────────────────────────────────────────────
// A sail-like first dorsal taller than the body is deep; a long round bill; ribbon pelvic fins;
// rows of blue spot-bars; a lunate tail.
const sailfish: FishSpec = {
  tip: [0, -0.4],
  blunt: 0,
  top: [[3, -0.65], [8, -0.95], [13, -1.3], [16, -1.9], [18.5, -3.1], [21, -4.6], [25, -5.8], [32, -6.6], [40, -7], [50, -6.8], [60, -6], [70, -4.6], [78, -3.2], [84, -2], [87, -1.6]],
  bot: [[3, 0.2], [8, 0.4], [13, 0.6], [16, 0.9], [18.5, 2.2], [22, 4], [28, 5.6], [36, 6.6], [46, 6.8], [56, 6.2], [66, 5], [75, 3.4], [82, 2], [87, 1.6]],
  dorsal: [
    { from: 23, to: 70, rays: 38, h: [[0, 10], [0.1, 17], [0.42, 21], [0.7, 17], [0.92, 7], [1, 2]], rake: [10, 42], paint: 'accent' },
    { from: 78.5, to: 80.5, rays: 4, h: 1.6, rake: [40, 60] },
  ],
  anal: [
    { from: 60, to: 65, rays: 8, h: [[0, 5], [1, 1.2]], rake: [35, 60] },
    { from: 79, to: 81, rays: 4, h: 1.4, rake: [40, 60] },
  ],
  caudal: { type: 'lunate', len: 13, h: 14, fork: 0.25, rays: 14 },
  pectoral: { at: [25, 0.72], base: 1.6, h: [[0, 10], [0.4, 8], [1, 3]], angles: [15, 45], rays: 8, smooth: false },
  eye: { x: 21.5, f: 0.4, r: 1.15, iris: '#C9B04A' },
  gill: { x: 30, bow: 2 },
  mouth: [[16.2, 0.62], [19, 0.6], [21, 0.56]],
  belly: 0.5,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const spots: Fill[] = [];
    for (let x = 30; x < 82; x += 2.6) {
      for (let f = 0.15; f < 0.85; f += 0.12) spots.push({ poly: ellipse(atX(s, x + (c.rand() - 0.5) * 0.5, f + (c.rand() - 0.5) * 0.04), 0.42), paint: '#7FB4DE', o: 0.95, clip: 'trunk' });
    }
    // Pelvic fins: two long ribbons.
    const root = atX(s, 25.5, 0.98);
    const ribbon: Part = { poly: spline([root, add(root, [9, 6]), add(root, [21, 8.6]), add(root, [21.6, 9.4]), add(root, [9, 7.2]), add(root, [0.8, 0.8])], true), paint: 'fin', lines: [], edge: 0.7 };
    return {
      marks: spots,
      lines: keels(c),
      near: [ribbon],
      median: [{ part: 'dorsal', index: 0, marks: scatterIn(c.dorsal[0].poly, { r: 0.45, gap: 1.5, paint: 'ink', rand: c.rand, tries: 400, o: 0.75 }).filter((f) => f.poly.every(([x, y]) => y < at(s, tAtX(s, x), 0)[1] - 0.5)) }],
    };
  },
};

// ── Ocean sunfish ────────────────────────────────────────────────────────────
// A truncated disc body; tall dorsal and anal blades set opposite each other; a scalloped clavus
// instead of a tail; a tiny beak mouth; a small pectoral with a gill hole in front.
const mola: FishSpec = {
  tip: [0, 1],
  blunt: 0.9,
  top: [[0.5, -4], [2.5, -12], [6, -19], [12, -25], [20, -29.5], [30, -32], [42, -32.5], [54, -31], [64, -28], [72, -24.5], [80, -21.5]],
  bot: [[0.5, 5], [2.5, 13], [6, 20], [12, 26], [20, 30.5], [30, 33], [42, 33.5], [54, 32], [64, 29], [72, 25.5], [80, 22.5]],
  dorsal: [{ from: 60, to: 71, rays: 10, h: [[0, 38], [0.35, 44], [1, 12]], rake: [18, 46] }],
  anal: [{ from: 60, to: 71, rays: 10, h: [[0, 38], [0.35, 44], [1, 12]], rake: [18, 46] }],
  caudal: { type: 'clavus', len: 13, h: 22, rays: 14 },
  pectoral: { at: [27, 0.44], base: 3, h: [[0, 6], [0.5, 8], [1, 6]], angles: [-30, 30], rays: 8 },
  eye: { x: 14, f: 0.44, r: 1.9, iris: '#9AA0A3' },
  lateral: false,
  belly: 0.7,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const rand = rng(31);
    const stipple: Line[] = [];
    for (let k = 0; k < 360; k++) {
      const p = at(s, 0.05 + rand() * 0.94, 0.04 + rand() * 0.92);
      stipple.push({ pts: [p, add(p, [0.3, 0.2])], w: 0.9, o: 0.4, detail: true });
    }
    const blotches = scatter(s, { t0: 0.15, t1: 0.95, f0: 0.1, f1: 0.85, r: 3, gap: 4, paint: 'light', rand, tries: 60, o: 0.3, wobble: 0.4 });
    return {
      marks: [...blotches, { poly: ellipse(atX(s, 0.6, 0.5), 0.9, 0.7), paint: 'ink' }, { poly: ellipse(atX(s, 25, 0.44), 0.9, 1.3), paint: 'ink', o: 0.85 }],
      lines: stipple,
    };
  },
};
void band;
void lerp;

export const BIG_FISH: Record<string, PlateDef> = {
  'giant-grouper': F(giantGrouper, { back: '#4A463A', belly: '#6E6A5A', fin: '#C9A23A' }, 1),
  'goliath-grouper': F(goliath, { back: '#7A6A40', belly: '#9A8A5E', fin: '#7A6A40' }, 2),
  'potato-cod': F(potato, { back: '#A8A397', belly: '#C9C5BA', fin: '#8D887B', dark: '#3E3B33', pattern: '#5E5A50' }, 3),
  'napoleon-wrasse': F(napoleon, { back: '#2F6F64', belly: '#4F8F8A', fin: '#3F7E86', dark: '#1F4A44' }, 4),
  'bumphead-parrotfish': F(bumphead, { back: '#3B5E50', belly: '#5C7E6E', fin: '#3B5E50' }, 5),
  'giant-trevally': F(trevally, { back: '#4A5258', belly: '#D9DCDB', fin: '#3C4044' }, 6),
  'great-barracuda': F(greatBarracuda, { back: '#4C5D63', belly: '#D5DBDE', fin: '#5A6A70', pattern: '#3A474C', dark: '#262C2F' }, 7),
  'chevron-barracuda': F(chevronBarracuda, { back: '#4D5A66', belly: '#C9CFD4', fin: '#3A424A', pattern: '#3B4650', dark: '#1C2125' }, 8),
  tarpon: F(tarpon, { back: '#566F7D', belly: '#DCE2E5', fin: '#66767E' }, 9),
  'yellowfin-tuna': F(yellowfin, { back: '#1C2E4C', belly: '#C9CFD3', fin: '#3A4A64', accent: '#F2C200', dark: '#2A3A56' }, 10),
  'dogtooth-tuna': F(dogtooth, { back: '#1F2B39', belly: '#D2D7DB', fin: '#2E3A48', dark: '#2A3442' }, 11),
  sailfish: F(sailfish, { back: '#1F3358', belly: '#DCE1E4', fin: '#2E4470', accent: '#23386A' }, 12),
  'mola-mola': F(mola, { back: '#7E868B', belly: '#C8CDCF', fin: '#5E6467' }, 13),
};
