/**
 * Marine mammals, side on, head to the left (1% of total length per unit, snout at x = 0, fluke
 * or flipper tips at x = 100). The flukes are tilted towards the viewer so their shape shows.
 */
import { add, blob, type Ctrl, ellipse, lerp, mul, norm, perp, type Pt, rng, spline, sub, yAt } from '../kit';
import { curveIn, scatter, shapeIn } from '../marks';
import { tube } from '../ray';
import type { PlateDef } from '../registry';
import { shark, type SharkCtx, type SharkSpec } from '../shark';
import { at, atX, finTip, lineAlong, region, tAtX } from '../side';
import { emptyGeom, type Fill, type Line, type Part, type PlateGeom } from '../types';

const noGills = { n: 0, x: 0, step: 0, f0: 0, f1: 0 };
const flukes = (ped: number, up: number, down: number, fork = 96): SharkSpec['caudal'] => ({
  upper: [99, -up],
  lower: [99.6, down],
  fork: [fork, 0.3],
  notch: 0,
  upperBow: 0.1,
  lowerBow: 0.1,
  trail: 0.14,
  lowerTrail: 0.14,
});
const mouth = (pts: [number, number][]) => pts;

/**
 * A seal's hind flippers held together behind it like a tail: two webbed fans, the far one above,
 * each with five long digits whose tips scallop the trailing edge.
 */
function hindFlippers(c: SharkCtx, len: number, spread: number): { far: Part[]; near: Part[] } {
  const s = c.s;
  const base = at(s, 1, 0.5);
  const fan = (dir: number, w: number): Part => {
    const tip: Pt = add(base, [len, dir * spread]);
    const axis = norm(sub(tip, base));
    const n = perp(axis);
    const pts: Ctrl[] = [add(base, mul(n, w * 0.35)), add(lerp(base, tip, 0.45), mul(n, w * 0.55))];
    // Digit tips across the end, with a small notch between each.
    for (let k = 0; k < 5; k++) {
      const off = (0.5 - k / 4) * w;
      const reach = 1 - Math.abs(0.5 - k / 4) * 0.25;
      const p = add(add(base, mul(axis, len * reach)), mul(n, off));
      pts.push([p[0], p[1], 1]);
      if (k < 4) pts.push(add(add(base, mul(axis, len * (reach - 0.12))), mul(n, off - w / 8)));
    }
    pts.push(add(lerp(base, tip, 0.45), mul(n, -w * 0.55)), add(base, mul(n, -w * 0.35)));
    const poly = spline(pts, true, 0.8);
    const lines: Line[] = [0.25, 0.5, 0.75].map((k) => ({ pts: [add(base, mul(axis, len * 0.15)), add(add(base, mul(axis, len * 0.85)), mul(n, (0.5 - k) * w))], w: 0.65, taper: 'end' }));
    return { poly, paint: 'fin', lines, edge: 0.85 };
  };
  return { far: [fan(-1, len * 0.5)], near: [fan(1, len * 0.55)] };
}
/** The whole part (a flipper) washed in another colour. */
const wash = (shape: { poly: Pt[] }, paint: Fill['paint'], o = 1): Fill => ({ poly: shape.poly, paint, o });

// ── Bottlenose dolphin ───────────────────────────────────────────────────────
// Short, stubby beak with a clear crease against the rounded melon; tall falcate dorsal fin mid
// back; robust, thick-set body; soft three-zone grey with no hard pattern.
const bottlenose: SharkSpec = {
  kind: 'mammal',
  tip: [0, 0.2],
  blunt: 0.4,
  top: [[2, -1.1], [4.6, -1.7], [6, -3], [8, -5.6], [11, -7.8], [15, -9.4], [22, -10.6], [30, -11.2], [38, -11.2], [48, -10], [58, -7.6], [66, -5.2], [74, -3.4], [80, -2.4], [84, -1.9]],
  bot: [[1, 1.3], [4, 1.9], [8, 3.2], [12, 5], [18, 7.4], [26, 9.2], [36, 9.8], [46, 9.2], [56, 7.4], [64, 5.4], [72, 3.4], [80, 2.2], [84, 1.8]],
  d1: { at: 42, base: 13, h: 9.5, sweep: 0.95, rear: 4, rearLift: 1, concave: 0.25, convex: 0.12, round: 0.6 },
  pec: { at: [21, 0.75], base: 4, len: 15, angle: 40, width: 0.35, concave: 0.12, round: 0.5 },
  caudal: flukes(84, 8.5, 12),
  eye: { x: 12.5, f: 0.5, r: 0.7 },
  gills: noGills,
  mouth: mouth([[0.4, 0.58], [5, 0.62], [8.6, 0.6], [9.8, 0.5]]),
  belly: (t) => 0.66 - 0.04 * Math.sin(t * 3),
  softBelly: true,
  extra: (c) => {
    const s = c.s;
    // The cape: darker over the back, dipping lowest under the dorsal fin.
    const cape = region(s, 0.05, 1, -0.02, (t) => 0.3 + 0.12 * Math.exp(-(((t - 0.52) / 0.18) ** 2)));
    return {
      tint: [{ poly: cape, paint: 'dark', o: 0.28, clip: 'trunk' }],
      lines: [
        { pts: curveIn(s, [[tAtX(s, 5.2), 0.12], [tAtX(s, 5.8), 0.3], [tAtX(s, 6.4), 0.46]]), w: 1 },
        { pts: curveIn(s, [[tAtX(s, 13), 0.55], [tAtX(s, 17), 0.62], [tAtX(s, 21), 0.7]]), w: 0.7, o: 0.6, taper: 'both' },
        { pts: curveIn(s, [[tAtX(s, 14.4), 0.02], [tAtX(s, 15), 0.0], [tAtX(s, 15.6), 0.02]]), w: 1 },
      ],
    };
  },
};

// ── Spinner dolphin ──────────────────────────────────────────────────────────
// Long, thin, black-tipped beak; upright triangular dorsal fin; three-tone banding (dark cape,
// grey side panel, white belly); slender body.
const spinner: SharkSpec = {
  kind: 'mammal',
  tip: [0, 0.1],
  blunt: 0.2,
  top: [[2, -0.7], [5, -1], [8, -1.5], [10, -2.4], [12.5, -4.2], [16, -5.9], [22, -7.4], [30, -8.2], [40, -8.4], [50, -7.6], [60, -5.8], [68, -4], [76, -2.6], [82, -1.8], [85, -1.5]],
  bot: [[2, 0.8], [6, 1.2], [10, 1.8], [14, 3.2], [20, 5], [28, 6.8], [38, 7.6], [48, 7.2], [58, 5.6], [66, 4], [74, 2.6], [82, 1.6], [85, 1.4]],
  d1: { at: 43, base: 11, h: 9.5, sweep: 0.55, rear: 2, concave: 0.05, convex: 0.05, round: 0.4 },
  pec: { at: [22, 0.74], base: 3.2, len: 12, angle: 42, width: 0.3, concave: 0.1, round: 0.3 },
  caudal: flukes(85, 7.5, 10),
  eye: { x: 14.5, f: 0.5, r: 0.6 },
  gills: noGills,
  mouth: mouth([[0.4, 0.55], [7, 0.6], [10.6, 0.58], [11.4, 0.48]]),
  belly: (t) => 0.7 - 0.2 * Math.max(0, 1 - t * 4),
  softBelly: false,
  extra: (c) => {
    const s = c.s;
    const cape = region(s, 0.06, 1, -0.02, (t) => 0.32 + 0.12 * Math.exp(-(((t - 0.52) / 0.16) ** 2)));
    const panel = region(s, 0.1, 1, (t) => 0.32 + 0.12 * Math.exp(-(((t - 0.52) / 0.16) ** 2)), (t) => 0.7 - 0.2 * Math.max(0, 1 - t * 4));
    const beakTip = region(s, 0, tAtX(s, 3.2), -0.05, 1.05);
    const patch = { poly: ellipse(atX(s, 14.5, 0.5), 1.8, 1.1, 8), paint: 'ink' as const, o: 0.75, clip: 'trunk' as const };
    return {
      tint: [
        { poly: panel, paint: '#8E979E', o: 0.8, clip: 'trunk' },
        { poly: cape, paint: 'dark', o: 0.55, clip: 'trunk' },
      ],
      marks: [{ poly: beakTip, paint: 'ink', o: 0.85, clip: 'trunk' }, patch],
      lines: [{ pts: curveIn(s, [[tAtX(s, 15), 0.55], [tAtX(s, 18.5), 0.64], [tAtX(s, 22), 0.72]]), w: 1.4, o: 0.75, taper: 'both' }],
    };
  },
};

// ── Humpback whale ───────────────────────────────────────────────────────────
// Enormous wing-like flippers, about a third of the body, with a knobbed leading edge; knobs on
// the head and lower jaw; a small dorsal fin on a hump two-thirds back; notched, ragged flukes;
// throat pleats.
const humpback: SharkSpec = {
  kind: 'mammal',
  tip: [0, 0],
  blunt: 0.5,
  top: [[1, -1.4], [4, -2.6], [9, -3.6], [15, -4.6], [21, -6.4], [27, -9], [34, -11], [42, -11.4], [52, -10.4], [60, -8.8], [66, -7], [72, -5], [78, -3.6], [83, -2.6], [86, -2.2]],
  bot: [[1, 1.8], [4, 4.2], [9, 6.8], [15, 9], [22, 11], [30, 12.2], [38, 12.4], [46, 11.4], [55, 9.2], [63, 6.8], [71, 4.6], [78, 3.2], [83, 2.4], [86, 2.1]],
  d1: { at: 61, base: 6, h: 3.2, sweep: 0.75, rear: 1.5, round: 1, convex: 0.2, concave: 0.05 },
  knuckles: { at: [70, 73.5, 77], base: 2, h: 0.7 },
  pec: { at: [29, 0.72], base: 5, len: 33, angle: 50, width: 0.17, convex: 0.05, concave: 0.03, round: 1.4, rear: 0.04 },
  caudal: { upper: [99, -11.5], lower: [99.6, 15], fork: [95.8, 0.4], notch: 0, upperBow: 0.12, lowerBow: 0.12, trail: 0.16, lowerTrail: 0.16 },
  eye: { x: 25.5, f: 0.47, r: 0.7 },
  gills: noGills,
  mouth: mouth([[0.8, 0.45], [8, 0.5], [16, 0.48], [22, 0.42], [24.4, 0.45]]),
  belly: 0.7,
  softBelly: true,
  extra: (c) => {
    const s = c.s;
    const rand = rng(61);
    // Throat pleats from the chin back along the underside.
    const pleats: Line[] = [0.62, 0.68, 0.74, 0.8, 0.86, 0.92, 0.97].map((f, i) => ({
      pts: lineAlong(s, (t) => f + 0.02 * Math.sin(t * 9), tAtX(s, 4 + i * 0.6), tAtX(s, 44 - i * 1.5)),
      w: 0.8,
      taper: 'both',
    }));
    // Knobs (tubercles) on the head and along the lower jaw.
    const knobs: Fill[] = [];
    for (let k = 0; k < 12; k++) knobs.push({ poly: ellipse(atX(s, 3 + k * 1.4, 0.08 + rand() * 0.14), 0.5 + rand() * 0.25), paint: 'back', edge: 0.8 });
    for (let k = 0; k < 7; k++) knobs.push({ poly: ellipse(atX(s, 2 + k * 1.6, 0.6 + rand() * 0.05), 0.45), paint: 'back', edge: 0.8 });
    // The flipper is white, its leading edge scalloped with bumps.
    const lead = c.pec.le;
    const bumps: Fill[] = [];
    for (let k = 1; k < 9; k++) {
      const p = lead[Math.floor((k / 10) * (lead.length - 1))];
      bumps.push({ poly: ellipse(p, 0.75), paint: 'light', edge: 0.8 });
    }
    const barnacles: Fill[] = [0.3, 0.45, 0.62].map((f, i) => ({ poly: blob(atX(s, 3.5 + i * 1.6, f + 0.25), 0.6, 0.3, rand, 7), paint: '#B9B2A3', edge: 0.6 }));
    return {
      marks: [...knobs, ...barnacles],
      lines: pleats,
      median: [{ fin: 'pec', marks: [wash(c.pec, 'light', 0.92), ...bumps] }, { fin: 'caudal', marks: [finTip(c.caudal.lower, 0.4, 'light', 0.6)] }],
    };
  },
};

// ── Sperm whale ──────────────────────────────────────────────────────────────
// A huge squared block head, a third of the body; a narrow underslung lower jaw; a low hump and
// knuckles instead of a dorsal fin; wrinkled skin; broad triangular flukes.
const sperm: SharkSpec = {
  kind: 'mammal',
  tip: [0, -1.5],
  blunt: 1,
  top: [[0.3, -6], [1.6, -9.2], [5, -10.3], [14, -10.7], [24, -10.7], [30, -10.3], [34, -9.4], [42, -9], [52, -8.6], [60, -8.2], [68, -6], [76, -4.2], [83, -2.8], [87, -2.2]],
  bot: [[0.4, 4.6], [2, 7.4], [6, 8.6], [14, 9.2], [24, 9.6], [34, 9.6], [44, 9.2], [54, 8], [64, 6.2], [72, 4.4], [80, 3], [87, 2.2]],
  d1: { at: 60, base: 7.5, h: 2.6, sweep: 0.45, round: 2, convex: 0.2, concave: 0 },
  knuckles: { at: [70, 73.4, 76.8, 80.2], base: 2.2, h: 0.75 },
  pec: { at: [31, 0.8], base: 3.4, len: 6.5, angle: 45, width: 0.55, round: 1.8, concave: 0, convex: 0.1 },
  caudal: { upper: [99.5, -12.5], lower: [100, 13.5], fork: [96.5, 0.3], notch: 0, upperBow: 0.06, lowerBow: 0.06, trail: 0.02, lowerTrail: 0.02 },
  eye: { x: 27.5, f: 0.66, r: 0.55 },
  gills: noGills,
  belly: 0.9,
  softBelly: false,
  extra: (c) => {
    const s = c.s;
    const rand = rng(71);
    // The narrow lower jaw, tucked under the head, with its pale lip.
    const jaw = shapeIn(s, [[tAtX(s, 7), 0.9], [tAtX(s, 16), 0.86], [tAtX(s, 25), 0.84], [tAtX(s, 25), 0.95], [tAtX(s, 16), 0.99], [tAtX(s, 7.5), 0.98]]);
    const wrinkles: Line[] = [];
    for (let k = 0; k < 16; k++) {
      const f = 0.15 + k * 0.045;
      const t0 = tAtX(s, 36 + rand() * 8);
      wrinkles.push({ pts: lineAlong(s, (t) => f + 0.012 * Math.sin(t * 90 + k), t0, 0.97), w: 0.65, o: 0.6, taper: 'both' });
    }
    const scars: Line[] = Array.from({ length: 5 }, (_, k) => ({ pts: [atX(s, 6 + k * 3, 0.2 + rand() * 0.2), atX(s, 9 + k * 3, 0.25 + rand() * 0.2)], w: 0.6, o: 0.5 }));
    const blowhole: Line = { pts: curveIn(s, [[tAtX(s, 0.8), 0.06], [tAtX(s, 1.6), 0.02], [tAtX(s, 2.4), 0.06]]), w: 1.2 };
    return {
      marks: [{ poly: jaw, paint: '#E6E2DA', edge: 1.1 }],
      lines: [...wrinkles, ...scars, blowhole, { pts: lineAlong(s, 0.84, tAtX(s, 8), tAtX(s, 25)), w: 1.2 }],
    };
  },
};

// ── Orca ─────────────────────────────────────────────────────────────────────
// Very tall triangular dorsal fin (adult male); white oval eye patch; white chin, belly and a
// flank lobe sweeping up behind the dorsal; grey saddle; broad paddle flippers.
const orca: SharkSpec = {
  kind: 'mammal',
  tip: [0, 0.6],
  blunt: 0.7,
  top: [[0.5, -1.6], [2, -3.6], [5, -6], [9, -8.2], [15, -10.4], [22, -11.8], [30, -12.4], [40, -12.4], [50, -11.4], [60, -9], [68, -6.4], [75, -4.2], [81, -2.8], [85, -2.2]],
  bot: [[0.5, 1.8], [2, 3.6], [5, 5.8], [10, 8.2], [17, 10.4], [26, 11.8], [36, 12], [46, 11.2], [56, 9.2], [65, 6.4], [73, 4], [80, 2.6], [85, 2.1]],
  d1: { at: 40, base: 11, h: 21, sweep: 0.4, rear: 1, concave: 0.04, convex: 0.0, round: 0.6 },
  pec: { at: [19, 0.78], base: 6, len: 17, angle: 55, width: 0.6, convex: 0.15, concave: -0.05, round: 5, rear: 0.05 },
  caudal: flukes(85, 9, 12.5),
  eye: { x: 12, f: 0.5, r: 0.7 },
  gills: noGills,
  mouth: mouth([[0.6, 0.56], [6, 0.6], [10, 0.58], [11.5, 0.52]]),
  belly: 1.5,
  softBelly: false,
  extra: (c) => {
    const s = c.s;
    const eyePatch = shapeIn(s, [[tAtX(s, 13.5), 0.4], [tAtX(s, 16), 0.24], [tAtX(s, 20.5), 0.22], [tAtX(s, 23), 0.3], [tAtX(s, 18), 0.38]]);
    // White chin and belly: the boundary is one smooth curve (high on the jaw, easing down between
    // the flippers, then up the flank in the lobe behind the dorsal fin and out under the tail stock).
    const edge = spline([[0, 0.58], [5, 0.6], [12, 0.63], [19, 0.69], [27, 0.73], [38, 0.75], [48, 0.72], [54, 0.62], [59, 0.5], [63.5, 0.46], [67, 0.55], [70.5, 0.74], [74, 0.96], [77, 1.06]], false);
    const belly = region(s, 0, 1, (t) => yAt(edge, s.top[Math.round(t * (s.top.length - 1))][0]), 1.08);
    // The grey saddle behind the dorsal fin: a curved wedge that hugs the fin and fades forward.
    const saddle = shapeIn(s, [[tAtX(s, 50), -0.04], [tAtX(s, 56), -0.04], [tAtX(s, 63), -0.04], [tAtX(s, 63.5), 0.1], [tAtX(s, 60), 0.22], [tAtX(s, 55.5), 0.31], [tAtX(s, 51.5), 0.3], [tAtX(s, 50.4), 0.14]]);
    const saddleCore = shapeIn(s, [[tAtX(s, 51), -0.04], [tAtX(s, 58), -0.04], [tAtX(s, 61.5), 0.04], [tAtX(s, 58.5), 0.15], [tAtX(s, 54.5), 0.2], [tAtX(s, 51), 0.12]]);
    return {
      marks: [
        { poly: belly, paint: 'light', clip: 'trunk' },
        { poly: eyePatch, paint: 'light', clip: 'trunk' },
        { poly: saddle, paint: '#9EA3A6', o: 0.45, clip: 'trunk' },
        { poly: saddleCore, paint: '#9EA3A6', o: 0.5, clip: 'trunk' },
      ],
    };
  },
};

// ── Dugong ───────────────────────────────────────────────────────────────────
// A dolphin-like notched fluke; a strongly downturned snout disc; smooth spindle body with no
// dorsal fin; nail-less flippers.
const dugong: SharkSpec = {
  kind: 'mammal',
  tip: [0.6, 5],
  blunt: 1,
  noseTilt: -0.6,
  top: [[0, 1.5], [1.2, -1.8], [4, -4.6], [8, -6.6], [14, -8.6], [22, -10.4], [32, -11.4], [42, -11.2], [52, -10], [62, -7.8], [70, -5.4], [77, -3.4], [82, -2.4]],
  bot: [[1.4, 6.6], [3.6, 7.8], [7, 8.6], [12, 9.6], [20, 10.8], [30, 11.8], [40, 11.8], [50, 10.6], [60, 8.4], [68, 6], [76, 3.6], [82, 2.4]],
  pec: { at: [18, 0.78], base: 4.5, len: 14, angle: 50, width: 0.36, round: 1.8, concave: 0.04 },
  caudal: { upper: [99, -10.5], lower: [99.6, 13], fork: [95.5, 0.3], notch: 0, upperBow: 0.08, lowerBow: 0.08, trail: 0.12, lowerTrail: 0.12 },
  eye: { x: 9, f: 0.32, r: 0.45 },
  gills: noGills,
  belly: 0.72,
  softBelly: true,
  extra: (c) => {
    const s = c.s;
    const rand = rng(81);
    // The flat bristly disc facing the bottom, and the cleft lip above it.
    const disc = shapeIn(s, [[tAtX(s, 0.5), 0.62], [tAtX(s, 2.6), 0.66], [tAtX(s, 5.6), 0.84], [tAtX(s, 4.6), 0.98], [tAtX(s, 1.6), 0.92]]);
    const bristles: Line[] = Array.from({ length: 22 }, () => {
      const p = atX(s, 1 + rand() * 4, 0.7 + rand() * 0.22);
      return { pts: [p, add(p, [0.1, 0.5])], w: 0.6, o: 0.7, detail: true };
    });
    const scars: Line[] = Array.from({ length: 4 }, (_, k) => ({ pts: [atX(s, 30 + k * 7, 0.2 + rand() * 0.1), atX(s, 34 + k * 7, 0.24 + rand() * 0.1)], w: 0.6, o: 0.5 }));
    return {
      marks: [{ poly: disc, paint: 'belly', edge: 1 }],
      lines: [...bristles, ...scars, { pts: curveIn(s, [[tAtX(s, 0.6), 0.5], [tAtX(s, 3), 0.56], [tAtX(s, 6), 0.7]]), w: 1 }],
    };
  },
};

// ── West Indian manatee ──────────────────────────────────────────────────────
// A round paddle tail; a rotund, wrinkled body; a whiskery blunt muzzle; nails on the flippers.
const manatee: SharkSpec = {
  kind: 'mammal',
  tip: [0.3, 2.5],
  blunt: 1,
  top: [[0, 0], [1, -2.6], [3.6, -4.6], [8, -6.4], [12, -7.6], [18, -11], [26, -13.6], [36, -15], [46, -15], [56, -13.6], [64, -10.8], [70, -7.6], [74, -5.4]],
  bot: [[1, 5.4], [3.6, 6.6], [8, 7.6], [13, 9], [20, 12.2], [30, 14.6], [40, 15.4], [50, 14.6], [58, 12.6], [65, 9.4], [70, 6.4], [74, 4.6]],
  pec: { at: [18, 0.8], base: 5, len: 13, angle: 50, width: 0.5, round: 3, concave: -0.04, rear: 0.05 },
  caudal: { upper: [0, 0], lower: [0, 0], fork: [0, 0], paddle: [26, 13] },
  eye: { x: 7.5, f: 0.3, r: 0.42 },
  gills: noGills,
  belly: 0.78,
  softBelly: true,
  extra: (c) => {
    const s = c.s;
    const rand = rng(91);
    const whiskers: Line[] = Array.from({ length: 16 }, () => {
      const p = atX(s, 0.6 + rand() * 3, 0.45 + rand() * 0.35);
      return { pts: [p, add(p, [-0.6, 0.2 + rand() * 0.4])], w: 0.55, o: 0.8, detail: true };
    });
    const nails: Fill[] = [0.25, 0.45, 0.65].map((k) => {
      const p = lerp(c.pec.apex, c.pec.te[Math.floor(c.pec.te.length * 0.1)], k * 0.3);
      return { poly: ellipse(p, 0.55, 0.4), paint: '#D8CDB4', edge: 0.6 };
    });
    const wrinkles: Line[] = Array.from({ length: 14 }, (_, k) => ({
      pts: curveIn(s, [[0.12 + k * 0.05, 0.1], [0.14 + k * 0.05, 0.45], [0.12 + k * 0.05, 0.9]]),
      w: 0.55,
      o: 0.45,
      taper: 'both',
    }));
    const scars: Fill[] = [0.42, 0.47, 0.52].map((t) => ({ poly: shapeIn(s, [[t, 0.05], [t + 0.012, 0.05], [t + 0.03, 0.22], [t + 0.018, 0.22]]), paint: '#B8B5AE', o: 0.8, clip: 'trunk' }));
    const algae: Fill[] = scatter(s, { t0: 0.3, t1: 0.9, f0: 0.02, f1: 0.25, r: 1.2, gap: 1.5, paint: '#7F8F5E', rand, tries: 40, o: 0.35 });
    return { lines: [...whiskers, ...wrinkles], marks: [...algae, ...scars, ...nails, { poly: ellipse(atX(s, 0.9, 0.42), 0.4, 0.25), paint: 'ink' }] };
  },
};

// ── California sea lion ──────────────────────────────────────────────────────
// Long wing-like fore flippers; a small ear flap; a long, dog-like muzzle; plain, unspotted tan.
const seaLion: SharkSpec = {
  kind: 'mammal',
  tip: [0, 0.3],
  blunt: 0.6,
  top: [[1, -0.9], [3, -1.7], [6, -3], [9, -5], [12, -6.2], [15, -6.8], [19, -7.6], [25, -9.4], [32, -10.6], [40, -10.4], [50, -9], [60, -7], [68, -5], [75, -3.4], [80, -2.4]],
  bot: [[1, 1.1], [3, 1.8], [7, 2.8], [11, 4.2], [15, 5.6], [20, 7.6], [27, 9.8], [34, 10.6], [44, 10], [54, 8.4], [63, 6.2], [71, 4], [77, 2.6], [80, 2.2]],
  pec: { at: [28, 0.82], base: 7, len: 26, angle: 58, width: 0.36, convex: 0.08, concave: 0.04, round: 1.6 },
  caudal: { upper: [0, 0], lower: [0, 0], fork: [0, 0], paddle: [3, 2.2] },
  eye: { x: 8.2, f: 0.36, r: 0.75 },
  gills: noGills,
  mouth: mouth([[0.4, 0.62], [2.5, 0.66], [4.6, 0.64]]),
  belly: 0.72,
  softBelly: true,
  extra: (c) => {
    const s = c.s;
    const ear = shapeIn(s, [[tAtX(s, 11), 0.32], [tAtX(s, 12.4), 0.22], [tAtX(s, 13.4), 0.28], [tAtX(s, 12.6), 0.36]]);
    const whiskers: Line[] = [0.48, 0.56, 0.64].map((f) => ({ pts: [atX(s, 2.4, f), add(atX(s, 2.4, f), [-3.6, (f - 0.56) * 6])], w: 0.5, o: 0.8, detail: true }));
    const hind = hindFlippers(c, 19, 4.2);
    return {
      marks: [{ poly: ear, paint: 'fin', edge: 0.9 }, { poly: ellipse(atX(s, 0.4, 0.4), 0.45, 0.3), paint: 'ink' }],
      lines: whiskers,
      near: hind.near,
      far: hind.far,
      median: [{ fin: 'pec', marks: [wash(c.pec, 'dark', 0.5)] }],
    };
  },
};

// ── Harbor seal ──────────────────────────────────────────────────────────────
// A spotted coat; rounded head with a short muzzle and no ear flap; small clawed fore flippers;
// hind flippers pointing back like a tail; plump torpedo body.
const harborSeal: SharkSpec = {
  kind: 'mammal',
  tip: [0, 0.5],
  blunt: 0.8,
  top: [[0.6, -1.3], [2.2, -3], [4.4, -5.2], [7.4, -6.8], [10.4, -7.2], [13.6, -7], [17, -8.2], [23, -11.4], [31, -13.4], [39, -13.8], [49, -12.8], [58, -10.4], [66, -7.6], [73, -4.8], [78, -3.2], [81, -2.6]],
  bot: [[0.6, 1.6], [2.2, 2.9], [5, 4.3], [8.4, 5.4], [12, 6.4], [16, 8], [23, 11], [32, 13.2], [41, 13.6], [51, 12.4], [60, 9.8], [68, 7], [74, 4.4], [79, 3], [81, 2.6]],
  pec: { at: [24, 0.82], base: 4, len: 10, angle: 72, width: 0.42, round: 2, concave: 0, convex: 0.1 },
  caudal: { upper: [0, 0], lower: [0, 0], fork: [0, 0], paddle: [3, 2.4] },
  eye: { x: 7.2, f: 0.36, r: 0.95 },
  gills: noGills,
  mouth: mouth([[0.4, 0.62], [2, 0.66], [3.6, 0.64]]),
  belly: 0.72,
  softBelly: true,
  extra: (c) => {
    const s = c.s;
    const rand = rng(101);
    const spots = scatter(s, { t0: 0.04, t1: 1, f0: 0.02, f1: 0.78, r: (t, f) => 0.32 + rand() * 0.38 - f * 0.1, gap: 0.9, paint: 'pattern', rand, tries: 900 });
    const rings: Fill[] = scatter(s, { t0: 0.2, t1: 0.9, f0: 0.08, f1: 0.5, r: 0.8, gap: 3, paint: 'pattern', rand, tries: 40, o: 0.7 }).flatMap((f) => {
      const c0 = f.poly.reduce((a, p) => [a[0] + p[0] / f.poly.length, a[1] + p[1] / f.poly.length], [0, 0]) as Pt;
      return [f, { poly: ellipse(c0, 0.42), paint: 'back' as const, clip: 'trunk' as const }];
    });
    const whiskers: Line[] = [0.46, 0.54, 0.62, 0.7].map((f) => ({ pts: [atX(s, 2, f), add(atX(s, 2, f), [-3.2, (f - 0.58) * 6])], w: 0.5, o: 0.8, detail: true }));
    const claws: Line[] = [0.15, 0.35, 0.55, 0.75].map((k) => {
      const p = lerp(c.pec.apex, c.pec.te[Math.floor(c.pec.te.length * 0.2)], k * 0.5);
      return { pts: [p, add(p, [0.5, 0.6])], w: 1 };
    });
    const nostril: Line = { pts: [atX(s, 0.6, 0.38), atX(s, 1.3, 0.3)], w: 1 };
    const hind = hindFlippers(c, 17, 3.6);
    // A crease where the round head meets the body.
    const neck: Line = { pts: curveIn(s, [[tAtX(s, 13), 0.1], [tAtX(s, 14.4), 0.45], [tAtX(s, 13.6), 0.8]]), w: 0.7, o: 0.5, taper: 'both' };
    return { marks: [...spots, ...rings], lines: [...whiskers, ...claws, nostril, neck], near: hind.near, far: hind.far };
  },
};

const M = (spec: SharkSpec, palette: PlateDef['palette'], seed: number): PlateDef => ({ build: () => shark({ ...spec, seed }), palette });

// ── Sea otter ────────────────────────────────────────────────────────────────
// Floating on its back with its paws on its chest; a pale, grizzled head on a dark body; large
// webbed hind feet held up; a short flat tail; a blunt, whiskery face.
function seaOtter(): PlateGeom {
  const g = emptyGeom();
  const rand = rng(111);
  // Body: a low arc, belly up, from the neck (left) to the rump (right).
  const spine = spline([[13, 1.4], [30, 4.6], [46, 5.6], [62, 4.8], [76, 2.4]], false);
  const width = (t: number) => (7.2 + 2.6 * Math.sin(Math.PI * Math.min(1, t * 1.1)) - 2.4 * t ** 3) * Math.min(1, Math.sqrt(Math.min(t, 1 - t) * 14 + 0.12));
  const body = tube(spine, width);
  g.trunk = body;
  // Head, raised at the left, muzzle up and forward.
  const head = spline([[6, -6.6], [9.4, -11.6], [15.4, -13.2], [21, -11], [23, -5.6], [21.6, 0], [16, 3.6], [10.4, 2.4], [6.4, -0.6], [4, -3.4]], true);
  const muzzle = spline([[3.4, -4.4], [5.2, -8.2], [9, -8.4], [10.4, -5], [8.4, -2.2], [4.6, -1.6]], true);
  // Hind feet raised out of the water on the right, the tail flat between them.
  const foot = (base: Pt, tip: Pt, w: number): Pt[] => {
    const d = norm(sub(tip, base));
    const n = perp(d);
    return spline([add(base, mul(n, w * 0.4)), add(lerp(base, tip, 0.5), mul(n, w * 0.7)), add(tip, mul(n, w * 0.55)), add(tip, mul(d, 0.8)), add(tip, mul(n, -w * 0.55)), add(lerp(base, tip, 0.5), mul(n, -w * 0.6)), add(base, mul(n, -w * 0.4))], true);
  };
  const footFar = foot([72, -1], [86, -14], 6.4);
  const footNear = foot([75, 1], [92, -9.6], 7);
  const tail: Pt[] = spline([[74, 3.4], [84, 3.6], [94, 3.2], [96.4, 4.4], [94, 6], [84, 6.4], [74, 6.2]], true);
  const paws: Pt[][] = [spline([[22, -5.6], [27, -7.6], [30.4, -6.2], [28.6, -3.2], [23.6, -3]], true), spline([[27, -3.6], [32.6, -5], [35, -3], [32, -0.6], [27.4, -1]], true)];
  const urchin = ellipse([30.6, -8.8], 2.6);
  const spines: Line[] = Array.from({ length: 18 }, (_, k) => {
    const a = (k / 18) * Math.PI * 2;
    return { pts: [add([30.6, -8.8], [Math.cos(a) * 2.4, Math.sin(a) * 2.4]), add([30.6, -8.8], [Math.cos(a) * 3.8, Math.sin(a) * 3.8])], w: 0.7 };
  });
  g.body = body;
  g.far.push({ poly: footFar, paint: 'back', lines: [0.25, 0.5, 0.75].map((k) => ({ pts: [lerp([72, -1], [86, -14], 0.15), add(lerp([72, -1], [86, -14], 0.95), [(k - 0.5) * 6, (k - 0.5) * 3])], w: 0.6, taper: 'end' as const })), edge: 0.85 });
  g.far.push({ poly: tail, paint: 'back', lines: [], edge: 0.85 });
  // Fur: short strokes over the body, denser on the shadowed underside.
  const fur: Line[] = [];
  for (let k = 0; k < 260; k++) {
    const t = rand();
    const f = rand();
    const p0 = spine[Math.floor(t * (spine.length - 1))];
    const w = width(t);
    const p: Pt = [p0[0] + (rand() - 0.5) * 2, p0[1] + (f - 0.5) * 2 * w * 0.9];
    fur.push({ pts: [p, add(p, [0.9, 0.35])], w: 0.6 + f * 0.6, o: 0.65, taper: 'both' });
  }
  g.engraving = fur;
  g.tint.push({ poly: body.map(([x, y]) => [x + 1, y + 2.4] as Pt), paint: 'dark', o: 0.18, clip: 'trunk' });
  g.near.push({ poly: footNear, paint: 'back', lines: [0.25, 0.5, 0.75].map((k) => ({ pts: [lerp([75, 1], [92, -9.6], 0.15), add(lerp([75, 1], [92, -9.6], 0.95), [(k - 0.5) * 5, (k - 0.5) * 6])], w: 0.6, taper: 'end' as const })), edge: 0.85 });
  const headLines: Line[] = [];
  for (let k = 0; k < 70; k++) {
    const p: Pt = [7 + rand() * 14, -12 + rand() * 14];
    headLines.push({ pts: [p, add(p, [0.7, 0.3])], w: 0.5, o: 0.45, taper: 'both' });
  }
  g.near.push({ poly: head, paint: 'accent', lines: headLines, edge: 1 });
  g.near.push({ poly: muzzle, paint: 'accent', lines: [], edge: 0.9 });
  g.near.push({ poly: urchin, paint: '#5A3E5E', lines: spines, edge: 0.8 });
  for (const p of paws) g.near.push({ poly: p, paint: 'back', lines: [], edge: 0.85 });
  g.marks.push({ poly: ellipse([4.6, -5.8], 0.9, 0.7), paint: 'ink' });
  g.lines.push(
    ...[-0.6, 0.4, 1.4].map((dy) => ({ pts: [[6, -3.4 + dy], [-0.6, -3.6 + dy * 1.6]] as Pt[], w: 0.5, o: 0.8 })),
    ...[-0.6, 0.4, 1.4].map((dy) => ({ pts: [[7, -3 + dy], [12, -1.2 + dy * 1.4]] as Pt[], w: 0.5, o: 0.6, detail: true })),
    { pts: spline([[17.4, -12.6], [18.6, -14.2], [20, -12.4]], false), w: 0.9 },
  );
  // The water: a few ripples under the floating body.
  for (const [x0, x1, y] of [
    [10, 40, 9.8],
    [44, 80, 9.4],
    [24, 60, 12.4],
    [70, 98, 8],
  ])
    g.lines.push({ pts: Array.from({ length: 20 }, (_, i) => [x0 + ((x1 - x0) * i) / 19, y + Math.sin(i * 1.1) * 0.5] as Pt), w: 0.8, o: 0.55, taper: 'both' });
  g.eyes.push({ c: [12.2, -8.8], r: 0.7 });
  g.heavy.push(body.slice(Math.floor(body.length / 2)));
  void at;
  return g;
}

export const MAMMALS: Record<string, PlateDef> = {
  'bottlenose-dolphin': M(bottlenose, { back: '#6F7A83', belly: '#D9DCDD', dark: '#3F4A53' }, 1),
  'spinner-dolphin': M(spinner, { back: '#6E777E', belly: '#F2F2EF', dark: '#2E363E' }, 2),
  'humpback-whale': M(humpback, { back: '#25292D', belly: '#E8E9E6' }, 3),
  'sperm-whale': M(sperm, { back: '#4A4542', belly: '#6B6560' }, 4),
  orca: M(orca, { back: '#0A0B0D', belly: '#F4F4F0' }, 5),
  dugong: M(dugong, { back: '#8A8378', belly: '#B9B1A3' }, 6),
  'west-indian-manatee': M(manatee, { back: '#7C7C78', belly: '#9A9A94' }, 7),
  'california-sea-lion': M(seaLion, { back: '#A07C52', belly: '#C9A97E', dark: '#3A2A20' }, 8),
  'harbor-seal': M(harborSeal, { back: '#8E8F8A', belly: '#C9C4B8', pattern: '#3E3D3A' }, 9),
  'sea-otter': { build: seaOtter, palette: { back: '#4A3528', belly: '#6B5244', accent: '#C8B9A2' } },
};
void ((c: SharkCtx) => c);
void ([] as Part[]);
void ([] as Ctrl[]);
