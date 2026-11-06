/**
 * Four more rays from above (disc width = 100): three eagle-ray kin told apart by head and
 * colour (bull, cownose, bat) and the blotched fantail ray, a big round stingray.
 */
import { add, blob, type Ctrl, ellipse, inside, perp, type Pt, rng, spline } from '../kit';
import { mirror, ray, type RaySpec } from '../ray';
import type { PlateDef } from '../registry';
import { rotateGeom } from '../render';
import type { Fill, Line, PlateGeom } from '../types';

/** A band across the disc (right half of an arc through the points, mirrored), as a pale fill. */
const crossBand = (y: number, bow: number, half: number, w: number, o: number): Fill[] => {
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const x = -half + (2 * half * i) / 10;
    const sag = bow * (1 - (x / half) ** 2);
    top.push([x, y + sag]);
    bot.push([x, y + sag + w]);
  }
  return [{ poly: spline([...top, ...bot.reverse()], true), paint: 'light', o, clip: 'trunk' }];
};

// ── Bull ray ─────────────────────────────────────────────────────────────────
// A brown eagle ray with no spots: faint pale cross-bars over the back; a broad, blunt, duck-billed
// snout on a raised head; wide wings with pointed tips; a long whip tail with a small dorsal fin
// and a spine at its root.
const bull: RaySpec = {
  disc: [
    [0, 0],
    [4.2, 0.2],
    [7.2, 2.2],
    [8.2, 5.4],
    [8.4, 9.2],
    [9.6, 12.4],
    [21, 16.2],
    [35, 22],
    [47, 29],
    [50, 31.6, 1],
    [43, 33],
    [34, 36],
    [24, 41],
    [14, 47.5],
    [7, 53],
    [3, 57],
    [0, 58],
  ],
  hub: [0, 30],
  pelvic: [
    [2.8, 54.5],
    [6.4, 57.5],
    [5.8, 63],
    [2.8, 62],
  ],
  tail: {
    path: [[0, 56], [1.5, 74], [7, 94], [15, 114], [18, 136], [14, 158], [7, 174], [3, 186]],
    w0: 2.1,
    w1: 0.15,
    hold: 0.6,
    dorsal: { at: 0.01, len: 3.6, w: 1.8 },
    spines: { at: 0.04, n: 2, len: 3.8 },
  },
  eye: [7.2, 7.4],
  eyeR: 0.95,
  extra: () => {
    // The raised head: a fold where it rises from the disc, and the broad mouth-bill under it.
    const fold: Line = { pts: spline([[-8.4, 12.8], [-4, 11], [4, 11], [8.4, 12.8]], false), w: 1, taper: 'both' };
    const bands: Fill[] = [
      ...crossBand(16, -1.5, 32, 2.4, 0.27),
      ...crossBand(22.6, -1, 40, 2.6, 0.29),
      ...crossBand(29.4, -0.6, 44, 2.6, 0.29),
      ...crossBand(36, 0.4, 36, 2.6, 0.29),
      ...crossBand(42.5, 1.4, 26, 2.4, 0.27),
      ...crossBand(46, 2, 16, 2.8, 0.22),
    ];
    return { marks: bands, lines: [fold] };
  },
};

// ── Cownose ray ──────────────────────────────────────────────────────────────
// Plain golden-brown, no spots; the front of the head is notched in the middle into two lobes (the
// "cow nose") with eyes set wide at its sides; narrow, swept-back wings with long pointed tips; a
// long, thin whip tail with a small dorsal fin and spine at the root.
const cownose: RaySpec = {
  disc: [
    [0, 2.2],
    [2.2, 0.3],
    [5.6, 0],
    [8.6, 1.6],
    [9.2, 5],
    [8, 8.4],
    [10.4, 12],
    [22, 15.6],
    [34, 21],
    [45, 28],
    [49.6, 32, 1],
    [41, 33.4],
    [31, 36.2],
    [22, 40.6],
    [13, 46.5],
    [7, 52],
    [3, 56],
    [0, 57],
  ],
  hub: [0, 30],
  pelvic: [
    [2.8, 53.5],
    [6.2, 56],
    [5.6, 61.5],
    [2.8, 60.5],
  ],
  tail: {
    path: [[0, 55], [1.5, 72], [6, 92], [13, 112], [16, 134], [12, 156], [6, 172], [2, 184]],
    w0: 1.8,
    w1: 0.15,
    hold: 0.6,
    dorsal: { at: 0.01, len: 3.2, w: 1.6 },
    spines: { at: 0.035, n: 2, len: 3.4 },
  },
  eye: [8, 5.6],
  eyeR: 0.85,
  extra: () => {
    // The groove where the head meets the wings, and the cleft in the front of the snout.
    const groove: Line = { pts: spline([[-9, 11.5], [-4.5, 10], [0, 9.4], [4.5, 10], [9, 11.5]], false), w: 1.1, taper: 'both' };
    const cleft: Line = { pts: [[0, 2.2], [0, 6.4]], w: 0.9, taper: 'end' };
    const sheen: Fill[] = crossBand(20, -1, 40, 9, 0.12);
    return { lines: [groove, cleft], marks: sheen };
  },
};

// ── Bat ray ──────────────────────────────────────────────────────────────────
// Plain dark chocolate-brown all over; a broad, flat, blunt head with the eyes on bulges at its
// sides; wide wings with rounded points; a tail longer than the disc with a dorsal fin and a stout
// spine at its root.
const bat: RaySpec = {
  disc: [
    [0, 0],
    [5, 0.3],
    [9.4, 2.6],
    [11, 6],
    [10.6, 9.6],
    [12.4, 12.6],
    [26, 16],
    [40, 22],
    [48.6, 29],
    [50, 34, 1],
    [48, 39.5],
    [41, 44],
    [30, 49],
    [18, 54],
    [9, 58],
    [3, 61],
    [0, 62],
  ],
  hub: [0, 34],
  pelvic: [
    [3, 59],
    [7, 62],
    [6.4, 68],
    [3, 67],
  ],
  tail: {
    path: [[0, 61], [1.5, 74], [6, 90], [12, 106], [14, 122], [11, 138], [6, 150]],
    w0: 2.4,
    w1: 0.2,
    hold: 0.7,
    dorsal: { at: 0.01, len: 4.4, w: 2.1 },
    spines: { at: 0.05, n: 1, len: 5 },
  },
  eye: [10, 7.2],
  eyeR: 1.05,
  extra: () => {
    // Eye bulges on the sides of the head, and the crease where the head rises from the disc.
    const crease: Line = { pts: spline([[-10.4, 13], [-5, 11.6], [5, 11.6], [10.4, 13]], false), w: 1.1, taper: 'both' };
    const bulge = (k: 1 | -1): Fill => ({ poly: ellipse([k * 10.8, 7.4], 1.8, 3.2), paint: 'dark', o: 0.18, clip: 'trunk' });
    return { marks: [bulge(1), bulge(-1)], lines: [crease] };
  },
};

// ── Blotched fantail ray ─────────────────────────────────────────────────────
// A huge round disc, near black, mottled all over with pale grey blotches (the reverse of the
// marbled look); a thin pale rim; a short thick tail with a broad fold under it to the tip and a
// spine behind a small ridge; granular skin, a row of thorns down the back.
const fantail: RaySpec = {
  disc: [
    [0, 0],
    [14, 1.4],
    [30, 6.4],
    [42.5, 15],
    [49.2, 27],
    [50, 40],
    [47.4, 54],
    [40, 67],
    [28, 78],
    [14, 85],
    [0, 87.5],
  ],
  hub: [0, 42],
  tail: { path: [[0, 84], [0.5, 108], [3, 136], [8, 164], [14, 190]], w0: 7.4, w1: 0.5, hold: 1.4, spines: { at: 0.26, n: 1, len: 7 }, fold: { from: 0.3, w: 3.8, paint: 'back' } },
  eye: [8.2, 18],
  eyeR: 1.3,
  spiracle: { at: [10, 24], r: 2 },
  extra: (c) => {
    const rand = rng(61);
    const blotches: Fill[] = [];
    for (let k = 0; k < 230; k++) {
      const x = (rand() - 0.5) * 92;
      const y = 4 + rand() * 80;
      if (!inside([x, y], c.disc)) continue;
      const r = 0.7 + rand() ** 2.2 * 3.8;
      blotches.push({ poly: blob([x, y], r, 0.5, rand, 9, 1 + rand() * 0.9, rand() * 180), paint: 'light', o: 0.22 + rand() * 0.22, clip: 'trunk' });
    }
    // The pale rim round the edge of the disc.
    const rim: Pt[] = c.disc.map(([x, y]) => [x * 0.965, y * 0.965 + 1.5] as Pt);
    const rimBand: Fill = { poly: [...c.disc, ...rim.slice().reverse()], paint: 'light', o: 0.3, clip: 'trunk' };
    const thorns: Fill[] = Array.from({ length: 12 }, (_, i) => ({ poly: ellipse([0, 28 + i * 4], 0.7), paint: '#D8CDB4' as const, edge: 0.6 }));
    return { marks: [rimBand, ...blotches, ...thorns] };
  },
};

const R = (spec: RaySpec, palette: PlateDef['palette'], rotate = 0): PlateDef => ({
  build: (): PlateGeom => (rotate ? rotateGeom(ray(spec), rotate) : ray(spec)),
  palette,
});

export const MORE_RAYS: Record<string, PlateDef> = {
  'bull-ray': R(bull, { back: '#6E6048', belly: '#F4F1E8', dark: '#2C2820' }, -90),
  'cownose-ray': R(cownose, { back: '#A98B58', belly: '#F4F0E4', dark: '#4A3C24' }, -90),
  'bat-ray': R(bat, { back: '#4E4030', belly: '#EFEADC', dark: '#1E1812' }, -90),
  'blotched-fantail-ray': R(fantail, { back: '#34383D', belly: '#EDEBE6', dark: '#16181B' }, -90),
};
export type { Ctrl };
void add;
void perp;
void mirror;
