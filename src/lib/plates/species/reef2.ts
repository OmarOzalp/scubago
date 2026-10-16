/**
 * Reef fish, part two: eels, tang, batfish, sweetlips, puffers and boxfish, trumpetfish,
 * crocodilefish and flying gurnard (from above), jawfish, garibaldi, sea bass, lingcod, anthias.
 */
import { add, blob, type Ctrl, ellipse, inside, lerp, mul, norm, perp, type Pt, rng, spline, sub } from '../kit';
import { scatter, scatterIn, shapeIn } from '../marks';
import { tube } from '../ray';
import type { PlateDef } from '../registry';
import { rotateGeom, swell } from '../render';
import { at, atX, contours, finLines, lineAlong, medianFin, outlineOf, region, spliceFins, tAtX, trunk } from '../side';
import { eel, type EelCtx, type EelSpec } from '../eel';
import { fish, type FishCtx, type FishSpec, ring } from '../fish';
import { mirrorY, topShark, type TopSharkSpec } from '../topshark';
import { emptyGeom, type Fill, type Line, type Part, type PlateGeom } from '../types';

const F = (spec: FishSpec, palette: PlateDef['palette'], seed: number, rotate = 0): PlateDef => ({
  build: () => (rotate ? rotateGeom(fish({ ...spec, seed }), rotate) : fish({ ...spec, seed })),
  palette,
});
const E = (spec: EelSpec, palette: PlateDef['palette'], seed: number): PlateDef => ({ build: () => eel({ ...spec, seed }), palette });
const margin = (outline: Pt[], w: number, paint: Fill['paint'], o = 1): Fill => {
  const n = outline.length;
  const inner = outline.map((p, i) => add(p, mul(perp(norm(sub(outline[Math.min(n - 1, i + 1)], outline[Math.max(0, i - 1)]))), -w)));
  return { poly: [...outline, ...inner.reverse()], paint, o };
};

// ── Giant moray ──────────────────────────────────────────────────────────────
// A massive, deep-jowled head on a thick body; a black blotch round the round gill hole; a
// speckled head giving way to leopard spots, then mottling towards the tail; an open mouth with
// fangs.
const morayWidth = (k: number) => (t: number) => k * (t < 0.03 ? 1.6 + (t / 0.03) * 1.8 : t < 0.13 ? 3.4 + 1 * Math.sin(((t - 0.03) / 0.1) * (Math.PI / 2)) : 4.4 * (1 - (t - 0.13) / 0.87) ** 0.65 + 0.35);
const morayPath: Ctrl[] = [[0, 38], [10, 36], [22, 39.4], [36, 47], [52, 49.4], [68, 45], [84, 40.6], [97, 44]];
const giantMoray: EelSpec = {
  spine: morayPath,
  width: morayWidth(1.7),
  dorsal: { from: 0.08, h: (t) => 1.4 + 0.3 * Math.sin(t * 3) },
  anal: { from: 0.47, h: () => 1.2 },
  mouth: { to: 0.085, open: 2.6, teeth: 6 },
  eye: { t: 0.035, f: -0.42, r: 0.8 },
  gill: { t: 0.125, f: 0.05, r: 0.55, blotch: 2.4 },
  extra: (c) => {
    const rand = rng(11);
    const marks: Fill[] = [];
    // Fine speckles on the head, leopard spots on the body, mottling towards the tail.
    for (const f of scatterIn(c.body, { r: 0.3, gap: 0.5, paint: 'ink', rand, tries: 2400 })) {
      const p = f.poly[0];
      const t = p[0] / 97;
      if (t < 0.15) marks.push({ ...f, o: 0.8 });
    }
    for (const f of scatterIn(c.body, { r: 0.85, gap: 0.6, paint: 'ink', rand, tries: 1600 })) {
      const t = f.poly[0][0] / 97;
      if (t >= 0.15 && t < 0.55) marks.push({ ...f, o: 0.85 });
    }
    for (const f of scatterIn(c.body, { r: 1.5, gap: 0.5, paint: 'dark', rand, tries: 1000, wobble: 0.5 })) {
      const t = f.poly[0][0] / 97;
      if (t >= 0.55) marks.push({ ...f, o: 0.6 });
    }
    return { marks: marks.map((m) => ({ ...m, clip: 'trunk' as const })), lines: [{ pts: [c.at(0.005, -0.5), add(c.at(0.005, -0.5), mul(c.dir(0), -1))], w: 1.4 }] };
  },
};

// ── Green moray ──────────────────────────────────────────────────────────────
// A big moray silhouette (thick, one continuous fin, no pectorals); completely plain, even green;
// an open mouth with heavy teeth; a small gill slit at mid-height.
const greenMoray: EelSpec = {
  spine: [[0, 40], [10, 38], [22, 41.4], [36, 49], [52, 51.4], [68, 47], [84, 42.6], [97, 46]],
  width: morayWidth(1.5),
  dorsal: { from: 0.08, h: () => 1.5 },
  anal: { from: 0.46, h: () => 1.3 },
  mouth: { to: 0.08, open: 2.4, teeth: 6 },
  eye: { t: 0.035, f: -0.42, r: 0.75 },
  extra: (c) => ({
    lines: [
      { pts: [c.at(0.118, -0.1), c.at(0.123, 0.35)], w: 1.6 },
      ...[0.06, 0.08, 0.1].map((t) => ({ pts: [c.at(t, 0.7), c.at(t + 0.005, 0.95)], w: 0.6, o: 0.6 })),
    ],
    marks: [0.02, 0.04, 0.06].map((t) => ({ poly: ellipse(c.at(t, 0.55), 0.3), paint: 'dark' as const })),
  }),
};

// ── Ribbon eel ───────────────────────────────────────────────────────────────
// The flared, leaf-like front nostrils; an extremely thin ribbon body rising out of a burrow; a
// blue body with yellow snout and jaw; a tall yellow dorsal frill; an open mouth with chin
// tentacles.
const ribbon: EelSpec = {
  spine: [[6, 16], [14, 15], [22, 20], [27, 30], [26, 42], [30, 54], [36, 64], [38, 74]],
  width: (t) => (t < 0.04 ? 0.5 + (t / 0.04) * 0.8 : 1.3 - t * 0.2),
  dorsal: { from: 0.04, h: () => 2.4, paint: '#F5D21E' },
  mouth: { to: 0.045, open: 1.6, teeth: 4 },
  eye: { t: 0.032, f: -0.3, r: 0.55, iris: '#F2C230' },
  engrave: [-0.5, 0.5],
  extra: (c) => {
    const snout = tube([c.at(0, 0), c.at(0.05, 0)], (t) => 1.45 + t * 0.3);
    // Leaf-like nostril flares on top of the snout, just behind its tip.
    const flare = (t: number, s: number): Part => {
      const base = c.at(t, -1);
      const tip = add(base, add(mul(c.up(t), 2.6), mul(c.dir(t), -0.6 * s)));
      const n = perp(norm(sub(tip, base)));
      return { poly: spline([base, add(lerp(base, tip, 0.5), mul(n, 1.2)), add(tip, mul(n, 1.4)), add(tip, mul(n, -1.4)), add(lerp(base, tip, 0.5), mul(n, -1.2))], true), paint: '#F5D21E', lines: [], edge: 0.6 };
    };
    const tentacles: Line[] = [0, 1, 2].map((k) => {
      const p = add(c.at(0.004, 1), mul(c.up(0), -1.6));
      return { pts: [p, add(p, [-0.8 + k * 0.5, 1.6])], w: 0.8 };
    });
    // The burrow: a mound of sand round the eel where it disappears.
    const base = c.at(1, 0);
    const mound = spline([add(base, [-22, 6]), add(base, [-8, 1]), add(base, [0, -0.6]), add(base, [8, 1]), add(base, [24, 6])], false);
    const sand: Line[] = [{ pts: mound, w: 1, taper: 'both' }];
    for (let k = 0; k < 30; k++) {
      const p = add(base, [(c.rand() - 0.5) * 40, 2 + c.rand() * 5]);
      sand.push({ pts: [p, add(p, [0.3, 0.1])], w: 1, o: 0.5 });
    }
    return {
      marks: [{ poly: snout, paint: '#F5D21E', clip: 'trunk' }],
      near: [flare(0.012, 1), flare(0.02, -1)],
      lines: [...tentacles, ...sand, { pts: [c.at(0, -0.1), add(c.at(0, -0.1), mul(c.dir(0), -1.6))], w: 1 }],
    };
  },
};

// ── Spotted garden eel ───────────────────────────────────────────────────────
// A colony of thin eels rising vertically from the sand in question-mark curves; a large black
// blotch just behind the head; pale bodies peppered with tiny black dots; a big eye on a blunt
// little head.
function gardenEels(): PlateGeom {
  const make = (x: number, top: number, seed: number) =>
    eel({
      spine: [[x - 4, top + 1], [x + 1, top - 1], [x + 4.6, top + 4], [x + 4, top + 16], [x + 2.4, top + 30], [x + 2.2, 78]],
      width: (t) => (t < 0.04 ? 0.6 + (t / 0.04) * 0.7 : 1.3),
      dorsal: { from: 0.06, h: () => 0.5 },
      eye: { t: 0.03, f: -0.2, r: 0.7, iris: '#E9C33A' },
      engrave: [-0.4, 0.5],
      seed,
      extra: (c) => ({
        marks: [
          ...scatterIn(c.body, { r: 0.2, gap: 0.5, paint: 'ink', rand: c.rand, tries: 500 }).map((f) => ({ ...f, clip: 'trunk' as const })),
          { poly: ellipse(c.at(0.11, 0), 1.6, 2.2), paint: 'ink', o: 0.92, clip: 'trunk' },
          { poly: ellipse(c.at(0.48, 0), 1.4, 2.6), paint: 'ink', o: 0.92, clip: 'trunk' },
        ],
      }),
    });
  const main = make(48, 22, 1);
  const others = [make(22, 34, 2), make(74, 30, 3)];
  // The others join the plate as their own parts behind the main eel.
  for (const o of others) {
    main.far.push({ poly: o.body, paint: 'back', lines: o.engraving, edge: 1, marks: o.marks.map((m) => ({ ...m, clip: undefined })) });
    main.eyes.push(...o.eyes);
  }
  // Sand.
  const sand: Line[] = [{ pts: Array.from({ length: 30 }, (_, i) => [4 + i * 3.3, 78 + Math.sin(i) * 0.4] as Pt), w: 1, taper: 'both' }];
  const rand = rng(7);
  for (let k = 0; k < 50; k++) {
    const p: Pt = [6 + rand() * 92, 79 + rand() * 6];
    sand.push({ pts: [p, add(p, [0.3, 0.1])], w: 1, o: 0.5 });
  }
  main.lines.push(...sand);
  return main;
}

// ── Wolf eel ─────────────────────────────────────────────────────────────────
// Big rounded pectoral fins on an eel-shaped body; a bulbous "old man" head with thick lips; dark
// spots ringed with pale; a long dorsal tapering to a pointed tail; front fangs.
const wolfEel: EelSpec = {
  spine: [[0, 40], [10, 39], [22, 43], [36, 50], [52, 51], [68, 45], [84, 41], [100, 44], [110, 50]],
  width: (t) => {
    const head = t < 0.05 ? 1.4 + 4.6 * Math.sqrt(1 - (1 - t / 0.05) ** 2) : 6 + 0.3 * Math.sin(Math.min(1, (t - 0.05) / 0.07) * Math.PI);
    const body = 4 * (1 - Math.max(0, t - 0.1) / 0.9) ** 0.8 + 0.25;
    const b = Math.min(1, Math.max(0, (t - 0.1) / 0.08));
    return 1.35 * (head * (1 - b * b * (3 - 2 * b)) + body * b * b * (3 - 2 * b));
  },
  dorsal: { from: 0.1, h: (t) => 1.8 - t * 0.8 },
  anal: { from: 0.42, h: () => 1.3 },
  mouth: { to: 0.06, open: 1.4, teeth: 3 },
  eye: { t: 0.04, f: -0.5, r: 1.1 },
  extra: (c) => {
    // The lumpy head and thick lips.
    const lumps: Fill[] = [0.015, 0.03, 0.045, 0.06].map((t, i) => ({ poly: blob(c.at(t, -0.75 + (i % 2) * 0.2), 1.2, 0.3, c.rand, 8), paint: 'back', edge: 0.6 }));
    const lips = swell([c.at(0, 0.1), c.at(0.03, 0.35), c.at(0.06, 0.25)], 1.6, 'both');
    // Pectoral: a big rounded fan behind the head.
    const pb = c.at(0.11, 0.2);
    const fan: Pt[] = [];
    for (let k = 0; k <= 10; k++) {
      const a = ((-40 + k * 14) * Math.PI) / 180;
      fan.push(add(pb, [Math.cos(a) * 7.4, Math.sin(a) * 7.4]));
    }
    const pec: Part = { poly: spline([pb, ...fan], true, 0.9), paint: 'fin', lines: fan.map((t) => ({ pts: [pb, lerp(pb, t, 0.9)], w: 0.6, taper: 'end' as const })), edge: 0.85 };
    const spots = scatterIn(c.body, { r: 1.1, gap: 1.4, paint: 'pattern', rand: c.rand, tries: 500 });
    const ocelli: Fill[] = spots.flatMap((s) => {
      const cc = s.poly.reduce((a, p) => [a[0] + p[0] / s.poly.length, a[1] + p[1] / s.poly.length], [0, 0]) as Pt;
      return [{ poly: ellipse(cc, 1.5), paint: '#D3CEC3' as const, clip: 'trunk' as const }, { ...s, clip: 'trunk' as const }];
    });
    return { marks: [...ocelli, ...lumps, { poly: lips, paint: '#B9B3A8', edge: 0.8 }], near: [pec] };
  },
};

// ── Mandarinfish ─────────────────────────────────────────────────────────────
// A blue-and-orange wavy maze over the whole body; a small, stubby body with big bulging eyes on
// top; the male's tall sail first dorsal; broad pelvic "feet" and fan pectorals; thick lips.
const mandarin: FishSpec = {
  tip: [0, 1],
  blunt: 0.7,
  top: [[0.6, -1.6], [2.4, -4.6], [5, -7.4], [9, -9.6], [14, -10.8], [22, -11], [32, -10.2], [42, -8.8], [52, -7.2], [62, -5.6], [70, -4.6], [76, -4.2]],
  bot: [[0.8, 2.6], [3, 4.6], [7, 6.6], [13, 8.4], [22, 9.4], [32, 9.2], [42, 8], [52, 6.6], [62, 5.2], [70, 4.4], [76, 4]],
  dorsal: [
    { from: 22, to: 28, spines: 4, rays: 0, h: [[0, 24], [0.3, 17], [1, 6]], notch: 0.25, rake: [15, 40] },
    { from: 33, to: 70, rays: 9, h: [[0, 6], [1, 7]], rake: [35, 65] },
  ],
  anal: [{ from: 36, to: 70, rays: 8, h: 6, rake: [35, 65] }],
  caudal: { type: 'rounded', len: 24, h: 9, rays: 11 },
  pectoral: { at: [23, 0.48], base: 3, h: [[0, 8], [0.5, 10], [1, 7]], angles: [-25, 45], rays: 10, paint: 'paper' },
  pelvic: { at: [15, 0.9], base: 3, h: [[0, 8], [1, 6]], angles: [40, 110], rays: 6 },
  eye: { x: 9, f: 0.06, r: 2.2, iris: '#C0262D' },
  mouth: [[0.3, 0.55], [1.6, 0.6], [2.8, 0.58]],
  lips: 0.9,
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const rand = rng(31);
    // Orange islands in a blue sea, each ringed in dark blue: the maze.
    const islands: Fill[] = [];
    for (let k = 0; k < 46; k++) {
      const p = at(s, 0.02 + rand() * 0.97, 0.06 + rand() * 0.88);
      islands.push({ poly: blob(p, 1.3 + rand() * 1.2, 0.6, rand, 10, 1.6 + rand(), rand() * 180), paint: '#F07A1A', clip: 'body', edge: 1.4 });
    }
    const finIslands = (poly: Pt[]) => scatterIn(poly, { r: 1, gap: 0.8, paint: '#F07A1A', rand, tries: 60, wobble: 0.5 }).map((f) => ({ ...f, edge: 1 }));
    return {
      marks: islands,
      median: [
        { part: 'dorsal', index: 0, marks: finIslands(c.dorsal[0].poly) },
        { part: 'anal', marks: [margin(c.anal[0].outline, 0.9, '#1F6FD1')] },
        { part: 'caudal', marks: finIslands(c.caudal.poly) },
      ],
    };
  },
};

// ── Palette surgeonfish (blue tang) ──────────────────────────────────────────
// A black "palette" from eye to tail enclosing a blue oval; a yellow triangular tail with black
// edges; a royal-blue oval body with a blunt snout; the scalpel spine in the yellow on the tail
// stock; a yellow pectoral.
const blueTang: FishSpec = {
  tip: [0, 2],
  blunt: 0.75,
  top: [[0.6, -1], [2.4, -4.6], [5, -8.6], [9, -12.6], [14, -15.6], [21, -17.4], [30, -18], [40, -17.6], [50, -15.6], [60, -12], [68, -8], [74, -5.6], [78, -4.8]],
  bot: [[0.8, 3.4], [3, 6.6], [7, 10], [13, 13.2], [21, 15.6], [30, 16.6], [40, 16.4], [50, 14.6], [60, 11.4], [68, 7.6], [74, 5.4], [78, 4.8]],
  dorsal: [{ from: 22, to: 74, spines: 9, rays: 19, h: [[0, 5], [0.2, 6.6], [1, 7]], notch: 0.15, rake: [40, 70] }],
  anal: [{ from: 40, to: 74, spines: 3, rays: 18, h: [[0, 5], [0.3, 6.6], [1, 6.6]], rake: [40, 70] }],
  caudal: { type: 'emarginate', len: 22, h: 12, rays: 14, paint: '#F7D118' },
  pectoral: { at: [22, 0.52], base: 3, h: [[0, 11], [0.3, 10], [1, 4]], angles: [5, 45], rays: 9, smooth: false, paint: '#F7D118' },
  pelvic: { at: [24, 0.95], base: 2, h: [[0, 6], [1, 3]], angles: [50, 80], rays: 5 },
  eye: { x: 11, f: 0.3, r: 1.8, iris: '#1A1A1A' },
  gill: { x: 20, bow: 1.4, preopercle: false },
  mouth: [[0.3, 0.62], [1.6, 0.66]],
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const X = c.X;
    const palette = shapeIn(s, [
      [X(11), 0.22],
      [X(30), 0.1],
      [X(50), 0.1],
      [X(70), 0.24],
      [X(78), 0.32],
      [X(78), 0.6],
      [X(67), 0.74],
      [X(50), 0.82],
      [X(36), 0.76],
      [X(28), 0.52],
      [X(18), 0.44],
      [X(11), 0.42],
    ]);
    const hole = shapeIn(s, [
      [X(33), 0.42],
      [X(44), 0.3],
      [X(58), 0.32],
      [X(64), 0.46],
      [X(56), 0.62],
      [X(42), 0.64],
    ]);
    const wedge = shapeIn(s, [[X(70), 0.48], [X(78), 0.36], [X(78), 0.62]]);
    const spine = [atX(s, 72, 0.5), atX(s, 75.5, 0.47)];
    return {
      marks: [
        { poly: palette, paint: 'ink', o: 0.94, clip: 'trunk' },
        { poly: hole, paint: '#1B4FC4', clip: 'trunk' },
        { poly: wedge, paint: '#F7D118', clip: 'trunk' },
        { poly: swell(spine, 0.9, 'end'), paint: 'light', edge: 0.6 },
      ],
      median: [
        { part: 'dorsal', marks: [margin(c.dorsal[0].outline, 1, 'ink', 0.9)] },
        { part: 'anal', marks: [margin(c.anal[0].outline, 1, 'ink', 0.9)] },
        { part: 'caudal', marks: [margin(c.caudal.le, 1.6, 'ink'), margin(c.caudal.outline.slice(Math.floor(c.caudal.outline.length * 0.55)), 1.6, 'ink')] },
      ],
    };
  },
};

// ── Circular batfish ─────────────────────────────────────────────────────────
// A disc or spade outline with symmetrical tall dorsal and anal fins; two vertical dark bars (eye
// and behind the head) on silver; black pelvic fins; a steep, concave forehead with a bump
// between the eyes; black-edged rear margins on the median fins.
const batfish: FishSpec = {
  tip: [0, 4],
  blunt: 0.7,
  top: [[0.4, 0], [1.4, -5], [3, -10], [4, -14], [5.4, -18], [7, -22], [10, -27], [15, -32], [22, -36], [30, -38], [40, -38], [50, -35], [60, -28], [68, -19], [74, -11], [78, -7], [80, -6]],
  bot: [[0.6, 7], [2.4, 11], [5, 16], [9, 22], [14, 28], [21, 33], [29, 36.4], [38, 37], [48, 34], [58, 27], [66, 19], [72, 11.6], [77, 7.4], [80, 6.4]],
  dorsal: [{ from: 22, to: 78, spines: 5, rays: 34, h: [[0, 6], [0.15, 15], [0.5, 17], [0.82, 10], [1, 4]], notch: 0.1, rake: [30, 70] }],
  anal: [{ from: 34, to: 78, spines: 3, rays: 27, h: [[0, 8], [0.25, 16], [0.6, 13], [1, 4]], rake: [30, 70] }],
  caudal: { type: 'truncate', len: 18, h: 9, rays: 12, paint: 'paper' },
  pectoral: { at: [22, 0.55], base: 3, h: [[0, 9], [1, 6]], angles: [-5, 40], rays: 9, paint: 'paper' },
  pelvic: { at: [18, 0.98], base: 2, h: [[0, 16], [1, 10]], angles: [62, 82], rays: 5, paint: 'ink' },
  eye: { x: 9, f: 0.36, r: 1.8, iris: '#B8862E' },
  gill: { x: 20, bow: 2.4 },
  mouth: [[0.3, 0.55], [1.6, 0.6]],
  lateral: (t) => 0.3 + 0.05 * t,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const bar = (x0: number, x1: number, o: number): Fill => ({ poly: region(s, tAtX(s, x0), tAtX(s, x1), -0.1, 1.1), paint: 'dark', o, clip: 'body' });
    return {
      marks: [bar(6.5, 12.5, 0.75), bar(19, 28, 0.6)],
      median: [
        { part: 'dorsal', marks: [{ ...margin(c.dorsal[0].te, 1.6, 'ink', 0.85) }] },
        { part: 'anal', marks: [{ ...margin(c.anal[0].te, 1.6, 'ink', 0.85) }] },
        { part: 'caudal', marks: [{ poly: region(s, 0.995, 1, 0.3, 0.7), paint: '#8A4B2D', o: 0 }] },
      ],
    };
  },
};

// ── Oriental sweetlips ───────────────────────────────────────────────────────
// Black-and-white horizontal stripes running onto the belly; yellow fins with black polka dots;
// fat yellow lips on a yellow snout; a square-cut tail; a dark pectoral base.
const sweetlips: FishSpec = {
  tip: [0, 3],
  blunt: 0.6,
  top: [[0.6, -0.4], [2.4, -4], [5, -7.6], [9, -11], [14, -13.4], [21, -14.8], [30, -15.4], [40, -15], [50, -13.4], [60, -10.4], [68, -7.6], [74, -6], [78, -5.4]],
  bot: [[0.8, 4.8], [3, 7], [7, 9.2], [13, 11.2], [21, 12.8], [30, 13.6], [40, 13.4], [50, 12], [60, 9.6], [68, 7.2], [74, 5.8], [78, 5.4]],
  dorsal: [
    { from: 22, to: 49, spines: 13, rays: 0, h: [[0, 5], [0.2, 8], [1, 5]], notch: 0.3, rake: [30, 50], paint: '#F2C21A' },
    { from: 50, to: 75, rays: 20, h: [[0, 6], [0.5, 8], [1, 5]], rake: [40, 70], paint: '#F2C21A' },
  ],
  anal: [{ from: 56, to: 72, spines: 3, rays: 8, h: [[0, 5], [0.5, 9], [1, 6]], rake: [30, 60], paint: '#F2C21A' }],
  caudal: { type: 'truncate', len: 22, h: 11, rays: 14, paint: '#F2C21A' },
  pectoral: { at: [22, 0.56], base: 3, h: [[0, 10], [1, 6]], angles: [0, 40], rays: 9, paint: '#F2C21A' },
  pelvic: { at: [24, 0.95], base: 2.4, h: [[0, 8], [1, 5]], angles: [50, 80], rays: 6, paint: '#F2C21A' },
  eye: { x: 10, f: 0.3, r: 1.6, iris: '#B8862E' },
  gill: { x: 21, bow: 2.6 },
  mouth: [[0.3, 0.7], [2.4, 0.74], [4.4, 0.72]],
  lips: 1.3,
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const face = region(s, 0, tAtX(s, 12), -0.05, 1.05);
    const stripes: Fill[] = [0.08, 0.24, 0.4, 0.56, 0.72, 0.87].map((f, i) => ({
      poly: region(s, tAtX(s, i < 2 ? 4 : 9), 1, (t) => f - 0.02 * t, (t) => f + 0.085 - i * 0.008 - 0.02 * t),
      paint: 'ink' as const,
      o: 0.92,
      clip: 'trunk' as const,
    }));
    const dots = (poly: Pt[]) => scatterIn(poly, { r: 0.7, gap: 1.6, paint: 'ink', rand: c.rand, tries: 120, o: 0.9 });
    return {
      tint: [{ poly: face, paint: '#F2C21A', o: 0.85, clip: 'trunk' }],
      marks: [...stripes, { poly: ellipse(atX(s, 22.6, 0.56), 1.4, 1.8), paint: '#5A2A1E', o: 0.9 }],
      median: [
        { part: 'dorsal', index: 1, marks: dots(c.dorsal[1].poly) },
        { part: 'anal', marks: dots(c.anal[0].poly) },
        { part: 'caudal', marks: dots(c.caudal.poly) },
      ],
    };
  },
};

// ── Starry pufferfish ────────────────────────────────────────────────────────
// A fat, smooth puffer outline with tiny rear dorsal and anal fins and no spines; fine black dots
// on pale grey; a black blotch round the pectoral base and gill slit; a beak mouth; a white belly.
const pufferBody = {
  tip: [0, 1.6] as Pt,
  blunt: 0.9,
  top: [[0.6, -2], [2.6, -6], [6, -10], [11, -13.6], [18, -15.8], [27, -16.6], [37, -16], [47, -14], [57, -11], [65, -8], [71, -6.4], [76, -5.8]] as [number, number][],
  bot: [[0.8, 4], [3, 7.6], [7, 11], [13, 14], [21, 16], [30, 16.6], [40, 15.6], [50, 13.2], [59, 10.2], [66, 7.6], [72, 6.2], [76, 5.8]] as [number, number][],
  dorsal: [{ from: 58, to: 68, rays: 11, h: [[0, 7], [0.4, 9], [1, 5]] as [number, number][], rake: [35, 65] as [number, number] }],
  anal: [{ from: 59, to: 69, rays: 11, h: [[0, 7], [0.4, 8.5], [1, 5]] as [number, number][], rake: [35, 65] as [number, number] }],
  caudal: { type: 'rounded' as const, len: 24, h: 10, rays: 12 },
  pectoral: { at: [24, 0.42] as [number, number], base: 4, h: [[0, 7], [0.4, 8], [1, 5]] as [number, number][], angles: [-20, 40] as [number, number], rays: 12 },
  lateral: false as const,
  softBelly: true,
  engraving: 'smooth' as const,
};
const beak = (c: FishCtx): Fill[] => [
  { poly: shapeIn(c.s, [[c.X(0.1), 0.42], [c.X(2.2), 0.42], [c.X(2.6), 0.56], [c.X(0.4), 0.56]]), paint: '#EDEADE', edge: 0.9 },
  { poly: shapeIn(c.s, [[c.X(0.4), 0.6], [c.X(2.6), 0.6], [c.X(2.2), 0.72], [c.X(0.3), 0.7]]), paint: '#EDEADE', edge: 0.9 },
];
const starPuffer: FishSpec = {
  ...pufferBody,
  eye: { x: 13, f: 0.3, r: 1.9, iris: '#4A4A40', ring: true },
  belly: 0.68,
  extra: (c) => {
    const s = c.s;
    const dots = scatter(s, { t0: 0.03, t1: 1, f0: 0.02, f1: 0.82, r: 0.32, gap: 0.55, paint: 'ink', rand: c.rand, tries: 2200 });
    const blotch = blob(atX(s, 23.5, 0.5), 3.2, 0.35, c.rand, 10, 1.1);
    const tentacle: Line = { pts: spline([atX(s, 8.4, 0.12), add(atX(s, 8.4, 0.12), [0.4, -1.8]), add(atX(s, 8.4, 0.12), [-0.4, -2.4])], false), w: 0.9 };
    const prickles: Line[] = [];
    for (let k = 0; k < 160; k++) {
      const p = at(s, 0.05 + c.rand() * 0.9, 0.1 + c.rand() * 0.85);
      prickles.push({ pts: [p, add(p, [0.3, 0.15])], w: 0.6, o: 0.4, detail: true });
    }
    return {
      marks: [...dots, { poly: blotch, paint: 'ink', o: 0.9, clip: 'trunk' }, ...beak(c)],
      lines: [tentacle, ...prickles],
      median: [{ part: 'caudal', marks: scatterIn(c.caudal.poly, { r: 0.3, gap: 0.6, paint: 'ink', rand: c.rand, tries: 300 }) }],
    };
  },
};

// ── Porcupinefish ────────────────────────────────────────────────────────────
// Long spines lying back over the whole body; a huge bulging eye; black spots on the body and on
// the fins; olive back and white belly; an inset of the inflated spiny ball.
const porcupine: FishSpec = {
  ...pufferBody,
  eye: { x: 13, f: 0.3, r: 3.1, iris: '#6F7A55', ring: true },
  belly: 0.62,
  extra: (c) => {
    const s = c.s;
    const spines: Line[] = [];
    for (let k = 0; k < 150; k++) {
      const t = 0.08 + c.rand() * 0.85;
      const f = 0.05 + c.rand() * 0.9;
      const p = at(s, t, f);
      const len = 1.4 + 2.2 * Math.exp(-(((t - 0.4) / 0.25) ** 2)) * (f > 0.4 ? 1.3 : 1);
      spines.push({ pts: [p, add(p, [len, (f - 0.5) * 0.6])], w: 2.6, o: 0.8, taper: 'end' });
    }
    const spots = scatter(s, { t0: 0.03, t1: 1, f0: 0.02, f1: 0.8, r: 0.5, gap: 1.4, paint: 'ink', rand: c.rand, tries: 700 });
    const finSpots = (poly: Pt[]) => scatterIn(poly, { r: 0.45, gap: 1.2, paint: 'ink', rand: c.rand, tries: 120 });
    // Inset: the fish blown up into a spiky ball, small, up in the corner.
    const ic: Pt = [92, -26];
    const ball = ellipse(ic, 7.4);
    const ballSpines: Line[] = Array.from({ length: 22 }, (_, k) => {
      const a = (k / 22) * Math.PI * 2;
      return { pts: [add(ic, [Math.cos(a) * 7, Math.sin(a) * 7]), add(ic, [Math.cos(a) * 10.4, Math.sin(a) * 10.4])], w: 3, o: 0.85, taper: 'end' as const };
    });
    return {
      marks: [...spots, ...beak(c)],
      lines: spines,
      near: [{ poly: ball, paint: 'back', lines: [...ballSpines, { pts: spline([add(ic, [-5, 2]), add(ic, [0, 5]), add(ic, [5, 2])], false), w: 0.6, o: 0.5 }], edge: 0.9, marks: [{ poly: ellipse(add(ic, [-3.4, -1.6]), 1.6), paint: 'ink' }] }],
      median: [
        { part: 'dorsal', marks: finSpots(c.dorsal[0].poly) },
        { part: 'caudal', marks: finSpots(c.caudal.poly) },
        { part: 'pectoral', marks: finSpots(c.pectoral!.poly) },
      ],
    };
  },
};

// ── Yellow boxfish (juvenile) ────────────────────────────────────────────────
// A cube-like box with tiny fins and a fan tail; bright yellow with evenly spaced black dots; a
// pouting little mouth; hexagonal plates.
const boxfish: FishSpec = {
  tip: [0, 7],
  blunt: 0.7,
  top: [[0.4, 4], [1.4, -1.6], [3.4, -8], [6.6, -12.4], [10.6, -14.6, 1], [20, -15.4], [40, -15.6], [52, -15], [57, -12.6], [61, -7.6], [64, -4.6], [70, -3.8]],
  bot: [[0.6, 9], [2.6, 11.6], [6.4, 14], [12, 15.4, 1], [30, 15.8], [48, 15.2], [55, 13.4], [60, 9], [63, 5], [70, 3.8]],
  dorsal: [{ from: 51, to: 59, rays: 9, h: [[0, 5], [0.5, 6.4], [1, 4]], rake: [35, 65] }],
  anal: [{ from: 52, to: 60, rays: 9, h: [[0, 4.6], [0.5, 6], [1, 4]], rake: [35, 65] }],
  caudal: { type: 'rounded', len: 28, h: 11, rays: 12 },
  pectoral: { at: [26, 0.45], base: 3, h: [[0, 6], [1, 4]], angles: [-20, 40], rays: 8, paint: 'paper' },
  eye: { x: 14, f: 0.26, r: 2.6, iris: '#3A3A2A' },
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    // Hexagonal plates: a honeycomb of fine seams over the box.
    const seams: Line[] = [];
    const hex = 4;
    for (let row = -1; row < 10; row++) {
      for (let col = -1; col < 18; col++) {
        const cx = col * hex * 1.5;
        const cy = -16 + row * hex * 1.73 + (col % 2 ? hex * 0.866 : 0);
        const pts: Pt[] = Array.from({ length: 7 }, (_, k) => [cx + Math.cos((k / 6) * Math.PI * 2) * hex, cy + Math.sin((k / 6) * Math.PI * 2) * hex] as Pt);
        if (pts.some((p) => inside(p, c.trunk))) seams.push({ pts, w: 0.5, o: 0.55 });
        if (inside([cx, cy], c.trunk) && cx > 4) seams.push({ pts: [[cx, cy], [cx, cy]], w: 0 });
      }
    }
    const spots: Fill[] = [];
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 18; col++) {
        const cx = col * hex * 1.5;
        const cy = -16 + row * hex * 1.73 + (col % 2 ? hex * 0.866 : 0);
        if (inside([cx, cy], c.trunk) && cx > 3) spots.push({ poly: ellipse([cx, cy], 1), paint: 'ink', clip: 'trunk' });
      }
    }
    const lips = ellipse(atX(s, 0.6, 0.62), 1.4, 1.1);
    return { marks: [...spots, { poly: lips, paint: '#E8A23A', edge: 0.9 }], lines: seams.filter((l) => l.w > 0).map((l) => ({ ...l, pts: l.pts })) };
  },
};

// ── Chinese trumpetfish ──────────────────────────────────────────────────────
// A long rigid stick body with a straight tube snout; a chin barbel; a row of separate dorsal
// spines; dorsal and anal fins far back, opposite each other, and a small rounded tail with black
// spots; held head-down.
const trumpet: FishSpec = {
  tip: [0, 0],
  blunt: 0.95,
  top: [[0.3, -1.2], [1.4, -1.3], [4, -0.9], [10, -0.95], [20, -1.25], [26, -2.4], [30, -3], [40, -3.2], [55, -3.2], [66, -3.6], [74, -3.6], [80, -2.4], [86, -1.3], [89, -1]],
  bot: [[0.3, 1.2], [1.4, 1.3], [4, 0.9], [10, 0.95], [20, 1.25], [26, 2.2], [30, 2.8], [40, 3], [55, 3], [66, 3.4], [74, 3.4], [80, 2.2], [86, 1.2], [89, 1]],
  dorsal: [
    { from: 40, to: 64, spines: 10, rays: 0, h: 2.6, notch: 1, rake: [20, 30] },
    { from: 66, to: 78, rays: 12, h: [[0, 4], [0.4, 6], [1, 2]], rake: [35, 60] },
  ],
  anal: [{ from: 66, to: 78, rays: 12, h: [[0, 4], [0.4, 6], [1, 2]], rake: [35, 60] }],
  caudal: { type: 'rounded', len: 11, h: 4.4, rays: 9, paint: '#E2C04A' },
  pectoral: { at: [31, 0.55], base: 1.4, h: 3.6, angles: [0, 40], rays: 6 },
  pelvic: { at: [56, 0.98], base: 1.4, h: 3, angles: [40, 70], rays: 5 },
  eye: { x: 27, f: 0.4, r: 1.1, iris: '#B8862E' },
  lateral: false,
  belly: 0.7,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const stripes: Fill[] = [0.25, 0.6].map((f) => ({ poly: region(s, tAtX(s, 28), 0.98, f - 0.04, f + 0.04), paint: '#D9CBA6', o: 0.85, clip: 'trunk' as const }));
    const bars: Fill[] = [36, 46, 56, 66, 76].map((x) => ({ poly: region(s, tAtX(s, x), tAtX(s, x + 2), 0, 1), paint: 'dark' as const, o: 0.35, clip: 'trunk' as const }));
    const barbel: Line = { pts: [atX(s, 1.6, 1), add(atX(s, 1.6, 1), [0.8, 2])], w: 1.6, taper: 'end' };
    const gape: Line = { pts: [atX(s, 0.2, 0.5), atX(s, 1.8, 0.55)], w: 1.2 };
    const tailSpots: Fill[] = [c.caudal.trailing[2], c.caudal.trailing[c.caudal.trailing.length - 3]].map((p) => ({ poly: ellipse(lerp(p, atX(s, 89, 0.5), 0.35), 1), paint: 'ink' }));
    return {
      marks: [...bars, ...stripes, { poly: ellipse(atX(s, 56, 0.95), 0.8), paint: 'ink' }],
      lines: [barbel, gape],
      median: [{ part: 'caudal', marks: tailSpots }],
    };
  },
};

// ── Crocodilefish (from above) ───────────────────────────────────────────────
// A flat, broad, crocodile-shaped head seen from above; lacy fringes over the eyes on top of the
// head; a tapering flat body with spread wing-like pelvic and pectoral fins; sand-coloured mottled
// camouflage.
const crocodile: TopSharkSpec = {
  tip: [0, 0],
  blunt: 0.75,
  ...(() => {
    const top: Ctrl[] = [[0.6, -2.8], [3, -4.6], [8, -6.4], [14, -7.9], [20, -9.3], [26, -10.4], [30, -9.6], [34, -7.2], [38, -6.4], [46, -5.6], [56, -4.4], [66, -3.2], [75, -2.4], [82, -1.8]];
    return { top, bot: mirrorY(top) };
  })(),
  pec: { at: 31, base: 7, h: 9, sweep: 0.8, rear: 0.8, round: 4, convex: 0.14, concave: -0.06 },
  pelvic: { at: 41, base: 8, h: 10, sweep: 0.9, rear: 0.8, round: 4, convex: 0.14, concave: -0.06 },
  d1: { at: 36, base: 10, h: 1.6, sweep: 0.4, round: 1 },
  d2: { at: 50, base: 18, h: 1.4, sweep: 0.5, round: 1 },
  caudal: { upper: [0, 0], lower: [0, 0], fork: [0, 0], paddle: [18, 6] },
  eyes: [
    [17, -4.2],
    [17, 4.2],
  ],
  eyeR: 1.4,
  rings: { top: [0.05, 0.12, 0.2], bot: [0.8, 0.88, 0.95] },
  extra: (c) => {
    const rand = rng(21);
    const s = c.s;
    const mottle: Fill[] = [];
    for (const [paint, r, n] of [
      ['#4F4A3C', 1.8, 50],
      ['#CFC8A8', 1.4, 50],
      ['#7A8B5A', 1.2, 20],
    ] as const) {
      for (let k = 0; k < n; k++) {
        const p = at(s, 0.02 + rand() * 0.97, 0.05 + rand() * 0.9);
        mottle.push({ poly: blob(p, r * (0.6 + rand() * 0.8), 0.45, rand, 8, 1.4, rand() * 180), paint, o: 0.75, clip: 'body' });
      }
    }
    // Lacy lappets over each eye.
    const lappets: Line[] = [];
    for (const sy of [-1, 1]) {
      const e: Pt = [17, sy * 4.2];
      for (let k = 0; k < 7; k++) lappets.push({ pts: [add(e, [-1.2 + k * 0.4, -0.2]), add(e, [-1.4 + k * 0.45, 1.1 + (k % 2) * 0.4])], w: 0.6 });
    }
    const cheekSpines: Fill[] = [-1, 1].flatMap((sy) => [0, 1.8].map((dx) => ({ poly: [[28 + dx, sy * 9.6], [32 + dx, sy * 10.2], [29.4 + dx, sy * 8.6]] as Pt[], paint: 'back' as const, edge: 0.6 })));
    const pits: Fill[] = [-1, 1].map((sy) => ({ poly: ellipse([20.4, sy * 4.6], 0.8, 0.5), paint: 'ink', o: 0.7 }));
    return { marks: [...mottle, ...cheekSpines, ...pits], lines: lappets };
  },
};

// ── Flying gurnard (from above) ──────────────────────────────────────────────
// Huge spread fan "wings" reaching the tail, with blue wavy lines and spots; a blunt armoured
// helmet head with backward-pointing spines; a free, flag-like first dorsal spine; a scaly,
// tapering body with a notched tail.
function flyingGurnard(): PlateGeom {
  const g = emptyGeom();
  const rand = rng(91);
  const top: Ctrl[] = [[0.4, -4.6], [2, -6], [6, -6.6], [12, -6.8], [16, -6.4], [24, -5.4], [36, -4.6], [50, -3.6], [62, -2.6], [72, -1.8], [78, -1.4]];
  const s = trunk({ tip: [0, 0], top, bot: mirrorY(top), blunt: 1 });
  const body = outlineOf(s);
  g.trunk = body;
  // Wings: a fan of rays on each side from the body out to a scalloped margin, reaching the tail.
  const wing = (side: 1 | -1): Part & { tips: Pt[] } => {
    const tips: Pt[] = [];
    const bases: Pt[] = [];
    const n = 26;
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1);
      const b: Pt = [20 + u * 8, side * 5.6];
      const a = ((-70 + u * 138) * Math.PI) / 180;
      const r = 44 * (0.75 + 0.25 * Math.sin(Math.PI * u)) * (u > 0.85 ? 1 - (u - 0.85) * 2 : 1);
      bases.push(b);
      tips.push([b[0] + Math.sin(a + Math.PI / 2) * r * 0.9 + u * 18, b[1] + side * Math.cos(a + Math.PI / 2) * -r * 0.62 * (u < 0.15 ? 0.8 : 1)]);
    }
    const ctrl: Ctrl[] = [[bases[0][0], bases[0][1], 1]];
    tips.forEach((t, i) => {
      ctrl.push([t[0], t[1], 1]);
      if (i < n - 1) ctrl.push(lerp(lerp(bases[i], bases[i + 1], 0.5), lerp(t, tips[i + 1], 0.5), 0.94));
    });
    ctrl.push([bases[n - 1][0], bases[n - 1][1], 1]);
    const poly = spline(ctrl, true, 1, 6);
    const lines: Line[] = tips.map((t, i) => ({ pts: [bases[i], lerp(bases[i], t, 0.95)], w: 0.55, taper: 'end' as const }));
    return { poly, paint: 'accent', lines, edge: 0.9, tips };
  };
  const wings = [wing(-1), wing(1)];
  for (const w of wings) {
    // Spots and wavy blue lines across each wing, and a blue margin.
    const spots = scatterIn(w.poly, { r: 0.9, gap: 1.6, paint: '#B8642E', rand, tries: 260, o: 0.9 });
    const wavy: Fill[] = [];
    for (const k of [0.45, 0.62, 0.8]) {
      const pts = w.tips.map((t, i) => lerp([24, Math.sign(t[1]) * 5.6] as Pt, t, k + Math.sin(i * 0.9) * 0.025));
      wavy.push({ poly: swell(pts, 1, 'both'), paint: '#3A86D4', o: 0.9 });
    }
    const edge = margin(spline(w.tips, false), 1.4, '#4FB0EE');
    g.far.push({ ...w, marks: [...spots, ...wavy, edge] });
  }
  g.body = body;
  g.engraving = contours(s, { top: [0.05, 0.12, 0.2], bot: [0.75, 0.84, 0.92] });
  // Scales: keeled rows down the back.
  for (let x = 16; x < 76; x += 2.4) for (const f of [0.3, 0.5, 0.7]) g.lines.push({ pts: [at(s, tAtX(s, x), f - 0.06), at(s, tAtX(s, x + 1.2), f), at(s, tAtX(s, x), f + 0.06)], w: 0.5, o: 0.6, detail: true });
  // Helmet: a plate over the head with backward spines.
  g.lines.push({ pts: spline([[2, -5.6], [9, -6.2], [15, -5.2], [17, 0], [15, 5.2], [9, 6.2], [2, 5.6]], false), w: 1 });
  for (const sy of [-1, 1]) g.near.push({ poly: [[14, sy * 5.6], [30, sy * 6.8], [15, sy * 4.2]] as Pt[], paint: 'back', lines: [], edge: 0.7 });
  // The free first dorsal spine, laid along the back.
  g.lines.push({ pts: [[10, 0], [22, -1.4]], w: 1.4 }, { pts: [[22, -1.4], [24, -1.8]], w: 0.8 });
  // Tail.
  const tail: Pt[] = spline([[77, -1.4], [86, -5.4], [92, -6.4, 1], [89, 0, 1], [92, 6.4, 1], [86, 5.4], [77, 1.4]], false);
  g.far.push({ poly: tail, paint: 'fin', lines: finLines({ le: [[78, -1], [92, -6.4]], te: [[78, 1], [92, 6.4]] }, 6, 0.9, 0.7), edge: 0.85 });
  g.marks.push(...scatterIn(body, { r: 0.7, gap: 1.2, paint: 'dark', rand, tries: 300, o: 0.85 }).map((f) => ({ ...f, clip: 'trunk' as const })));
  g.eyes.push({ c: [8, -4], r: 1.6, iris: '#B8862E' }, { c: [8, 4], r: 1.6, iris: '#B8862E' });
  g.heavy.push(s.bot);
  void medianFin;
  void spliceFins;
  void lineAlong;
  return g;
}

// ── Yellowhead jawfish ───────────────────────────────────────────────────────
// Hovering upright above its burrow; a yellow head on a pale pearly-blue body; big eyes and a big
// mouth on a squarish head; long dorsal and anal fins on a slim tapering body.
const jawfish: FishSpec = {
  tip: [0, 1],
  blunt: 0.8,
  top: [[0.6, -2], [2.6, -5], [6, -7], [12, -8], [20, -8], [30, -7.6], [42, -6.6], [54, -5.4], [64, -4.2], [72, -3.4], [78, -3]],
  bot: [[0.8, 3], [3, 5.6], [8, 7.2], [14, 7.6], [22, 7.4], [32, 7], [44, 6], [56, 4.8], [66, 3.8], [74, 3.2], [78, 3]],
  dorsal: [{ from: 14, to: 76, spines: 11, rays: 15, h: [[0, 4], [0.5, 5], [1, 4.6]], notch: 0.12, rake: [40, 65], paint: '#BFD3E6' }],
  anal: [{ from: 40, to: 76, spines: 2, rays: 15, h: [[0, 4], [1, 4.4]], rake: [40, 65], paint: '#BFD3E6' }],
  caudal: { type: 'rounded', len: 22, h: 6, rays: 11, paint: '#BFD3E6' },
  pectoral: { at: [19, 0.5], base: 2.6, h: [[0, 7], [1, 5]], angles: [-10, 40], rays: 9, paint: '#BFD3E6' },
  pelvic: { at: [12, 0.98], base: 1.6, h: [[0, 7], [1, 5]], angles: [40, 70], rays: 5, paint: '#BFD3E6' },
  eye: { x: 8.4, f: 0.24, r: 2.2, iris: '#E0B43A' },
  gill: { x: 18, bow: 2 },
  mouth: [[0.3, 0.58], [5, 0.66], [9.6, 0.6]],
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const head = [8, 14, 20].map((x, i) => ({ poly: region(s, 0, tAtX(s, x), -0.1, 1.1), paint: '#F3C623' as const, o: [0.55, 0.3, 0.18][i], clip: 'body' as const }));
    // The burrow below the tail, ringed with rubble.
    const tailEnd = atX(s, 78, 0.5);
    const rubble: Part[] = Array.from({ length: 9 }, (_, k) => ({
      poly: blob(add(tailEnd, [28 + (k % 3) * 2.6, (k - 4) * 3.4]), 1.4 + (k % 2) * 0.8, 0.35, c.rand, 7, 1.3),
      paint: '#D8CCAE',
      lines: [],
      edge: 0.7,
    }));
    return { tint: head, far: rubble, median: [{ part: 'dorsal', marks: [{ poly: region(s, tAtX(s, 14), tAtX(s, 26), -1, 0.05), paint: '#F3C623', o: 0.8, clip: 'body' }] }] };
  },
};

// ── Garibaldi ────────────────────────────────────────────────────────────────
// Solid brilliant orange all over, with no pattern; a deep oval damselfish body; a notched tail
// with big rounded lobes; a high, rounded soft dorsal.
const garibaldi: FishSpec = {
  tip: [0, 2],
  blunt: 0.8,
  top: [[0.6, -1], [2.4, -4.6], [5, -8.4], [9, -12], [14, -14.8], [21, -16.4], [30, -17], [40, -16.6], [50, -14.6], [60, -11.2], [67, -8], [72, -6.4], [76, -5.8]],
  bot: [[0.8, 3.4], [3, 6.4], [7, 9.6], [13, 12.6], [21, 14.8], [30, 15.8], [40, 15.4], [50, 13.6], [60, 10.6], [67, 7.8], [72, 6.4], [76, 5.8]],
  dorsal: [
    { from: 22, to: 50, spines: 12, rays: 0, h: [[0, 5], [0.3, 7], [1, 7]], notch: 0.2, rake: [35, 50] },
    { from: 51, to: 74, rays: 16, h: [[0, 9], [0.5, 13], [1, 7]], rake: [45, 75] },
  ],
  anal: [{ from: 52, to: 73, spines: 2, rays: 13, h: [[0, 6], [0.5, 11], [1, 6]], rake: [40, 72] }],
  caudal: { type: 'heart', len: 24, h: 13, fork: 0.55, rays: 14 },
  pectoral: { at: [24, 0.52], base: 3.4, h: [[0, 10], [0.5, 11], [1, 7]], angles: [-10, 40], rays: 10 },
  pelvic: { at: [26, 0.94], base: 2.4, h: [[0, 9], [1, 5]], angles: [50, 80], rays: 6 },
  eye: { x: 10, f: 0.32, r: 1.9, iris: '#E07A2A' },
  gill: { x: 21, bow: 2.6 },
  mouth: [[0.3, 0.6], [1.8, 0.64], [3, 0.62]],
  scales: 9,
  lateral: (t) => 0.22 + 0.05 * t,
  belly: 1.5,
  softBelly: false,
  extra: (c) => ({
    median: [
      { part: 'dorsal', index: 1, marks: [margin(c.dorsal[1].outline, 0.6, '#3D7BD9', 0.8)] },
      { part: 'anal', marks: [margin(c.anal[0].outline, 0.6, '#3D7BD9', 0.8)] },
      { part: 'caudal', marks: [margin(c.caudal.trailing, 0.6, '#3D7BD9', 0.8)] },
    ],
  }),
};

// ── Giant sea bass ───────────────────────────────────────────────────────────
// A huge, deep, heavy perch-shaped body; scattered black spots on grey; a low spiny dorsal before
// a higher rounded soft dorsal; a big mouth.
const seaBass: FishSpec = {
  tip: [0, 2],
  blunt: 0.5,
  top: [[0.6, -1.4], [2.6, -5], [6, -9], [11, -12.6], [17, -15], [25, -16.4], [35, -16.8], [45, -16], [55, -13.6], [64, -10.4], [71, -8], [76, -7], [80, -6.6]],
  bot: [[0.8, 3.4], [3, 6.6], [7, 10], [13, 13.2], [21, 15.4], [30, 16.4], [40, 16.4], [50, 15], [60, 12.4], [68, 9.6], [74, 7.6], [80, 6.8]],
  dorsal: [
    { from: 26, to: 47, spines: 11, rays: 0, h: [[0, 3], [0.2, 4], [1, 3]], notch: 0.3, rake: [30, 45] },
    { from: 48, to: 70, rays: 10, h: [[0, 5], [0.4, 8], [1, 4]], rake: [40, 70] },
  ],
  anal: [{ from: 58, to: 70, spines: 3, rays: 9, h: [[0, 4], [0.5, 7.5], [1, 4]], rake: [35, 65] }],
  caudal: { type: 'emarginate', len: 20, h: 12, rays: 14 },
  pectoral: { at: [27, 0.52], base: 3.4, h: [[0, 9], [0.4, 10], [1, 6]], angles: [-5, 45], rays: 11 },
  pelvic: { at: [28, 0.95], base: 2.4, h: [[0, 7], [1, 4]], angles: [50, 80], rays: 6 },
  eye: { x: 9, f: 0.3, r: 1.1, iris: '#9A8A5A' },
  gill: { x: 25, bow: 3 },
  mouth: [[0.4, 0.58], [6, 0.62], [11, 0.56]],
  scales: 11,
  lateral: (t) => 0.24 + 0.08 * t,
  belly: 0.84,
  extra: (c) => {
    const spots = scatter(c.s, { t0: 0.18, t1: 1, f0: 0.08, f1: 0.82, r: (t) => 0.9 + c.rand() * 1, gap: 2.6, paint: 'ink', rand: c.rand, tries: 140, wobble: 0.35 });
    // A frond of kelp behind, for scale and place.
    const kelp = spline([[58, 36], [63, 18], [57, 0], [63, -18], [59, -36]], false);
    const stipe: Part = { poly: tube(kelp, (t) => 1.1 - t * 0.5), paint: '#8F9A5A', lines: [], edge: 0.6 };
    const blades: Part[] = [0.12, 0.3, 0.48, 0.66, 0.84].map((u, i) => {
      const b = kelp[Math.round(u * (kelp.length - 1))];
      const side = i % 2 ? 1 : -1;
      const tip = add(b, [side * 13, -4 - i]);
      const mid = lerp(b, tip, 0.5);
      const bulb = add(b, [side * 1.6, 0.4]);
      const leaf = spline([bulb, add(mid, [0, -2.4]), [tip[0], tip[1], 1], add(mid, [0, 2]), bulb], true);
      return { poly: leaf, paint: '#A7AD6E', lines: [{ pts: [bulb, lerp(bulb, tip, 0.85)], w: 0.8, o: 0.5, taper: 'end' as const }], edge: 0.6, marks: [{ poly: ellipse(bulb, 1.1), paint: '#8F9A5A', edge: 0.5 }] };
    });
    return { marks: spots, far: [...blades, stipe] };
  },
};

// ── Lingcod ──────────────────────────────────────────────────────────────────
// A huge head with a cavernous, fanged mouth; a long tapering body with a long, deeply notched
// dorsal; big fan pectorals propping it on rock; irregular mottling and one pale lateral line;
// small flaps above the eyes.
const lingcod: FishSpec = {
  tip: [0, 1.2],
  blunt: 0.15,
  top: [[1, -1.2], [4, -3.6], [8, -6], [13, -7.8], [20, -9], [28, -9.4], [38, -9], [48, -8], [58, -6.6], [68, -5], [76, -3.8], [82, -3.2]],
  bot: [[1, 2.2], [4, 4], [8, 5.8], [14, 7.4], [22, 8.4], [30, 8.8], [40, 8.4], [50, 7.4], [60, 6], [70, 4.6], [77, 3.6], [82, 3.2]],
  dorsal: [
    { from: 27, to: 50, spines: 24, rays: 0, h: [[0, 4], [0.3, 5.6], [1, 3]], notch: 0.3, rake: [30, 50] },
    { from: 52, to: 79, rays: 22, h: [[0, 6], [0.4, 6.6], [1, 4]], rake: [40, 65] },
  ],
  anal: [{ from: 54, to: 79, spines: 3, rays: 22, h: [[0, 5], [0.5, 6], [1, 4]], rake: [40, 65] }],
  caudal: { type: 'truncate', len: 18, h: 8, rays: 12 },
  pectoral: { at: [28, 0.56], base: 4, h: [[0, 11], [0.5, 13], [1, 9]], angles: [10, 80], rays: 14 },
  pelvic: { at: [27, 0.96], base: 2, h: [[0, 6], [1, 4]], angles: [50, 80], rays: 5 },
  eye: { x: 13, f: 0.26, r: 1.4, iris: '#B8862E' },
  gill: { x: 26, bow: 3 },
  mouth: [[0.4, 0.62], [9, 0.66], [17, 0.56]],
  lateral: (t) => 0.32 + 0.04 * t,
  belly: 0.78,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const mottle = [...scatter(s, { t0: 0.03, t1: 1, f0: 0.02, f1: 0.75, r: (t) => 1.4 + c.rand() * 1.4, gap: 0.8, paint: 'dark', rand: c.rand, tries: 300, o: 0.6, wobble: 0.5 }), ...scatter(s, { t0: 0.1, t1: 1, f0: 0.1, f1: 0.75, r: 0.7, gap: 2, paint: '#A5703B', rand: c.rand, tries: 80, o: 0.85 })];
    const fangs: Fill[] = [2, 4, 6, 8].map((x) => {
      const p = atX(s, x, 0.63);
      return { poly: [add(p, [-0.3, 0]), add(p, [0.1, x % 4 ? 1.3 : -1.3]), add(p, [0.35, 0])], paint: 'light', edge: 0.6 };
    });
    const cirrus: Part = { poly: spline([atX(s, 12.4, 0.04), add(atX(s, 12.4, 0.04), [-0.6, -2]), add(atX(s, 13.6, 0.04), [0.6, -1.8]), atX(s, 14, 0.06)], true), paint: 'back', lines: [], edge: 0.6 };
    const ll = lineAlong(s, (t) => 0.32 + 0.04 * t, tAtX(s, 27), 0.99);
    // A rock it rests on.
    const rock = spline([[2, 21, 1], [5, 13], [12, 10.4], [22, 9.2], [30, 10.6], [40, 8.6], [52, 9.4], [62, 11.6], [74, 10.8], [86, 12.6], [94, 16], [97, 21, 1]], true);
    const cracks: Line[] = [
      { pts: [[30, 10.6], [31, 14], [29, 17], [31, 20]], w: 1.1 },
      { pts: [[62, 11.6], [60, 15], [62, 19]], w: 1.1 },
      ...[14, 22, 44, 52, 72, 80, 88].map((x, i) => ({ pts: [[x, 13 + (i % 3)], [x - 3, 20]] as Pt[], w: 0.7, o: 0.45 })),
    ];
    return { marks: [...mottle, ...fangs, { poly: swell(ll, 0.8, 'both'), paint: '#F0EDE5', clip: 'trunk' }], near: [cirrus], far: [{ poly: rock, paint: '#B2A994', lines: cracks, edge: 0.8 }] };
  },
};

// ── Sea goldie (scalefin anthias, male) ──────────────────────────────────────
// A long third dorsal-spine filament; a deep lyre tail with streaming lobes; a magenta-pink body
// with yellow scale flecks; a red-purple patch on the pectoral; an orange stripe from the eye.
const goldie: FishSpec = {
  tip: [0, 1],
  blunt: 0.5,
  top: [[0.8, -1.4], [3, -4.4], [6, -7.4], [10, -10], [16, -11.8], [24, -12.6], [34, -12.4], [44, -11], [54, -8.6], [62, -6.2], [68, -4.8], [72, -4.4]],
  bot: [[0.8, 2.6], [3, 5], [7, 7.6], [13, 10], [21, 11.4], [30, 11.8], [40, 11.2], [50, 9.4], [58, 7.2], [65, 5.4], [70, 4.6], [72, 4.4]],
  dorsal: [{ from: 18, to: 69, spines: 10, rays: 17, h: [[0, 5], [0.12, 6], [0.4, 5.6], [0.85, 7], [1, 5]], notch: 0.12, rake: [35, 65] }],
  anal: [{ from: 46, to: 66, spines: 3, rays: 7, h: [[0, 5], [0.5, 8], [1, 5]], rake: [35, 60] }],
  caudal: { type: 'lyre', len: 22, h: 12, fork: 0.3, filament: 12, rays: 14 },
  pectoral: { at: [20, 0.56], base: 2.6, h: [[0, 10], [0.4, 9], [1, 4]], angles: [5, 45], rays: 10 },
  pelvic: { at: [22, 0.96], base: 2, h: [[0, 12], [1, 6]], angles: [45, 70], rays: 5 },
  eye: { x: 9, f: 0.32, r: 2, iris: '#E0B43A' },
  gill: { x: 18, bow: 2 },
  mouth: [[0.3, 0.42], [2.4, 0.5], [4, 0.46]],
  scales: 9,
  lateral: (t) => 0.2 + 0.05 * t,
  belly: 1.5,
  softBelly: false,
  extra: (c) => {
    const s = c.s;
    const flecks = scatter(s, { t0: tAtX(s, 18), t1: 1, f0: 0.04, f1: 0.96, r: 0.35, gap: 1.1, paint: '#F6C744', rand: c.rand, tries: 700 });
    const cheek = swell(spline([atX(s, 8, 0.48), atX(s, 13, 0.56), atX(s, 19, 0.58)], false), 1.2, 'both');
    const base = c.dorsal[0].tips[2];
    const filament: Part = { poly: swell(spline([base, add(base, [5, -8]), add(base, [12, -12])], false), 1.2, 'end'), paint: 'back', lines: [], edge: 0.6 };
    return {
      marks: [...flecks, { poly: cheek, paint: '#F59A3A', edge: 0.7 }],
      near: [filament],
      median: [{ part: 'pectoral', marks: [{ poly: ellipse(lerp(c.pectoral!.tips[0], atX(s, 20, 0.56), 0.6), 2, 1.4, 20), paint: '#8C1D5A', o: 0.85 }] }],
    };
  },
};

export const REEF_FISH_2: Record<string, PlateDef> = {
  'giant-moray': E(giantMoray, { back: '#B39A62', belly: '#C9B27A', fin: '#A8894A', dark: '#4A3A24' }, 1),
  'green-moray': E(greenMoray, { back: '#5F7A2E', belly: '#6E8A3A', fin: '#58702A' }, 2),
  'ribbon-eel': E(ribbon, { back: '#1F5BD8', belly: '#1F5BD8', fin: '#F5D21E' }, 3),
  'garden-eel': { build: gardenEels, palette: { back: '#EFE6CF', belly: '#EFE6CF', fin: '#E6DCC0' } },
  'wolf-eel': E(wolfEel, { back: '#8E9196', belly: '#A4A6AA', fin: '#7E8186', pattern: '#2B2722' }, 5),
  mandarinfish: F(mandarin, { back: '#1F6FD1', belly: '#1F6FD1', fin: '#1F6FD1' }, 6),
  'blue-tang': F(blueTang, { back: '#1B4FC4', belly: '#1B4FC4', fin: '#1B4FC4' }, 7),
  'circular-batfish': F(batfish, { back: '#C9C6BA', belly: '#D2CFC4', fin: '#D9CB92', dark: '#3D3B36' }, 8),
  'oriental-sweetlips': F(sweetlips, { back: '#F3F1E8', belly: '#F3F1E8', fin: '#F2C21A' }, 9),
  'star-puffer': F(starPuffer, { back: '#D9D9D2', belly: '#FFFFFF', fin: '#D0D0C8' }, 10),
  porcupinefish: F(porcupine, { back: '#9C9A73', belly: '#F3F1E6', fin: '#B4B290' }, 11),
  'yellow-boxfish': F(boxfish, { back: '#F6D20F', belly: '#F6D20F', fin: '#F2DC66' }, 12),
  trumpetfish: F(trumpet, { back: '#8A6A44', belly: '#A68A60', fin: '#9A7A50' }, 13, -24),
  crocodilefish: { build: () => topShark({ ...crocodile, seed: 14 }), palette: { back: '#8C8A72', belly: '#CFC8A8' } },
  'flying-gurnard': { build: flyingGurnard, palette: { back: '#7F6F63', belly: '#7F6F63', fin: '#8A7A6A', accent: '#C9A27A', dark: '#3B2C24' } },
  'yellowhead-jawfish': F(jawfish, { back: '#E2E9EE', belly: '#E2E9EE', fin: '#BFD3E6' }, 16, 52),
  garibaldi: F(garibaldi, { back: '#FF6A13', belly: '#FF6A13', fin: '#FF7A2A' }, 17),
  'giant-sea-bass': F(seaBass, { back: '#6E6C66', belly: '#BDB8AE', fin: '#5E5C56' }, 18),
  lingcod: F(lingcod, { back: '#6B6450', belly: '#E8E2D2', fin: '#6B6450', dark: '#3A3128' }, 19),
  'sea-goldie': F(goldie, { back: '#D63A7A', belly: '#E0567A', fin: '#E05A86' }, 20),
};
void ring;
void (null as unknown as EelCtx);
