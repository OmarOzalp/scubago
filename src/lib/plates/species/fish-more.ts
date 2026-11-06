/**
 * Five more reef fish, side on, facing left, 1% of total length per unit: the bluestreak cleaner
 * wrasse, Picasso triggerfish, masked butterflyfish, pygmy sweeper and longnose hawkfish.
 */
import { ellipse, lerp, type Pt, spline } from '../kit';
import { fish, type FishCtx, type FishSpec } from '../fish';
import { shapeIn } from '../marks';
import type { PlateDef } from '../registry';
import { swell } from '../render';
import { at, atX, region, tAtX } from '../side';
import type { Fill, Line } from '../types';
import { margin, raccoon, trigger1, triggerBody } from './reef1';

const F = (spec: FishSpec, palette: PlateDef['palette'], seed: number): PlateDef => ({ build: () => fish({ ...spec, seed }), palette });
/** A fine line across the body from one point in body coordinates to another, as a filled sliver. */
const stroke = (c: FishCtx, pts: [number, number][], w: number, paint: Fill['paint'], o = 1): Fill => ({
  poly: swell(spline(pts.map(([x, f]) => at(c.s, tAtX(c.s, x), f)), false), w, 'both'),
  paint,
  o,
  clip: 'trunk',
});

// ── Bluestreak cleaner wrasse ────────────────────────────────────────────────
// Slim and small; one bold black stripe from the snout through the eye to the tail, widening
// behind; pale blue-grey above and white-blue below; a blue streak under the black over the tail
// stock; the tail edged in bright blue; tiny mouth at the very tip.
const cleaner: FishSpec = {
  tip: [0, 0.4],
  blunt: 0.5,
  top: [[1.5, -1.2], [4, -3], [8, -5], [14, -6.6], [22, -7.6], [32, -8], [44, -7.6], [56, -6.6], [68, -5.2], [76, -4], [80, -3.5]],
  bot: [[1.5, 1.8], [4, 3.4], [8, 5], [14, 6.4], [22, 7.2], [32, 7.5], [44, 7.2], [56, 6.2], [68, 4.8], [76, 3.6], [80, 3.2]],
  dorsal: [{ from: 28, to: 77, spines: 9, rays: 13, h: [[0, 3], [0.4, 4.4], [1, 3.8]], notch: 0.1, rake: [20, 60] }],
  anal: [{ from: 50, to: 77, spines: 3, rays: 10, h: [[0, 3], [0.4, 4.2], [1, 3.6]], notch: 0.1, rake: [30, 60] }],
  caudal: { type: 'rounded', len: 20, h: 8, rays: 14 },
  pectoral: { at: [24, 0.6], base: 2, h: [[0, 7], [1, 5]], angles: [20, 60], rays: 8 },
  pelvic: { at: [22, 0.9], base: 1.6, h: [[0, 6], [1, 3]], angles: [60, 80], rays: 5 },
  eye: { x: 6.2, f: 0.34, r: 1.25, iris: '#B9A04A' },
  gill: { x: 16, bow: 1.6, f0: 0.2, f1: 0.8, preopercle: false },
  mouth: [[0.2, 0.62], [1.6, 0.66]],
  lips: 0.4,
  scales: 0,
  lateral: false,
  belly: 0.6,
  softBelly: true,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    // The black stripe: thin on the snout, deepening to cover the middle third of the tail stock.
    const upper: [number, number][] = [[0.3, 0.38], [4, 0.3], [10, 0.31], [20, 0.34], [34, 0.34], [50, 0.3], [64, 0.28], [78, 0.24]];
    const lower: [number, number][] = [[0.3, 0.6], [4, 0.52], [10, 0.5], [20, 0.5], [34, 0.5], [50, 0.56], [64, 0.64], [78, 0.74]];
    const stripe = spline([...upper.map(([x, f]) => at(s, tAtX(s, x), f)), ...lower.reverse().map(([x, f]) => at(s, tAtX(s, x), f))], true);
    const blue = stroke(c, [[46, 0.7], [58, 0.78], [70, 0.86], [78, 0.9]], 1.7, '#2E86D6', 0.95);
    const blueEdge = c.caudal.trailing;
    return {
      marks: [{ poly: stripe, paint: 'ink', o: 0.95, clip: 'trunk' }, blue],
      median: [
        {
          part: 'caudal',
          marks: [
            { poly: swell(blueEdge, 2.6, 'both'), paint: '#2E86D6', o: 0.9 },
          ],
        },
      ],
    };
  },
};

// ── Picasso triggerfish ──────────────────────────────────────────────────────
// A cream-and-tan triangle with a white belly; blue and yellow lines through and round the eye; a
// dark brown diagonal band behind the head; three or four blue-and-white stripes sloping across the
// lower rear flank; a black-and-white barred streak on the tail stock; orange-yellow lips.
const picasso: FishSpec = {
  ...triggerBody(0.9),
  dorsal: [trigger1, { from: 48, to: 75, rays: 24, h: [[0, 6], [0.2, 7], [1, 4]], rake: [40, 70], paint: '#D9CBA4' }],
  anal: [{ from: 50, to: 75, rays: 22, h: [[0, 6], [0.2, 6.5], [1, 4]], rake: [40, 70], paint: '#D9CBA4' }],
  caudal: { type: 'truncate', len: 16, h: 10, rays: 14, paint: '#B8AE96' },
  eye: { x: 21, f: 0.24, r: 1.4, iris: '#B8862E' },
  extra: (c) => {
    const s = c.s;
    const X = (x: number) => tAtX(s, x);
    const back = region(s, X(8), X(80), -0.1, 0.42);
    const shoulder = shapeIn(s, [[X(30), -0.05], [X(40), -0.05], [X(48), 0.14], [X(54), 0.4], [X(47), 0.4], [X(38), 0.2]]);
    const stripes: Fill[] = [];
    [38, 44, 50, 56].forEach((x, i) => {
      const pts: [number, number][] = [[x + 7, 0.98], [x + 3.5, 0.76], [x, 0.56 - i * 0.02]];
      stripes.push(stroke(c, pts, 2.2, '#EEF4F4', 0.95), stroke(c, pts.map(([px, f]) => [px - 0.2, f + 0.09] as [number, number]), 0.9, '#3677C9', 0.9));
    });
    // Blue lines through and round the eye, a yellow one behind it.
    const eyeLines: Fill[] = [
      stroke(c, [[17, 0.0], [17.8, 0.22], [17.2, 0.46]], 0.9, '#2F6FD0', 0.95),
      stroke(c, [[19.2, -0.04], [20, 0.22], [19.6, 0.5]], 0.9, '#2F6FD0', 0.95),
      stroke(c, [[24, -0.04], [24.6, 0.2], [24, 0.46]], 1, '#F0C23A', 0.95),
    ];
    // The streak on the tail stock: a black bar with white beads.
    const streak: Fill[] = [stroke(c, [[62, 0.42], [70, 0.44], [76, 0.44]], 1.7, 'ink', 0.95), ...[64, 68, 72].map((x): Fill => ({ poly: ellipse(atX(s, x, 0.44), 0.7, 0.5), paint: 'light', clip: 'trunk' }))];
    const lips: Fill = { poly: ellipse(atX(s, 1.2, 0.74), 2, 1.3), paint: '#F29A28', edge: 0.8 };
    const chin = stroke(c, [[2, 0.82], [10, 0.92], [18, 0.98]], 1.6, '#F0A030', 0.95);
    return {
      tint: [{ poly: back, paint: '#A88E62', o: 0.55, clip: 'trunk' }],
      marks: [{ poly: shoulder, paint: '#5B3E26', o: 0.85, clip: 'trunk' }, ...stripes, ...eyeLines, ...streak, chin, lips],
      median: [
        { part: 'dorsal', index: 1, marks: [margin(c.dorsal[1].outline, 0.7, '#6C5B3C', 0.6)] },
        { part: 'anal', marks: [margin(c.anal[0].outline, 0.7, '#6C5B3C', 0.6)] },
      ],
    };
  },
};

// ── Masked butterflyfish ─────────────────────────────────────────────────────
// Bright yellow all over, with many fine orange-red lines running up and down the flank; a blue-grey
// mask patch round the eye and cheek (no black band, no white bar); a thin dark edge to the soft
// dorsal and anal; pale yellow fins.
const masked: FishSpec = {
  ...raccoon,
  extra: (c) => {
    const s = c.s;
    const X = (x: number) => tAtX(s, x);
    const lines: Fill[] = [];
    for (let k = 0; k < 20; k++) {
      const x = 22 + k * 1.95;
      const bow = 0.8 * Math.sin((k / 19) * Math.PI);
      lines.push(stroke(c, [[x, 0.0], [x + 0.5 + bow, 0.5], [x + 0.2, 0.98]], 0.55, '#D8521C', 0.85));
    }
    const mask = shapeIn(s, [[X(7.4), 0.4], [X(9.5), 0.14], [X(14), 0.12], [X(17.4), 0.34], [X(16.4), 0.64], [X(11), 0.7], [X(8), 0.58]]);
    return {
      marks: [...lines, { poly: mask, paint: '#4A5792', o: 0.92, clip: 'trunk', edge: 0.8 }],
      median: [
        { part: 'dorsal', index: 1, marks: [margin(c.dorsal[1].outline, 0.7, '#3B4A86', 0.7)] },
        { part: 'anal', marks: [margin(c.anal[0].outline, 0.7, '#3B4A86', 0.7)] },
        { part: 'dorsal', index: 0, marks: [margin(c.dorsal[0].outline, 0.6, '#3B4A86', 0.5)] },
      ],
    };
  },
};

const SLIM = (pts: [number, number][]): [number, number][] => pts.map(([x, y]) => [x, y * 0.74]);

// ── Pygmy sweeper ────────────────────────────────────────────────────────────
// A slim, glassy little fish with a gold-bronze flush on the back; very big eyes; a mouth that
// opens upward; a single soft dorsal, a long anal fin and a deeply forked tail; a faint darker
// line along the flank; clear, pale amber fins.
const sweeper: FishSpec = {
  tip: [0, 0.8],
  blunt: 0.5,
  noseTilt: 0.3,
  top: SLIM([[1, -2], [3, -5], [6, -8], [11, -10.6], [18, -12.2], [28, -12.6], [40, -12], [52, -10.4], [62, -8], [70, -5.8], [76, -4], [80, -3.6]]),
  bot: SLIM([[1, 2.2], [3, 4.6], [6, 7.2], [11, 9.8], [18, 11.6], [28, 12.2], [40, 11.8], [52, 10.4], [62, 8], [70, 5.6], [76, 4], [80, 3.6]]),
  dorsal: [{ from: 30, to: 52, spines: 1, rays: 11, h: [[0, 5], [0.3, 7], [1, 4]], rake: [25, 60] }],
  anal: [{ from: 44, to: 74, spines: 2, rays: 24, h: [[0, 4], [0.3, 6.2], [1, 4]], rake: [30, 62] }],
  caudal: { type: 'forked', len: 20, h: 10, fork: 0.5, rays: 16 },
  pectoral: { at: [22, 0.56], base: 2, h: [[0, 8], [1, 6]], angles: [20, 55], rays: 9 },
  pelvic: { at: [24, 0.9], base: 1.6, h: [[0, 5], [1, 3]], angles: [60, 80], rays: 5 },
  eye: { x: 7.6, f: 0.36, r: 2.5, iris: '#A9B452', ring: false },
  gill: { x: 18, bow: 1.6, f0: 0.15, f1: 0.85, preopercle: false },
  mouth: [[0.2, 0.6], [2.2, 0.7], [4.6, 0.74]],
  lips: 0.3,
  lateral: 0.42,
  belly: 0.7,
  softBelly: true,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const back = region(s, tAtX(s, 12), 1, -0.05, 0.3);
    const midline = stroke(c, [[20, 0.42], [40, 0.4], [60, 0.4], [78, 0.42]], 1.2, '#6F5A2A', 0.4);
    const gold = stroke(c, [[10, 0.2], [30, 0.16], [60, 0.2]], 3.4, '#E0B13A', 0.35);
    return { tint: [{ poly: back, paint: '#B98A1E', o: 0.3, clip: 'trunk' }], marks: [midline, gold] };
  },
};

// ── Longnose hawkfish ────────────────────────────────────────────────────────
// A long, pointed, tube-like snout; a white body netted all over with red lines (a grid of
// squares); a spiny dorsal with a tuft of bristles on the tip of each spine; big pectoral and
// pelvic fins used to perch on sea fans; a squared tail.
const hawkfish: FishSpec = {
  tip: [0, 0.6],
  blunt: 0.25,
  top: [[2, -1.5], [6, -2.6], [12, -4.4], [18, -6.8], [24, -8.6], [32, -9.6], [44, -9.8], [56, -8.6], [68, -6.4], [76, -4.8], [80, -4.2]],
  bot: [[2, 1.4], [6, 2.4], [12, 3.8], [18, 5.8], [26, 7.6], [36, 8.6], [46, 8.6], [58, 7.2], [68, 5.6], [76, 4.2], [80, 3.8]],
  dorsal: [{ from: 22, to: 72, spines: 10, rays: 11, h: [[0, 5.5], [0.2, 8], [0.45, 6.6], [0.5, 5.4], [1, 5]], notch: 0.3, rake: [10, 55] }],
  anal: [{ from: 54, to: 73, spines: 3, rays: 6, h: [[0, 3], [0.4, 5], [1, 4]], notch: 0.1, rake: [30, 60] }],
  caudal: { type: 'truncate', len: 18, h: 8.5, rays: 14 },
  pectoral: { at: [26, 0.62], base: 3, h: [[0, 12], [1, 9]], angles: [10, 55], rays: 11 },
  pelvic: { at: [27, 0.9], base: 2.2, h: [[0, 10], [1, 5]], angles: [55, 85], rays: 6 },
  eye: { x: 20, f: 0.34, r: 1.7, iris: '#E7D6A0' },
  gill: { x: 28, bow: 1.8, f0: 0.18, f1: 0.82, preopercle: false },
  mouth: [[0.2, 0.55], [4.4, 0.58], [8.4, 0.62]],
  lips: 0.3,
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const red = '#D2402A';
    const marks: Fill[] = [];
    // Horizontal red lines along the flank (the long axis of the net) …
    for (const f of [0.14, 0.38, 0.64, 0.88]) marks.push(stroke(c, [[21, f], [40, f + 0.02], [60, f], [78, f - 0.02]], 0.85, red, 0.92));
    // … crossed by upright ones, leaning back a little.
    for (let k = 0; k < 14; k++) {
      const x = 24 + k * 4.1;
      marks.push(stroke(c, [[x, -0.02], [x + 1.4, 0.5], [x + 0.6, 1.02]], 0.8, red, 0.92));
    }
    // On the long snout: a red stripe each side of the eye line and a few cross-bars.
    marks.push(stroke(c, [[1, 0.28], [10, 0.3], [20, 0.18]], 0.9, red, 0.9), stroke(c, [[1.4, 0.52], [10, 0.54], [20, 0.52]], 0.9, red, 0.9));
    [7, 13].forEach((x) => marks.push(stroke(c, [[x, 0.1], [x + 0.5, 0.5], [x, 0.92]], 0.7, red, 0.85)));
    // Bristle tufts on the tips of the dorsal spines.
    const tufts: Line[] = [];
    c.dorsal[0].tips.slice(0, 10).forEach((p, i) => {
      for (const [dx, dy] of [[-0.9, -2.4], [0, -2.9], [0.9, -2.4]]) tufts.push({ pts: [p, [p[0] + dx + i * 0.02, p[1] + dy]], w: 0.5 });
    });
    return {
      marks,
      lines: tufts,
      median: [
        { part: 'dorsal', marks: [margin(c.dorsal[0].outline, 0.9, red, 0.55)] },
        { part: 'caudal', marks: [{ poly: swell(c.caudal.trailing, 1.2, 'both'), paint: red, o: 0.7 }] },
      ],
    };
  },
};

export const MORE_FISH: Record<string, PlateDef> = {
  'bluestreak-cleaner-wrasse': F(cleaner, { back: '#B8C8D4', belly: '#EAF1F4', fin: '#C2D2DE', dark: '#1C2830' }, 31),
  'picasso-triggerfish': F(picasso, { back: '#D6C7A2', belly: '#F4F0E4', fin: '#D9CBA4', dark: '#3A2E20' }, 32),
  'masked-butterflyfish': F(masked, { back: '#F3C718', belly: '#F6D83C', fin: '#EFC21C', dark: '#3A3410' }, 33),
  'pygmy-sweeper': F(sweeper, { back: '#D1AE55', belly: '#EFE6C8', fin: '#E9DBAA', dark: '#4A3C18' }, 34),
  'longnose-hawkfish': F(hawkfish, { back: '#F2EADB', belly: '#FAF6EC', fin: '#EFE1CE', dark: '#4A2A20' }, 35),
};
