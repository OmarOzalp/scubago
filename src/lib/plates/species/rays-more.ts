/**
 * Three eagle-ray kin from above (disc width = 100), told apart by head and colour: bull, cownose and bat.
 */
import { blob, type Ctrl, ellipse, type Pt, spline } from '../kit';
import { scatterIn } from '../marks';
import { mirrorY, topShark, type TopSharkSpec } from '../topshark';
import { ray, type RaySpec } from '../ray';
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
      ...crossBand(16, -1.5, 32, 3.2, 0.42),
      ...crossBand(22.6, -1, 40, 3.4, 0.45),
      ...crossBand(29.4, -0.6, 44, 3.4, 0.45),
      ...crossBand(36, 0.4, 36, 3.4, 0.45),
      ...crossBand(42.5, 1.4, 26, 3.2, 0.42),
      ...crossBand(46, 2, 16, 2.8, 0.22),
    ];
    // The duck-bill: a broad, pale, blunt snout that juts ahead of the raised head.
    const bill: Fill = { poly: spline([[-6.6, 1.6], [-3.4, -0.1], [3.4, -0.1], [6.6, 1.6], [7.4, 5], [0, 6.4], [-7.4, 5]], true), paint: 'light', o: 0.4, clip: 'trunk' };
    const billEdge: Line = { pts: spline([[-7.2, 6], [0, 7.4], [7.2, 6]], false), w: 1.1, taper: 'both' };
    return { marks: [bill, ...bands], lines: [fold, billEdge] };
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

const R = (spec: RaySpec, palette: PlateDef['palette'], rotate = 0): PlateDef => ({
  build: (): PlateGeom => (rotate ? rotateGeom(ray(spec), rotate) : ray(spec)),
  palette,
});

export const MORE_RAYS: Record<string, PlateDef> = {
  'bull-ray': R(bull, { back: '#6E6048', belly: '#F4F1E8', dark: '#2C2820' }, -90),
  'cownose-ray': R(cownose, { back: '#A98B58', belly: '#F4F0E4', dark: '#4A3C24' }, -90),
  'bat-ray': R(bat, { back: '#4E4030', belly: '#EFEADC', dark: '#1E1812' }, -90),
};

// ── Bowmouth guitarfish ──────────────────────────────────────────────────────
// Seen from above: a broad, rounded, shovel-fronted head with a bowed mouth, merging into big
// pectoral fins (a heart-shaped front, unlike the giant guitarfish's pointed wedge or the sawfish's
// saw); thorny ridges in arcs over each eye and down the middle; two tall shark-like dorsals; a
// shark's tail with a big lower lobe; grey-brown with white spots and dark smudges on the pectorals.
const BOW: [number, number][] = [[0.6, 5], [2, 9], [5, 12.6], [10, 15.2], [16, 16.6], [22, 16.4], [28, 14.6], [34, 11.6], [40, 8.6], [48, 6], [58, 4.2], [68, 3.2], [76, 2.6]];
const bowmouth: TopSharkSpec = {
  tip: [0, 0],
  blunt: 1,
  top: BOW.map(([x, w]) => [x, -w] as Ctrl),
  bot: mirrorY(BOW.map(([x, w]) => [x, -w] as Ctrl)),
  pelvic: { at: 38, base: 6, h: 5.6, sweep: 0.8, rear: 1.4, round: 1.2 },
  d1: { at: 50, base: 6.4, h: 8.4, sweep: 0.66, rear: 1.8, concave: 0.12 },
  d2: { at: 64, base: 5.6, h: 7.2, sweep: 0.66, rear: 1.6, concave: 0.12 },
  caudal: { upper: [100, -6.4], lower: [90, 9.4], fork: [94, 1.6], notch: 2, trail: 0.04, lowerTrail: 0.04, lowerBow: 0.1 },
  eyes: [[14, -5.4], [14, 5.4]],
  eyeR: 0.7,
  rings: { top: [0.04, 0.1, 0.18], bot: [0.78, 0.86, 0.93] },
  extra: (c) => {
    const rand = c.rand;
    const thorn = (p: Pt, r = 0.5): Fill => ({ poly: ellipse(p, r), paint: '#E9E0C8', edge: 0.5 });
    const arcs: Fill[] = [];
    for (const k of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const a = (-0.3 + i * 0.2) * Math.PI;
        arcs.push(thorn([14 + Math.cos(a) * 4.2 - 0.6, k * (5.4 + Math.sin(a) * 4.8 * -1 * (k < 0 ? -1 : 1) - 0.3 * 0)], 0.5));
      }
    }
    const mid: Fill[] = Array.from({ length: 20 }, (_, i) => thorn([22 + i * 2.6, 0.2 * Math.sin(i)], 0.45));
    const spots = scatterIn([[2, -9], [16, -15], [32, -11], [46, -5], [46, 5], [32, 11], [16, 15], [2, 9]], { r: 0.55, gap: 1.9, paint: 'light', rand, tries: 600, o: 0.9 });
    const smudges: Fill[] = [-1, 1].flatMap((k) => [[20, 11], [30, 8.4]].map(([x, y]) => ({ poly: blob([x, k * y], 2.6, 0.35, rand, 9, 1.5), paint: 'dark' as const, o: 0.35, clip: 'trunk' as const })));
    const mouth: Line = { pts: spline([[6.4, -7.4], [3.8, -3.6], [3.2, 0], [3.8, 3.6], [6.4, 7.4]], false), w: 1.4 };
    const spir: Fill[] = [-1, 1].map((k) => ({ poly: ellipse([18.6, k * 4.2], 0.9, 0.55), paint: 'dark', o: 0.8 }));
    return { marks: [...spots.map((f) => ({ ...f, clip: 'trunk' as const })), ...smudges, ...arcs, ...mid, ...spir], lines: [mouth] };
  },
};
MORE_RAYS['bowmouth-guitarfish'] = { build: () => topShark({ ...bowmouth, seed: 19 }), palette: { back: '#8B7F6C', belly: '#EFEBE0', dark: '#3A3226' } };
