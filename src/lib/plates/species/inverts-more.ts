/**
 * Three more small invertebrates: the banded coral shrimp, the varicose wart slug and the hairy
 * squat lobster (see inverts.ts for the others).
 */
import { add, ellipse, lerp, mul, norm, perp, type Pt, resample, rng, spline, sub } from '../kit';
import type { PlateDef } from '../registry';
import { swell } from '../render';
import { softUnion } from '../soft';
import { corner, leaf, limb, oblong } from './inverts';
import { emptyGeom, type Fill, type Line, type Paint, type Part, type PlateGeom } from '../types';

const RED = '#D2271E';

// ── Banded coral shrimp ──────────────────────────────────────────────────────
// Red and white bands all down the body and tail; two or three pairs of very long, curving white
// antennae; a long pair of banded claws held forward, fringed with spines; slender pale-blue legs
// that stand it up off the rock; a banded tail fan.
function bandedCoral(): PlateGeom {
  const g = emptyGeom();
  const spine = resample(spline([[76, 55], [88, 53], [100, 55], [110, 60], [117, 67]], false), 40);
  const body = softUnion(
    [
      { c: [64, 57], rx: 15, ry: 9.4, rot: -6 },
      ...spine.filter((_, i) => i % 4 === 0).map((p, i) => ({ c: p, rx: 5.4 - i * 0.28, ry: 7.6 - i * 0.55 })),
    ],
    0.12,
    0.3,
  );
  g.body = body;
  g.trunk = body;
  // Red bands across the abdomen, white between; a red cap and a red band on the carapace.
  const band = (i0: number, i1: number): Fill => {
    const a = spine[i0];
    const b = spine[i1];
    const da = norm(sub(spine[Math.min(39, i0 + 1)], spine[Math.max(0, i0 - 1)]));
    const db = norm(sub(spine[Math.min(39, i1 + 1)], spine[Math.max(0, i1 - 1)]));
    return { poly: [add(a, mul(perp(da), 12)), add(b, mul(perp(db), 12)), add(b, mul(perp(db), -12)), add(a, mul(perp(da), -12))], paint: RED, clip: 'trunk' };
  };
  const bands: Fill[] = [band(2, 7), band(11, 16), band(20, 25), band(29, 34)];
  const cap: Fill = { poly: spline([[50, 50], [58, 47], [68, 47], [74, 52], [70, 54], [62, 52], [54, 54]], true), paint: RED, clip: 'trunk' };
  const carapaceBand: Fill = { poly: [[70, 40], [76, 40], [76, 70], [70, 70]], paint: RED, clip: 'trunk' };
  g.marks.push(...bands, cap, carapaceBand);
  g.engraving.push(...[0.82, 0.62].map((k, i) => ({ pts: body.filter((p) => p[1] > 60).map((p) => lerp([88, 56], p, k)), w: 1.2 - i * 0.4, taper: 'both' as const })));
  // Segment seams.
  for (const i of [8, 17, 26, 35]) {
    const p = spine[i];
    const d = norm(sub(spine[Math.min(39, i + 1)], spine[i - 1]));
    g.lines.push({ pts: [add(p, mul(perp(d), 7.4 - i * 0.12)), add(p, mul(perp(d), -(7.4 - i * 0.12)))], w: 0.8, o: 0.7, taper: 'both' });
  }
  // The tail fan, banded.
  const tf: Pt = spine[39];
  g.far.push({
    poly: spline([add(tf, [-2, -2]), add(tf, [3, 1]), add(tf, [6, 6]), corner(tf, [3.6, 12]), add(tf, [0, 9]), corner(tf, [-3.2, 11.4]), add(tf, [-4.6, 5]), add(tf, [-3.6, 0])], true),
    paint: 'light',
    lines: [0.3, 0.6].map((k) => ({ pts: [tf, add(tf, [-1 + k * 6, 10])] as Pt[], w: 0.6, o: 0.6 })),
    edge: 0.8,
    marks: [{ poly: spline([add(tf, [-3, 5]), add(tf, [5, 6.4]), add(tf, [6, 8.6]), add(tf, [-3.6, 8])], true), paint: RED, o: 0.9 }],
  });
  // Long white antennae sweeping out and back, and shorter antennules between them.
  g.far.push(
    limb([[50, 52], [38, 38], [22, 24], [10, 12], [6, 3]], 0.8, 0.25, 'light', 0),
    limb([[50, 56], [34, 62], [16, 74], [6, 92]], 0.8, 0.25, 'light', 0),
    limb([[52, 50], [46, 38], [40, 28]], 0.6, 0.2, 'light', 0),
  );
  // Slender pale-blue walking legs that hold it up.
  const legPaint: Paint = '#BCD0E6';
  for (const [x, dx, far] of [
    [74, -5, true],
    [80, 4, true],
    [86, 7, false],
    [92, 12, false],
  ] as const) g.far.push(limb([[x, 64], [x + dx * 0.6, 78], [x + dx, 94]], 0.8, 0.4, legPaint, 2, 0.6), ...(far ? [] : []));
  // The long banded claws held forward, fringed with spines.
  const claw = (path: [number, number][], palmTip: Pt, w: number, far: boolean) => {
    const arm = limb(path, 1.5, 1.1, 'light', 3, 0.8);
    arm.marks = [0.22, 0.5, 0.78].map((u) => {
      const c = resample(spline(path, false), 30);
      const i = Math.round(u * 29);
      const d = norm(sub(c[Math.min(29, i + 1)], c[Math.max(0, i - 1)]));
      const p = c[i];
      return { poly: [add(p, add(mul(perp(d), 2), mul(d, -1.6))), add(p, add(mul(perp(d), 2), mul(d, 1.6))), add(p, add(mul(perp(d), -2), mul(d, 1.6))), add(p, add(mul(perp(d), -2), mul(d, -1.6)))], paint: RED, o: 0.95 };
    });
    const last = path[path.length - 1];
    const palm = leaf(last, palmTip, w, 0.5);
    const d = norm(sub(palmTip, last));
    const finger = leaf(lerp(last, palmTip, 0.4), add(lerp(last, palmTip, 0.98), mul(perp(d), w * 0.45)), w * 0.4, 0.5);
    const bristles: Line[] = [];
    const c = resample(spline(path, false), 30);
    for (let k = 3; k < 28; k += 2) {
      const dd = norm(sub(c[k + 1], c[k - 1]));
      for (const sd of [-1, 1]) bristles.push({ pts: [add(c[k], mul(perp(dd), sd * 1.3)), add(c[k], add(mul(perp(dd), sd * 3.2), mul(dd, 1)))], w: 0.5, o: 0.8 });
    }
    const palmPart: Part = { poly: palm, paint: '#9DB7DC', lines: bristles, edge: 0.8, marks: [{ poly: leaf(add(last, mul(d, w * 0.5)), add(last, mul(d, w * 1.6)), w * 0.5, 0.5), paint: RED, o: 0.9 }] };
    (far ? g.far : g.near).push(arm, palmPart, { poly: finger, paint: '#9DB7DC', lines: [], edge: 0.8 });
  };
  claw([[62, 64], [46, 74], [32, 74], [22, 68]], [8, 58], 7, true);
  claw([[68, 66], [52, 80], [38, 84], [26, 80]], [10, 72], 7.6, false);
  g.eyes.push({ c: [47.6, 53], r: 1.2 });
  g.heavy.push(body.filter((p) => p[1] > 58));
  return g;
}

// ── Varicose wart slug ───────────────────────────────────────────────────────
// Seen from above: an oval, warty sea slug; a pale blue-grey back crossed lengthwise by thick black
// ridges that join up in loops; yellow-tipped knobs strung along the ridges, each ringed in black;
// a black rim to the mantle; a pair of yellow-ringed rhinophores near the front.
function varicose(): PlateGeom {
  const g = emptyGeom();
  const rand = rng(97);
  const C: Pt = [100, 62];
  const A = 62;
  const B = 27;
  const mantle = oblong(C, A, B, 2.5, 0.1, 260, 0.9, 17);
  g.body = mantle;
  g.trunk = mantle;
  // The foot shows below the near edge.
  g.far.push({ poly: oblong(add(C, [1, 3.2]), A - 3, B - 1, 2.4, 0.1), paint: '#C8D4E2', lines: [], edge: 0.8 });
  // Black rim round the mantle.
  const inner = oblong(C, A - 2, B - 2, 2.5, 0.1, 260, 0.5, 17);
  g.marks.push({ poly: [...mantle, ...inner.slice().reverse()], paint: 'ink', o: 0.9, clip: 'trunk' });
  // The ridges: wavy black bands running the length of the back, joined across now and then.
  const half = (x: number) => B * Math.sqrt(Math.max(0, 1 - ((x - C[0]) / A) ** 2 * 0.96)) * (1 - 0.1 * (((x - C[0]) / A + 1) / 2));
  const ridgeLine = (u: number, x0: number, x1: number, wob: number): Pt[] =>
    Array.from({ length: 40 }, (_, i) => {
      const x = x0 + ((x1 - x0) * i) / 39;
      return [x, C[1] + u * half(x) + Math.sin(i * 0.55 + u * 9) * wob] as Pt;
    });
  const ridges: Pt[][] = [-0.7, -0.33, 0.04, 0.4, 0.74].map((u, i) => ridgeLine(u, C[0] - A * (0.84 - (i % 2) * 0.08), C[0] + A * (0.8 - (i % 2) * 0.06), 1.1));
  const marks: Fill[] = ridges.map((r) => ({ poly: swell(r, 2.6, 'both'), paint: 'ink', o: 0.95, clip: 'trunk' as const }));
  // Cross links between neighbouring ridges.
  for (let i = 0; i < ridges.length - 1; i++)
    for (const k of [10, 20, 30]) if ((k + i * 7) % 3 !== 0) marks.push({ poly: swell([ridges[i][k], lerp(ridges[i][k], ridges[i + 1][k + 1], 0.5), ridges[i + 1][k + 1]], 1.8, 'both'), paint: 'ink', o: 0.9, clip: 'trunk' });
  g.marks.push(...marks);
  // Yellow-tipped knobs along the ridges, each in a black ring.
  const knobs: Fill[] = [];
  ridges.forEach((r, ri) => {
    for (let k = 3 + (ri % 2) * 2; k < 38; k += 4) {
      const c = r[k];
      knobs.push({ poly: ellipse(c, 2.5, 2.3), paint: 'ink', clip: 'trunk' }, { poly: ellipse(c, 1.5, 1.4), paint: '#F4C21B', clip: 'trunk' });
    }
  });
  // A few small yellow knobs out in the blue between the ridges.
  for (let k = 0; k < 26; k++) {
    const x = C[0] - A * 0.78 + rand() * A * 1.56;
    const y = C[1] + (rand() * 2 - 1) * half(x) * 0.86;
    if (ridges.some((r) => r.some((p) => Math.hypot(p[0] - x, p[1] - y) < 3.4))) continue;
    knobs.push({ poly: ellipse([x, y], 1.2, 1.1), paint: '#F4C21B', clip: 'trunk', edge: 0.4 });
  }
  g.marks.push(...knobs);
  // The rhinophores: yellow clubs in black rings, close together near the front.
  for (const dy of [-2.2, 2.2]) g.marks.push({ poly: ellipse([C[0] - A * 0.62, C[1] + dy], 2.1, 1.7), paint: 'ink', clip: 'trunk' }, { poly: ellipse([C[0] - A * 0.62, C[1] + dy], 1.2, 0.9), paint: '#F4C21B', clip: 'trunk' });
  g.engraving.push(
    ...[0.9, 0.78].map((k, i) => ({ pts: oblong(C, (A - 2) * k, (B - 2) * k, 2.5, 0.1).filter((p) => p[1] > C[1] + 4), w: 1.1 - i * 0.4, taper: 'both' as const })),
  );
  g.heavy.push(mantle.filter((p) => p[1] > C[1] + 6));
  return g;
}

// ── Hairy squat lobster ──────────────────────────────────────────────────────
// A fingernail-sized pink-lilac crustacean seen from above, wrapped in a halo of long, fine white
// hairs; long slender violet claws held forward; three pairs of thin violet walking legs spread
// to each side; tiny eyes at the front; the tail folded away underneath.
function hairySquat(): PlateGeom {
  const g = emptyGeom();
  const rand = rng(113);
  const body = softUnion([{ c: [102, 64], rx: 14, ry: 10.6 }, { c: [90, 64], rx: 8, ry: 6.4 }, { c: [114, 64], rx: 8, ry: 7 }], 0.14, 0.3);
  g.body = body;
  g.trunk = body;
  const violet: Paint = '#8E4DB8';
  const limbs: { path: [number, number][]; w0: number; w1: number }[] = [
    { path: [[92, 57], [76, 46], [58, 36], [40, 28]], w0: 1.8, w1: 1.1 },
    { path: [[92, 71], [76, 82], [58, 92], [40, 100]], w0: 1.8, w1: 1.1 },
    { path: [[100, 54], [104, 40], [114, 26]], w0: 1.1, w1: 0.6 },
    { path: [[108, 55], [120, 44], [136, 34]], w0: 1.1, w1: 0.6 },
    { path: [[116, 58], [132, 52], [150, 48]], w0: 1.1, w1: 0.6 },
    { path: [[100, 74], [104, 88], [114, 102]], w0: 1.1, w1: 0.6 },
    { path: [[108, 73], [120, 84], [136, 94]], w0: 1.1, w1: 0.6 },
    { path: [[116, 70], [132, 76], [150, 80]], w0: 1.1, w1: 0.6 },
  ];
  const hairs: Fill[] = [];
  const hair = (p: Pt, d: Pt, len: number) => {
    const tip = add(add(p, mul(d, len)), mul(perp(d), (rand() - 0.5) * 1.6));
    hairs.push({ poly: swell([p, lerp(p, tip, 0.55), tip], 0.5, 'both'), paint: '#F3E4EC', o: 0.8, edge: 0.18 });
  };
  limbs.forEach(({ path, w0, w1 }, li) => {
    g.far.push(limb(path, w0, w1, violet, li < 2 ? 2 : 1, 0.7));
    const c = resample(spline(path as Pt[], false), 30);
    for (let k = 3; k < 28; k += 2) {
      const d = norm(sub(c[k + 1], c[k - 1]));
      for (const sd of [-1, 1]) hair(c[k], norm(add(mul(perp(d), sd), mul(d, 0.7))), 2.4 + rand() * 1.4);
    }
  });
  // The pincers: a pair of slender blades at the end of each long claw.
  for (const [base, tip, w] of [
    [[40, 28], [24, 18], 4.4],
    [[40, 100], [24, 110], 4.4],
  ] as [Pt, Pt, number][]) {
    const d = norm(sub(tip, base));
    g.far.push({ poly: leaf(base, tip, w, 0.45), paint: violet, lines: [], edge: 0.7 }, { poly: leaf(base, add(add(tip, mul(perp(d), w * 0.5)), mul(d, -2)), w * 0.6, 0.45), paint: '#A66ACB', lines: [], edge: 0.7 });
  }
  // The halo of hairs round the carapace, and a few over its back.
  const rim = resample(body, 130);
  rim.forEach((p, i) => {
    const d = norm(sub(p, [102, 64]));
    hair(p, d, 4 + rand() * 3);
    if (i % 2 === 0) hair(lerp(p, [102, 64], 0.3), norm(add(d, [rand() * 0.6 - 0.3, rand() * 0.6 - 0.3])), 5 + rand() * 3);
  });
  g.marks.push(...hairs);
  g.engraving.push({ pts: spline([[88, 58], [100, 54], [114, 58]], false), w: 1, taper: 'both', o: 0.6 }, { pts: spline([[88, 70], [100, 74], [114, 70]], false), w: 1, taper: 'both', o: 0.6 });
  g.eyes.push({ c: [86.4, 59], r: 1.2 }, { c: [86.4, 69], r: 1.2 });
  g.heavy.push(body.filter((p) => p[1] > 66));
  return g;
}

export const MORE_INVERTS: Record<string, PlateDef> = {
  'banded-coral-shrimp': { build: bandedCoral, palette: { back: '#F6F1E6', belly: '#F6F1E6', fin: '#F6F1E6', dark: '#7A1A14' } },
  'varicose-wart-slug': { build: varicose, palette: { back: '#8FB2D6', belly: '#C8D4E2', fin: '#8FB2D6', dark: '#1B2430' } },
  'hairy-squat-lobster': { build: hairySquat, palette: { back: '#D88CC0', belly: '#C97BB2', fin: '#8E4DB8', dark: '#5A2A78' } },
};
