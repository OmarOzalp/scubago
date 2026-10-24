/**
 * Sea turtles, from above. Cover the head and the shell outline alone should tell them apart
 * (smooth oval, saw-edged shield, heart, near-circle, ridged teardrop); the head confirms it
 * (blunt, hawk's beak, huge, triangular, smooth and round).
 */
import { add, ellipse, type Pt } from '../kit';
import { scatterIn } from '../marks';
import type { PlateDef } from '../registry';
import { turtle, type TurtleSpec } from '../turtle';
import type { Fill } from '../types';

// ── Green turtle ─────────────────────────────────────────────────────────────
// Small rounded blunt head with one pair of long prefrontal scales; smooth-edged oval shell with
// flat, butt-jointed scutes; four pairs of costals; pale-edged mosaic head and flipper scales;
// sunburst streaks on the scutes; one claw.
const green: TurtleSpec = {
  shell: [[0, 0], [10, 0.8], [22, 4], [32, 11], [38.5, 24], [40, 40], [38.5, 56], [34, 71], [26, 84], [15, 94], [6, 98.6], [0, 100]],
  column: [8.5, 12.5],
  head: {
    outline: [[0, -17], [3.6, -16.2], [6, -12.8], [6.7, -8], [6.1, -3.6], [5.2, 1.5]],
    eye: [4.7, -10.8],
    eyeR: 1.2,
    seams: [
      [[0, -15.6], [0, -9.2]],
      [[0, -9.2], [3.3, -8.7], [4.6, -9.6]],
      [[3.3, -8.7], [3.8, -5.6], [5.4, -3.4]],
      [[0, -4.8], [3.8, -5.6]],
      [[2.2, -16.4], [3.4, -12.4], [3.3, -8.7]],
    ],
  },
  front: { root: [33, 16], tip: [86, 52], width: 15, bow: 0.18, claws: 1 },
  hind: { root: [22, 88], tip: [36, 108], width: 11, bow: 0.1 },
  streaks: ['#3A2F1E', '#C2A15A'],
  seamW: 2.1,
};

// ── Hawksbill turtle ─────────────────────────────────────────────────────────
// Narrow head tapering to a pointed, hooked hawk's beak (two prefrontal pairs); thick scutes
// overlapping like roof tiles; saw-toothed rear margin; amber tortoiseshell with flame streaks;
// a narrow, elongated shield-shaped shell; two claws.
const hawksbill: TurtleSpec = {
  shell: [[0, 0], [9, 1], [20, 4.5], [29, 12], [34.5, 25], [36, 38], [34.5, 52], [30, 66], [23, 79], [14, 90], [6, 97], [0, 100]],
  column: [8, 11],
  overlap: true,
  serrate: true,
  head: {
    outline: [[0, -24], [1.3, -23.2], [2.8, -20.4], [4.5, -15.6], [5.7, -9.4], [6, -4], [5.2, 1.5]],
    eye: [4.5, -11],
    eyeR: 1.15,
    seams: [
      [[0, -20.5], [0, -10]],
      [[0, -15.2], [3.3, -14.6]],
      [[0, -10], [3.8, -9.4], [4.6, -9.8]],
      [[3.8, -9.4], [4.2, -5.6], [5.4, -3.4]],
      [[0, -5], [4.2, -5.6]],
    ],
  },
  front: { root: [30, 16], tip: [80, 50], width: 14, bow: 0.16, claws: 2 },
  hind: { root: [20, 87], tip: [33, 106], width: 10, bow: 0.1 },
  streaks: ['#8A4A22', '#2B1C12', '#E2B45A'],
};

// ── Loggerhead turtle ────────────────────────────────────────────────────────
// An oversized broad head (about a quarter of the shell's length across); reddish-brown,
// heart-shaped shell tapering behind; five costal pairs, the first touching the nuchal;
// yellow-edged reddish head scales.
const loggerhead: TurtleSpec = {
  shell: [[0, 0], [11, 0.6], [24, 4], [34, 12], [38.6, 26], [39, 40], [36.6, 55], [31, 69], [23, 82], [13, 92.5], [5, 98.4], [0, 100]],
  costals: [5, 5],
  firstCostalTouchesNuchal: true,
  column: [8, 11],
  head: {
    outline: [[0, -25], [5, -24], [9.6, -20.6], [12.2, -15.2], [12.8, -9], [11.6, -3], [8.2, 1.5]],
    eye: [8.8, -14.6],
    eyeR: 1.35,
    seams: [
      [[0, -23], [0, -12]],
      [[0, -18], [5, -17.4]],
      [[0, -12], [6.2, -11.4], [7.8, -12.6]],
      [[6.2, -11.4], [7.4, -6], [10, -3.8]],
      [[0, -5.6], [7.4, -6]],
      [[2.4, -18.3], [2.6, -14.8], [0, -14.6]],
      [[9.4, -10], [11.6, -7.6]],
    ],
  },
  front: { root: [32, 15], tip: [76, 48], width: 14.5, bow: 0.14, claws: 2 },
  hind: { root: [22, 88], tip: [34, 105], width: 10.5, bow: 0.1 },
  extra: (c) => {
    // A few barnacles, as on most loggerheads.
    // A small cluster of barnacles: pale cones, each with its slit opening.
    const barnacles: Fill[] = [
      [16, 30, 1.7],
      [18.6, 31.6, 1.2],
      [-21, 54, 1.5],
      [-19, 56.2, 1],
    ].flatMap(([x, y, r]) => [
      { poly: ellipse([x, y], r, r * 0.9), paint: '#D9D2C2' as const, edge: 0.8 },
      { poly: ellipse([x, y - r * 0.1], r * 0.45, r * 0.22), paint: 'dark' as const, o: 0.85 },
    ]);
    void c;
    return { marks: barnacles };
  },
};

// ── Olive ridley ─────────────────────────────────────────────────────────────
// An almost circular, flat shell; many small costal scutes (six and seven pairs, uneven); plain
// olive; small overall with a relatively big triangular head.
const ridley: TurtleSpec = {
  shell: [[0, 0], [12, 1], [27, 5.5], [39, 14], [45.5, 28], [47, 44], [45, 60], [39, 74], [29, 86], [16, 95], [6, 99], [0, 100]],
  vertebrals: 6,
  costals: [6, 7],
  firstCostalTouchesNuchal: true,
  column: [7, 9.5],
  marginals: 13,
  head: {
    outline: [[0, -19.5], [3.8, -18], [7, -13.4], [8.8, -7.4], [9, -2.4], [7, 1.5]],
    eye: [6.2, -11.4],
    eyeR: 1.2,
    seams: [
      [[0, -17], [0, -9]],
      [[0, -13.4], [3.6, -12.8]],
      [[0, -9], [4.6, -8.4], [5.8, -9.6]],
      [[4.6, -8.4], [5.6, -4.4], [7.6, -2.6]],
      [[0, -3.8], [5.6, -4.4]],
    ],
  },
  front: { root: [36, 18], tip: [88, 50], width: 15, bow: 0.16, claws: 1 },
  hind: { root: [25, 88], tip: [40, 106], width: 11, bow: 0.1 },
};

// ── Leatherback ──────────────────────────────────────────────────────────────
// No hard scutes: a ridged teardrop shell tapering to a point behind; huge fore-flippers; black
// skin spotted white; a pink spot on top of the head.
const leatherback: TurtleSpec = {
  shell: [[0, 0], [10, 0.6], [21, 4], [27.5, 13], [29.4, 26], [28.6, 42], [25.4, 58], [19.6, 74], [12, 88], [5, 99], [1.4, 106], [0, 108]],
  ridges: 7,
  head: {
    outline: [[0, -18.4], [3, -18], [6, -15.4], [7.8, -11], [8.2, -6.6], [7.4, -2.2], [6.4, 1.5]],
    eye: [5.8, -10.4],
    eyeR: 1.15,
  },
  front: { root: [25, 16], tip: [94, 64], width: 21, bow: 0.12, scales: false },
  hind: { root: [16, 92], tip: [27, 113], width: 12.5, bow: 0.06, scales: false },
  extra: (c) => {
    const spots: Fill[] = [
      // Sparse on the shell, clustered on the flippers and head: the white blotches of a real one.
      ...scatterIn(c.shell, { r: 0.55, gap: 8, paint: 'light', rand: c.rand, tries: 90, o: 0.8 }),
      ...c.flippers.flatMap((f) => [
        ...scatterIn(f, { r: 0.8, gap: 2.4, paint: 'light', rand: c.rand, tries: 90, o: 0.85 }),
        ...scatterIn(f, { r: 0.45, gap: 3, paint: 'light', rand: c.rand, tries: 60, o: 0.8 }),
      ]),
      ...scatterIn(c.head, { r: 0.5, gap: 3.2, paint: 'light', rand: c.rand, tries: 40, o: 0.85 }),
    ];
    return { marks: [...spots, { poly: ellipse([0, -9] as Pt, 1.6, 1.3), paint: '#E3A79E' }] };
  },
};
void add;

export const TURTLES: Record<string, PlateDef> = {
  'green-turtle': { build: () => turtle({ ...green, seed: 4, paleSeams: true }), palette: { back: '#6B6440', belly: '#E6DCBF', fin: '#4A4430' } },
  'hawksbill-turtle': { build: () => turtle({ ...hawksbill, seed: 5 }), palette: { back: '#C98E3E', belly: '#E1BE6A', fin: '#5A3C22' } },
  'loggerhead-turtle': { build: () => turtle({ ...loggerhead, seed: 6 }), palette: { back: '#8A4A2A', belly: '#E2C27C', fin: '#9C5A2E' } },
  'olive-ridley-turtle': { build: () => turtle({ ...ridley, seed: 7 }), palette: { back: '#6E7350', belly: '#E4E2C9', fin: '#6A6C5E' } },
  'leatherback-turtle': { build: () => turtle({ ...leatherback, seed: 8 }), palette: { back: '#23272D', belly: '#C8CED2', fin: '#2A2E35' } },
};
