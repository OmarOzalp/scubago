/**
 * Three more marine mammals, side on, head to the left: the short-finned pilot whale, the common
 * minke whale and the short-beaked common dolphin (see mammals.ts for the others).
 */
import { ellipse } from '../kit';
import { curveIn, shapeIn } from '../marks';
import type { PlateDef } from '../registry';
import { shark, type SharkSpec } from '../shark';
import { atX, finTip, lineAlong, region, tAtX } from '../side';
import type { Fill, Line } from '../types';

const noGills = { n: 0, x: 0, step: 0, f0: 0, f1: 0 };
const flukes = (up: number, down: number, fork = 96): SharkSpec['caudal'] => ({
  upper: [99, -up],
  lower: [99.6, down],
  fork: [fork, 0.3],
  notch: 0,
  upperBow: 0.1,
  lowerBow: 0.1,
  trail: 0.14,
  lowerTrail: 0.14,
});

// ── Short-finned pilot whale ─────────────────────────────────────────────────
// All dark charcoal; a round, bulging melon with no beak; a low, broad-based, swept-back dorsal
// fin set well forward (about a third back); long, curved sickle flippers; a grey saddle behind
// the dorsal fin and a grey anchor-shaped patch on the throat; narrow tail stock.
const pilot: SharkSpec = {
  kind: 'mammal',
  tip: [0, -0.2],
  blunt: 1,
  top: [[0.8, -2.2], [2.4, -5.2], [5, -7.6], [9, -9.6], [14, -11], [21, -12], [30, -12.4], [40, -12], [50, -10.4], [58, -8.2], [66, -5.8], [74, -3.8], [80, -2.7], [84, -2.2]],
  bot: [[0.8, 2], [2.4, 3.8], [5, 5.8], [9, 7.6], [15, 9.4], [23, 10.6], [32, 11], [42, 10.4], [52, 8.8], [60, 6.8], [68, 4.8], [76, 3.2], [82, 2.3], [84, 2.1]],
  d1: { at: 24, base: 16, h: 7.4, sweep: 0.72, rear: 5, rearLift: 0.4, concave: 0.24, convex: 0.1, round: 1.4 },
  pec: { at: [25, 0.78], base: 4.4, len: 31, angle: 60, width: 0.15, concave: 0.1, convex: 0.14, round: 1.2, rear: 0.04 },
  caudal: flukes(9, 12.5, 96),
  eye: { x: 11.2, f: 0.55, r: 0.6 },
  gills: noGills,
  mouth: [[1.2, 0.66], [5, 0.7], [9.6, 0.66], [11.4, 0.58]],
  belly: 1.5,
  softBelly: false,
  extra: (c) => {
    const s = c.s;
    // The grey saddle behind the dorsal fin, fading into the black back.
    const saddle = shapeIn(s, [[tAtX(s, 41), 0], [tAtX(s, 48), 0.02], [tAtX(s, 52), 0.14], [tAtX(s, 49), 0.3], [tAtX(s, 44), 0.34], [tAtX(s, 41.4), 0.2]]);
    // The anchor: a grey chest patch between the flippers, with a stem running back along the belly.
    const anchor = shapeIn(s, [[tAtX(s, 12), 0.78], [tAtX(s, 18), 0.7], [tAtX(s, 24), 0.72], [tAtX(s, 34), 0.8], [tAtX(s, 46), 0.9], [tAtX(s, 34), 0.92], [tAtX(s, 22), 0.94], [tAtX(s, 14), 0.9]]);
    // Pale spots over each eye.
    const brow: Fill = { poly: ellipse(atX(s, 13.4, 0.36), 1.2, 0.7, -10), paint: '#8A8F95', o: 0.6, clip: 'trunk' };
    const creases: Line[] = [
      { pts: curveIn(s, [[tAtX(s, 6.2), 0.32], [tAtX(s, 7), 0.48], [tAtX(s, 7.6), 0.6]]), w: 0.8, o: 0.6, taper: 'both' },
    ];
    return {
      marks: [
        { poly: saddle, paint: '#9A9EA3', o: 0.55, clip: 'trunk' },
        { poly: anchor, paint: '#8D9297', o: 0.55, clip: 'trunk' },
        brow,
      ],
      lines: creases,
    };
  },
};

// ── Common minke whale ───────────────────────────────────────────────────────
// A slim baleen whale: a narrow, pointed, flat-topped snout with a single ridge; a small hooked
// dorsal fin about two-thirds back; throat grooves from chin to navel; slate-grey back over a white
// belly; small pointed flippers each crossed by a bright white band.
const minke: SharkSpec = {
  kind: 'mammal',
  tip: [0, 0.2],
  blunt: 0.15,
  top: [[2, -0.8], [6, -1.4], [11, -2.4], [16, -4.4], [22, -6.6], [30, -8], [40, -8.6], [50, -8.4], [58, -7.4], [66, -5.8], [73, -4.2], [79, -3], [84, -2.4], [86, -2.2]],
  bot: [[2, 0.8], [6, 1.6], [11, 3], [16, 4.8], [24, 6.8], [34, 8], [44, 8.2], [54, 7.2], [62, 5.8], [70, 4.4], [77, 3.2], [83, 2.5], [86, 2.2]],
  d1: { at: 62, base: 7, h: 4.8, sweep: 0.75, rear: 2, rearLift: 0.5, concave: 0.26, convex: 0.05, round: 0.4 },
  pec: { at: [26, 0.72], base: 3.2, len: 13, angle: 52, width: 0.2, concave: 0.1, convex: 0.06, round: 0.5, rear: 0.04 },
  caudal: flukes(7, 9.6, 96),
  eye: { x: 16.2, f: 0.46, r: 0.55 },
  gills: noGills,
  mouth: [[0.6, 0.48], [8, 0.54], [14, 0.52], [18.4, 0.46]],
  belly: 0.6,
  softBelly: true,
  extra: (c) => {
    const s = c.s;
    // Throat grooves from the chin back towards the navel.
    const grooves: Line[] = [0.64, 0.7, 0.76, 0.82, 0.88, 0.94].map((f, i) => ({
      pts: lineAlong(s, (t) => f + 0.015 * Math.sin(t * 8), tAtX(s, 5 + i * 0.6), tAtX(s, 47 - i * 2.4)),
      w: 0.7,
      o: 0.8,
      taper: 'both' as const,
    }));
    const ridge: Line = { pts: lineAlong(s, 0.06, tAtX(s, 1), tAtX(s, 14)), w: 0.8, o: 0.7, taper: 'both' };
    const blowholes: Line = { pts: curveIn(s, [[tAtX(s, 12), 0.04], [tAtX(s, 13), 0.02], [tAtX(s, 14), 0.04]]), w: 1, taper: 'both' };
    const stripe = region(s, 0.2, 0.34, 0.5, 0.64);
    return {
      tint: [{ poly: stripe, paint: '#B8BCBE', o: 0.3, clip: 'trunk' }],
      lines: [...grooves, ridge, blowholes],
      // The white band across the flipper, between a slate base and a slate tip.
      median: [{ fin: 'pec', marks: [finTip(c.pec, 0.3, 'light', 1), finTip(c.pec, 0.62, 'dark', 0.8)] }],
    };
  },
};

// ── Short-beaked common dolphin ──────────────────────────────────────────────
// The hourglass: a dark cape dipping to a V under the dorsal fin, a tan or ochre panel on the front
// flank and a pale grey one behind it; white belly; a dark line from chin to flipper; a black ring
// round the eye; a fairly short, slim beak with a dark tip; an upright, mid-back dorsal fin.
const common: SharkSpec = {
  kind: 'mammal',
  tip: [0, 0.1],
  blunt: 0.25,
  top: [[2, -0.8], [5, -1.2], [8, -1.8], [10.5, -3], [13, -4.8], [17, -6.4], [23, -7.8], [31, -8.5], [41, -8.6], [51, -7.6], [61, -5.8], [69, -4], [77, -2.7], [83, -1.9], [85, -1.6]],
  bot: [[2, 0.9], [6, 1.4], [10, 2.2], [14, 3.8], [20, 5.6], [28, 7.2], [38, 7.8], [48, 7.2], [58, 5.6], [67, 4], [75, 2.7], [82, 1.7], [85, 1.5]],
  d1: { at: 40, base: 11, h: 9.6, sweep: 0.62, rear: 2.4, rearLift: 0.5, concave: 0.14, convex: 0.06, round: 0.5 },
  pec: { at: [23, 0.74], base: 3.4, len: 12.5, angle: 44, width: 0.3, concave: 0.12, round: 0.4 },
  caudal: flukes(7.5, 10, 96),
  eye: { x: 14.2, f: 0.46, r: 0.6 },
  gills: noGills,
  mouth: [[0.4, 0.56], [6, 0.62], [10.8, 0.6], [12, 0.5]],
  belly: (t) => 0.74 - 0.16 * Math.max(0, 1 - t * 4),
  softBelly: false,
  extra: (c) => {
    const s = c.s;
    const capeEdge = (t: number) => 0.3 + 0.2 * Math.exp(-(((t - 0.47) / 0.1) ** 2));
    const belly = (t: number) => 0.74 - 0.16 * Math.max(0, 1 - t * 4);
    const cape = region(s, 0.05, 1, -0.02, capeEdge);
    // The tan panel ahead of the V and the grey panel behind it.
    const tan = region(s, 0.14, 0.5, (t) => capeEdge(t) - 0.02, (t) => Math.min(belly(t), 0.66));
    const grey = region(s, 0.5, 1, (t) => capeEdge(t) - 0.02, (t) => Math.min(belly(t), 0.56));
    const beakTip = region(s, 0, tAtX(s, 1.9), -0.05, 1.05);
    const mask: Fill = { poly: ellipse(atX(s, 14.2, 0.46), 1.9, 1.15, 6), paint: 'ink', o: 0.85, clip: 'trunk' };
    const lip: Line = { pts: lineAlong(s, 0.56, tAtX(s, 0.5), tAtX(s, 10)), w: 1.1, o: 0.8, taper: 'both' };
    const chinStripe: Line = { pts: curveIn(s, [[tAtX(s, 5), 0.66], [tAtX(s, 13), 0.7], [tAtX(s, 21), 0.74]]), w: 1.5, o: 0.8, taper: 'both' };
    return {
      tint: [
        { poly: grey, paint: '#A5ABAF', o: 0.85, clip: 'trunk' },
        { poly: tan, paint: '#C9A266', o: 0.9, clip: 'trunk' },
        { poly: cape, paint: 'dark', o: 0.78, clip: 'trunk' },
      ],
      marks: [{ poly: beakTip, paint: 'ink', o: 0.8, clip: 'trunk' }, mask],
      lines: [lip, chinStripe],
    };
  },
};
void shapeIn;

const M = (spec: SharkSpec, palette: PlateDef['palette'], seed: number): PlateDef => ({ build: () => shark({ ...spec, seed }), palette });

export const MORE_MAMMALS: Record<string, PlateDef> = {
  'short-finned-pilot-whale': M(pilot, { back: '#17191C', belly: '#34373B', dark: '#08090A' }, 21),
  'common-minke-whale': M(minke, { back: '#4B5158', belly: '#EEEEEA', dark: '#23272C' }, 22),
  'common-dolphin': M(common, { back: '#4B535B', belly: '#F2F1EC', dark: '#23292F' }, 23),
};
