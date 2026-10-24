/**
 * Cephalopods: five octopuses told apart by arm length, skin and one signature mark each; three
 * cuttlefish; a squid and a bobtail; the chambered nautilus.
 */
import { add, blob, type Ctrl, ellipse, inside, lerp, type Pt, rng, spline } from '../kit';
import { scatterIn, shapeIn } from '../marks';
import { at, atX, lineAlong, region, tAtX } from '../side';
import { type Arm, armPart, bumps, cuttle, makeArm, octopus } from '../cephalopod';
import { ring } from '../fish';
import type { PlateDef } from '../registry';
import { emptyGeom, type Fill, type Line, type Part, type PlateGeom } from '../types';

/** Spots of colour along an arm. */
const armSpots = (arm: Arm, paint: Fill['paint'], gap: number, r: number, rand: () => number, o = 1): Fill[] => {
  const out: Fill[] = [];
  for (let t = 0.08 + rand() * gap * 0.5; t < 0.92; t += gap * (0.7 + rand() * 0.6)) {
    const c = arm.at(t, (rand() - 0.5) * 0.9);
    out.push({ poly: blob(c, arm.width(t) * r * (0.7 + rand() * 0.5), 0.3, rand, 7), paint, o });
  }
  return out;
};

// ── Day octopus ──────────────────────────────────────────────────────────────
// A purse-shaped mantle tilted up and back; big bulging eyes; arms about four times the mantle,
// thick at the base; a dark eyespot (ocellus) on the web below each eye; a brown network mottle
// with pale spots.
const day: PlateDef = {
  palette: { back: '#7A3E2A', belly: '#9A5A40', dark: '#4A2418' },
  build: () =>
    octopus({
      seed: 3,
      lobes: [
        { c: [62, 20], rx: 17, ry: 11.5, rot: -28 },
        { c: [52, 28], rx: 9, ry: 8.5, rot: -25 },
        { c: [42, 33], rx: 9.5, ry: 8.5 },
        { c: [40, 26.6], rx: 4.6, ry: 4 },
      ],
      crown: { c: [42, 41], rx: 9.5, ry: 5.2 },
      eye: { c: [39.6, 26.4], r: 2.5, iris: '#C9A54A' },
      hub: [56, 24],
      arms: [
        { path: [[40, 43], [28, 41], [18, 39], [9, 40], [3, 44], [2, 49], [5, 51]], w: [3.7, 0.35], suckers: 1 },
        { path: [[40, 45], [31, 49], [21, 53], [12, 56], [6, 56], [4, 53]], w: [3.6, 0.35], suckers: 1 },
        { path: [[43, 45], [41, 52], [36, 58], [30, 61], [26, 59]], w: [3.5, 0.35], suckers: -1 },
        { path: [[46, 45], [51, 53], [59, 58], [68, 59], [73, 56]], w: [3.5, 0.35], suckers: 1 },
        { path: [[48, 43], [59, 47], [72, 51], [84, 52], [92, 49], [94, 44], [91, 42]], w: [3.6, 0.35], suckers: 1 },
        { path: [[41, 42], [32, 45], [22, 47], [13, 47], [8, 45]], w: [3.2, 0.35], suckers: 1, far: true },
        { path: [[47, 42], [60, 43], [75, 44], [87, 41], [91, 37]], w: [3.2, 0.35], suckers: 1, far: true },
        { path: [[44, 44], [48, 53], [47, 60], [43, 63], [40, 61]], w: [3.1, 0.35], suckers: -1, far: true },
      ],
      extra: (c) => {
        const dark = scatterIn(c.body, { r: 1.7, gap: 0.3, paint: 'dark', rand: c.rand, tries: 400, o: 0.5, wobble: 0.5 });
        const pale = scatterIn(c.body, { r: 0.65, gap: 0.9, paint: '#E8DCC4', rand: c.rand, tries: 900, o: 0.9, wobble: 0.35 });
        // The ocellus: a dark eyespot ringed in blue, on the web below and behind the eye.
        const oc: Pt = [45.5, 38.4];
        return {
          marks: [...dark, ...pale],
          cover: [{ poly: ring(oc, 2.1, 2.8), paint: '#3E7EA8' }, { poly: ellipse(oc, 2.1), paint: 'ink', o: 0.9, edge: 0.6 }],
          arms: (arm) => [...armSpots(arm, 'dark', 0.07, 0.8, c.rand, 0.5), ...armSpots(arm, '#E8DCC4', 0.045, 0.32, c.rand, 0.9)],
        };
      },
    }),
};

// ── Giant Pacific octopus ────────────────────────────────────────────────────
// A huge baggy mantle slumped back, with long wrinkles and folds and flat paddle-shaped papillae
// giving a knobbly outline; uniform deep red with a few white spots; very thick arms with big pale
// suckers, two of them twisted to show their rows.
const gpo: PlateDef = {
  palette: { back: '#6A160E', belly: '#86301E', dark: '#40100A' },
  build: () =>
    octopus({
      seed: 8,
      lobes: [
        { c: [68, 21], rx: 22, ry: 14, rot: -12 },
        { c: [74, 29], rx: 14, ry: 8.5, rot: -6 },
        { c: [51, 28], rx: 10, ry: 9, rot: -15 },
        { c: [40, 32], rx: 10, ry: 9 },
        { c: [37, 25.4], rx: 4.6, ry: 4 },
        ...bumps([68, 21], 21.5, 13.6, -12, 175, 355, 16, 1.7),
        ...bumps([40, 32], 9.6, 8.6, 0, 200, 260, 3, 1.3),
      ],
      soft: 0.16,
      crown: { c: [41, 41], rx: 10.5, ry: 5.6 },
      eye: { c: [37, 25.4], r: 2.3, iris: '#B9893A' },
      hub: [62, 24],
      sucker: { size: 1.2 },
      arms: [
        { path: [[38, 43], [28, 46], [18, 51], [11, 57], [12, 63], [18, 64], [21, 61]], w: [4.3, 0.4], face: true },
        { path: [[38, 40], [28, 38], [17, 36], [8, 38], [4, 43], [7, 47]], w: [3.9, 0.4], suckers: 1 },
        { path: [[44, 45], [41, 53], [36, 60], [29, 64]], w: [4, 0.4], suckers: -1 },
        { path: [[47, 45], [55, 54], [65, 60], [77, 62], [87, 58], [91, 52], [88, 49]], w: [4.2, 0.4], face: true },
        { path: [[45, 42], [61, 44], [80, 46], [96, 44], [101, 38]], w: [3.6, 0.4], suckers: 1, far: true },
        { path: [[40, 44], [30, 53], [26, 60], [30, 65]], w: [3.6, 0.4], suckers: -1, far: true },
        { path: [[43, 44], [49, 56], [46, 63], [40, 66]], w: [3.6, 0.4], suckers: -1, far: true },
        { path: [[44, 42], [56, 38], [66, 40]], w: [3.2, 0.5], far: true },
      ],
      extra: (c) => {
        // Long folds along the mantle and paddle-shaped papillae over it.
        const folds: Line[] = [
          [[48, 22], [60, 15], [76, 13], [86, 18]],
          [[50, 27], [62, 22], [78, 21], [88, 25]],
          [[54, 31], [66, 29], [80, 30], [86, 32]],
          [[60, 34], [72, 35], [82, 35]],
        ].map((p, i) => ({ pts: spline(p as Ctrl[], false), w: 1.6 - i * 0.15, taper: 'both' as const }));
        const papillae = scatterIn(c.body, { r: 0.9, gap: 1.4, paint: 'back', rand: c.rand, tries: 300 }).map((f) => ({ ...f, poly: f.poly.map((p) => lerp(p, f.poly[0], 0.2)), edge: 0.5 }));
        const white = [[64, 12], [72, 15], [46, 22]].map((p) => ({ poly: blob(p as Pt, 1.1, 0.2, c.rand, 7), paint: '#F0E2D0' as const }));
        return { marks: [...papillae, ...white], lines: folds };
      },
    }),
};

// ── Blue-ringed octopus ──────────────────────────────────────────────────────
// Tiny and compact, seen from above and to one side; a smooth round mantle; short stout arms; a
// yellow ground covered in bold blue rings, each outlined in black, on the mantle and the arms.
const blueRinged: PlateDef = {
  palette: { back: '#D2AE4E', belly: '#E0C26A', dark: '#6E5420' },
  build: () =>
    octopus({
      seed: 12,
      lobes: [
        { c: [58, 24], rx: 15, ry: 12.5, rot: -18 },
        { c: [48, 30], rx: 9, ry: 8.5 },
        { c: [41, 33], rx: 9, ry: 8.2 },
        { c: [38.5, 27], rx: 4, ry: 3.6 },
      ],
      crown: { c: [41, 40.5], rx: 9.5, ry: 5.6 },
      eye: { c: [38.4, 27], r: 2, iris: '#B98A2E' },
      hub: [54, 26],
      arms: [
        { path: [[37, 41], [27, 41], [18, 44], [13, 49], [15, 53]], w: [2.6, 0.4], suckers: 1 },
        { path: [[39, 43], [33, 50], [27, 55], [21, 56]], w: [2.5, 0.4], suckers: 1 },
        { path: [[43, 44], [46, 52], [44, 58], [40, 60]], w: [2.5, 0.4], suckers: -1 },
        { path: [[46, 43], [55, 49], [65, 52], [72, 49]], w: [2.5, 0.4], suckers: 1 },
        { path: [[37, 39], [28, 35], [20, 33], [14, 35]], w: [2.2, 0.4], suckers: -1, far: true },
        { path: [[47, 41], [60, 42], [70, 40], [74, 36]], w: [2.2, 0.4], suckers: 1, far: true },
        { path: [[42, 44], [36, 53], [34, 59], [37, 63]], w: [2.2, 0.4], far: true },
        { path: [[45, 44], [52, 55], [57, 60], [61, 58]], w: [2.2, 0.4], far: true },
      ],
      extra: (c) => {
        const ringAt = (p: Pt, r: number): Fill[] => [
          { poly: ellipse(p, r * 1.18), paint: '#2A1A10' },
          { poly: ellipse(p, r), paint: '#1E8FE0' },
          { poly: ellipse(p, r * 0.62), paint: '#2A1A10' },
          { poly: ellipse(p, r * 0.48), paint: 'back' },
        ];
        // Large rings over the mantle, with brown patches between them.
        const centres: Pt[] = [];
        for (let k = 0; k < 400 && centres.length < 16; k++) {
          const p: Pt = [40 + c.rand() * 34, 12 + c.rand() * 26];
          if (!inside(p, c.body) || centres.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 6.2)) continue;
          if (Math.hypot(p[0] - 38.4, p[1] - 27) < 4.5) continue;
          centres.push(p);
        }
        const patches = scatterIn(c.body, { r: 2.4, gap: 0.8, paint: 'dark', rand: c.rand, tries: 120, o: 0.35, wobble: 0.4 });
        return {
          marks: [...patches, ...centres.flatMap((p) => ringAt(p, 2.1))],
          arms: (arm) => {
            const out: Fill[] = [];
            for (let t = 0.16; t < 0.85; t += 0.17) out.push(...ringAt(arm.at(t, 0), arm.width(t) * 0.62));
            return out;
          },
        };
      },
    }),
};

// ── Mimic octopus ────────────────────────────────────────────────────────────
// A small teardrop mantle raised over very long, very thin arms splayed across the sand, every
// arm banded chocolate and white; a small horn over each eye.
const mimic: PlateDef = {
  palette: { back: '#D8C4A4', belly: '#E6D6BC', dark: '#4A2C1C' },
  build: () =>
    octopus({
      seed: 21,
      lobes: [
        { c: [55, 17], rx: 9, ry: 5.6, rot: -52 },
        { c: [51, 23], rx: 5, ry: 4.6, rot: -40 },
        { c: [48, 27], rx: 5, ry: 4.6 },
        { c: [46.4, 23.6], rx: 2.6, ry: 2.4 },
      ],
      crown: { c: [48, 31], rx: 5.4, ry: 3.4 },
      eye: { c: [46.4, 23.5], r: 1.5, iris: '#C9A54A', horn: 2.4 },
      hub: [53, 20],
      web: 0.08,
      arms: [
        { path: [[46, 31], [34, 30], [22, 28], [11, 30], [2, 26]], w: [1.5, 0.2] },
        { path: [[46, 33], [37, 40], [27, 47], [17, 55], [8, 58]], w: [1.5, 0.2] },
        { path: [[48, 34], [48, 44], [45, 54], [43, 63], [47, 70]], w: [1.5, 0.2] },
        { path: [[50, 33], [57, 42], [66, 52], [76, 58], [88, 60]], w: [1.5, 0.2] },
        { path: [[51, 31], [63, 33], [77, 36], [91, 34], [100, 30]], w: [1.5, 0.2] },
        { path: [[46, 30], [40, 22], [32, 14], [24, 8], [15, 6]], w: [1.3, 0.2], far: true },
        { path: [[50, 30], [60, 24], [70, 18], [82, 14], [94, 15]], w: [1.3, 0.2], far: true },
        { path: [[49, 33], [54, 44], [60, 54], [61, 64], [57, 70]], w: [1.3, 0.2], far: true },
      ],
      extra: (c) => {
        const bands = (arm: Arm): Fill[] => {
          const out: Fill[] = [];
          let t = 0.1;
          while (t < 0.96) {
            const w = 0.022 + (1 - t) * 0.028;
            out.push({ poly: arm.band(t, t + w, -1.05, 1.05), paint: 'dark' });
            t += w * 2.1;
          }
          return out;
        };
        // Bands across the mantle and head, and the pale U at the mantle's tip.
        const neck: Pt = [48, 27];
        const tip: Pt = [61, 8];
        const across = (u: number, w: number): Fill => {
          const p = lerp(neck, tip, u);
          return { poly: blob(p, 1.3 + w, 0.15, c.rand, 8, 4.2 - u * 1.6, 38), paint: 'dark', o: 0.92 };
        };
        const u: Line = { pts: spline([[58.4, 9.4], [60.6, 12], [63.2, 10.4]], false), w: 3, taper: 'both' };
        return { marks: [0.1, 0.36, 0.6, 0.82].map((k, i) => across(k, i === 1 ? 0.6 : 0.2)), lines: [u], arms: bands };
      },
    }),
};

// ── Coconut octopus ──────────────────────────────────────────────────────────
// Peering out of half a coconut shell and holding the other half up as a lid; a dark branching
// network of veins; dark-edged arms with a bright row of white suckers; a cream wedge below the eye.
const coconut: PlateDef = {
  palette: { back: '#7E4628', belly: '#A86B45', dark: '#3E2416' },
  build: () => {
    const shellPaint = '#6B4A2E';
    // The rim of the bowl the octopus sits in: an ellipse seen from slightly above.
    const rim = (x: number, sign: 1 | -1) => 36 + sign * 6.4 * Math.sqrt(Math.max(0, 1 - ((x - 50) / 26) ** 2));
    const front = Array.from({ length: 27 }, (_, k) => [24 + k * 2, rim(24 + k * 2, 1)] as Pt);
    const bowl: Part = {
      poly: [...front, ...spline([[76, 36], [74.6, 46], [66, 55], [50, 59], [34, 55], [25.4, 46], [24, 36]], false)],
      paint: shellPaint,
      lines: [
        ...[0.2, 0.4, 0.6, 0.8].map((k) => ({ pts: spline([[24 + k * 3, 38 + k * 2], [30 + k * 2, 48 + k * 3], [50, 52 + k * 6], [70 - k * 2, 48 + k * 3], [76 - k * 3, 38 + k * 2]] as Ctrl[], false), w: 0.9 + k, taper: 'both' as const })),
        // Husk fibres: short rough strokes following the curve of the shell.
        ...Array.from({ length: 70 }, (_, k) => {
          const fr = rng(400 + k);
          const x = 27 + fr() * 46;
          const y = rim(x, 1) + 2 + fr() * (16 - Math.abs(x - 50) * 0.32);
          const len = 1.6 + fr() * 2.4;
          const tilt = (x - 50) * 0.02 + (fr() - 0.5) * 0.5;
          return { pts: [[x - len, y - tilt * len], [x, y + 0.3], [x + len, y + tilt * len]] as Pt[], w: 0.7, o: 0.55, taper: 'both' as const };
        }),
      ],
      edge: 1,
      marks: [{ poly: [...front, ...front.slice().reverse().map(([x, y]) => [x, y + 1.3] as Pt)], paint: '#4A3220' }],
    };
    const interior: Part = { poly: ellipse([50, 36], 26, 6.4), paint: '#3A2616', lines: [], edge: 0.9 };
    // The lid: the other half, held up at the upper left, its hollow towards the octopus.
    const lid: Part = {
      poly: spline([[18, 30, 1], [10, 22], [8, 12], [14, 4], [24, 2], [32, 6, 1], [27, 18]], true),
      paint: shellPaint,
      lines: [0.3, 0.55, 0.8].map((k) => ({ pts: spline([[18 + k * 2, 30 - k * 3], [10 + k * 5, 20], [12 + k * 6, 9], [22 + k * 2, 3 + k * 3], [32 - k, 6 + k]] as Ctrl[], false), w: 0.6 + k, taper: 'both' as const })),
      edge: 1.7,
      marks: [
        { poly: spline([[18, 30, 1], [22, 22], [27, 13], [32, 6, 1], [26, 15], [21, 24]], true), paint: '#3A2616' },
        // The three pores of a coconut, on the outer face of the lid.
        ...([[14.6, 13.4], [19.4, 10.4], [17.2, 17.2]] as Pt[]).flatMap((p) => [
          { poly: ellipse(p, 1.35, 1.15), paint: '#4A3220' as const, edge: 0.8 },
          { poly: ellipse(add(p, [-0.3, -0.25]), 0.5), paint: '#1E120A' as const },
        ]),
      ],
    };
    // Husk fibres on the lid, like the bowl's: short rough strokes curving with the shell.
    for (let k = 0; k < 60; k++) {
      const fr = rng(600 + k);
      const x = 9 + fr() * 22;
      const y = 3 + fr() * 26;
      if (!inside([x, y], lid.poly)) continue;
      const len = 1.4 + fr() * 2.2;
      const tilt = -0.9 + (y - 15) * 0.03 + (fr() - 0.5) * 0.5;
      lid.lines.push({ pts: [[x - len, y - tilt * len], [x, y + 0.3], [x + len, y + tilt * len]], w: 0.7, o: 0.55, taper: 'both' });
    }
    const drape = [
      makeArm({ path: [[43, 35], [40, rim(40, 1) - 0.4], [35, 44.4], [29.6, 47], [26.4, 51.6], [28, 55.6], [31.6, 54.8]], w: [2.6, 0.4], suckers: -1 }),
      makeArm({ path: [[56, 35], [60, rim(60, 1) - 0.4], [65.6, 44.4], [71, 47], [74, 51.6], [72.4, 55.6], [68.8, 54.8]], w: [2.6, 0.4], suckers: 1 }),
    ];
    const darkEdges = (arm: Arm): Fill[] => [{ poly: arm.band(0.03, 0.97, -1, -0.55), paint: 'dark', o: 0.75 }, { poly: arm.band(0.03, 0.97, 0.55, 1), paint: 'dark', o: 0.75 }];
    return octopus({
      seed: 31,
      lobes: [
        { c: [60, 16], rx: 12, ry: 9.5, rot: -22 },
        { c: [52, 22.6], rx: 7.6, ry: 7.2, rot: -20 },
        { c: [46, 26.6], rx: 8, ry: 7.4 },
        { c: [44, 20], rx: 3.8, ry: 3.4 },
      ],
      crown: { c: [48, 34], rx: 9, ry: 4.4 },
      eye: { c: [43.8, 19.8], r: 2.1, iris: '#C9A54A' },
      hub: [56, 18],
      sucker: { paint: '#E6EEF2', size: 1.35 },
      arms: [
        // Two arms reaching up to hold the lid.
        { path: [[42, 31], [35, 27], [30, 22], [27, 17], [25, 13]], w: [2.5, 0.8], suckers: 1, far: true },
        { path: [[44, 31], [38, 24], [33, 15], [31, 8], [28, 5]], w: [2.3, 0.8], suckers: 1, far: true },
      ],
      extra: (c) => {
        // Branching veins over the mantle and head.
        const veins: Line[] = [];
        const rand = rng(77);
        const grow = (p: Pt, a: number, len: number, w: number, depth: number) => {
          const pts: Pt[] = [p];
          let cur = p;
          for (let k = 0; k < 5; k++) {
            a += (rand() - 0.5) * 0.8;
            cur = add(cur, [Math.cos(a) * len, Math.sin(a) * len]);
            pts.push(cur);
          }
          veins.push({ pts: spline(pts, false), w, taper: 'end' });
          if (depth > 0) for (const k of [2, 4]) grow(pts[k], a + (rand() > 0.5 ? 0.9 : -0.9), len * 0.6, w * 0.7, depth - 1);
        };
        for (const [p, a] of [
          [[52, 22], -0.5],
          [[54, 26], 0.0],
          [[50, 17], -1.0],
          [[58, 22], -0.3],
          [[48, 30], 0.3],
        ] as const)
          grow(p as Pt, a, 2.6, 2.3, 2);
        return {
          far: [lid, interior],
          lines: veins.filter((l) => l.pts.every((p) => inside(p, c.body))),
          arms: darkEdges,
          near: [bowl, ...drape.map((a) => armPart(a, '#E6EEF2', 1.35, 1, darkEdges(a))), { poly: ellipse([49.6, 35.2], 7.6, 2.6), paint: 'back', lines: [], edge: 0 }],
        };
      },
    });
  },
};

// ── Cuttlefish ───────────────────────────────────────────────────────────────
/** The cone of arms on a cuttlefish's head: [base offset, path] for each, ends pointing forward. */
const armCone = (tip: Pt, arms: { from: Pt; path: Pt[]; w: number; far?: boolean; suckers?: 1 | -1 | 0 }[]) =>
  arms.map((a) => ({ path: [add(tip, a.from), ...a.path] as Ctrl[], w: [a.w, 0.35] as [number, number], far: a.far, suckers: a.suckers ?? 1 }));

/** White blotches along an arm's edge. */
const edgeBlotches = (arm: Arm, side: 1 | -1, n: number, paint: Fill['paint']): Fill[] =>
  Array.from({ length: n }, (_, k) => {
    const t = 0.12 + (k / n) * 0.8;
    return { poly: arm.band(t, t + 0.5 / n, side * 0.35, side * 1), paint };
  });

// ── Broadclub cuttlefish ─────────────────────────────────────────────────────
// A broad oval mantle with a narrow fin along its whole edge; a W pupil with a yellow lower rim;
// a pale saddle across the mantle; white blotches along the arm edges; first arms raised.
const broadclub: PlateDef = {
  palette: { back: '#8E5A3C', belly: '#C7A574', fin: '#D8C6A4', dark: '#5A3422' },
  build: () =>
    cuttle({
      seed: 41,
      tip: [22, 30],
      blunt: 1,
      top: [[23, 24], [26, 19.6], [30.5, 18.2], [34.6, 19.6], [37.6, 19.2], [44, 15.6], [56, 13.6], [70, 13.4], [82, 15], [91, 19], [96, 24.6], [97.6, 30.2]],
      bot: [[23, 35.4], [27, 39.6], [33, 41], [38, 41.6], [50, 44], [64, 45], [77, 44], [87, 40.6], [94, 36], [97.6, 30.6]],
      fin: { t0: 0.2, t1: 0.995, h: (u) => 2.6 + 1 * Math.sin(Math.PI * u), waves: 6 },
      eye: { c: [30.6, 26.4], r: 4, iris: '#C9A54A' },
      arms: armCone([22, 30], [
        { from: [1, -4], path: [[18, 20], [15, 14], [15.6, 9.6]], w: 2.7, suckers: -1 },
        { from: [1, -5], path: [[20, 18], [19, 12.6], [20.6, 9]], w: 2.4, far: true, suckers: -1 },
        { from: [1, -2], path: [[14, 27.6], [6, 29], [1, 30.6]], w: 3.2 },
        { from: [1, 1], path: [[14, 32], [6, 33.6], [1, 33.4]], w: 3.2 },
        { from: [1, 4], path: [[16, 37], [9, 38.4], [4, 37.6]], w: 2.9 },
        { from: [1, -0.5], path: [[14, 29.8], [5, 31.2], [-0.5, 32]], w: 2.7, far: true },
      ]),
      extra: (c) => {
        const { s } = c;
        const t0 = tAtX(s, 54);
        const t1 = tAtX(s, 72);
        const saddle: Fill = { poly: shapeIn(s, [[t0, 0.03], [t0 + 0.02, 0.32], [(t0 + t1) / 2, 0.46], [t1 - 0.02, 0.32], [t1, 0.03]]), paint: '#F4EFE4', o: 0.8, clip: 'trunk' };
        const spots = [...scatterIn(c.body, { r: 0.7, gap: 1.6, paint: '#F4EFE4', rand: c.rand, tries: 260, o: 0.85 }), ...scatterIn(c.body, { r: 1.2, gap: 1, paint: 'dark', rand: c.rand, tries: 160, o: 0.45, wobble: 0.4 })].map((f) => ({ ...f, clip: 'trunk' as const }));
        const rim: Fill = { poly: spline([[26.8, 27.8], [30.6, 31], [34.4, 27.8], [30.6, 29.6]], true), paint: '#E2B83A' };
        const finStripes: Fill[] = Array.from({ length: 16 }, (_, k) => {
          const t = 0.22 + k * 0.048;
          return { poly: [at(s, t, 1), at(s, t + 0.016, 1), add(at(s, t + 0.02, 1), [0, 3.6]), add(at(s, t + 0.004, 1), [0, 3.6])], paint: '#F4EFE4', o: 0.9 };
        });
        return { marks: [saddle, ...spots, rim], fin: finStripes, arms: (arm) => edgeBlotches(arm, (arm.spec.suckers || 1) === 1 ? -1 : 1, 4, '#F4EFE4') };
      },
    }),
};

// ── Giant cuttlefish ─────────────────────────────────────────────────────────
// A display male: two rows of three skin flaps over each eye; a broad rippling fin skirt with a
// pale edge; long robust arms held forward; bold zebra bars over a red-brown and violet mottle.
const giantCuttle: PlateDef = {
  palette: { back: '#7E4A3A', belly: '#9A6A5A', fin: '#B89A8C', dark: '#2E1E1E', pattern: '#6E5A72' },
  build: () =>
    cuttle({
      seed: 43,
      tip: [26, 30],
      blunt: 1,
      top: [[27, 24], [30, 19.6], [34.5, 18.2], [38.6, 19.6], [41.6, 19.2], [48, 15.6], [60, 13.6], [74, 13.4], [86, 15], [94, 19], [98.6, 24.6], [100.2, 30.2]],
      bot: [[27, 35.4], [31, 39.6], [37, 41], [42, 41.6], [54, 44], [68, 45], [81, 44], [90, 40.6], [96.6, 36], [100.2, 30.6]],
      fin: { t0: 0.2, t1: 0.995, h: (u) => 4.4 + 3 * Math.sin(Math.PI * u), waves: 7 },
      eye: { c: [34.6, 26.6], r: 3.8, iris: '#B9893A' },
      arms: armCone([26, 30], [
        { from: [1, -4], path: [[17, 23], [8, 19.6], [0, 19]], w: 3.4, suckers: 1 },
        { from: [1, -1.5], path: [[16, 27.6], [7, 27.4], [-2, 28]], w: 3.6 },
        { from: [1, 1.5], path: [[16, 32.6], [7, 34.4], [-1, 36]], w: 3.6 },
        { from: [1, 4.5], path: [[18, 38], [10, 41.6], [3, 43.6]], w: 3.4 },
        { from: [1, -3], path: [[17, 25.4], [8, 23.6], [-1, 23.6]], w: 3, far: true },
        { from: [1, 0], path: [[16, 30.4], [7, 31.2], [-2, 32]], w: 3, far: true },
      ]),
      extra: (c) => {
        const { s } = c;
        const mottle = [...scatterIn(c.body, { r: 1.6, gap: 0.5, paint: 'pattern', rand: c.rand, tries: 300, o: 0.55, wobble: 0.45 }), ...scatterIn(c.body, { r: 0.55, gap: 1.6, paint: '#F0E8E0', rand: c.rand, tries: 260, o: 0.85 })].map((f) => ({ ...f, clip: 'trunk' as const }));
        // Zebra bars: irregular, lightning-edged dark bands down the mantle.
        const zebra: Fill[] = [48, 54, 60, 66, 72, 78, 84, 90].map((x) => {
          const t = tAtX(s, x);
          const pts: Pt[] = [];
          for (let k = 0; k <= 8; k++) pts.push(at(s, t + (k % 2 ? 0.012 : -0.008) + (c.rand() - 0.5) * 0.01, 0.02 + k * 0.1));
          const back: Pt[] = pts.map((p, k) => add(p, [2 + (k % 3) * 0.6 - k * 0.12, 0])).reverse();
          return { poly: [...pts, ...back], paint: 'dark' as const, o: 0.85, clip: 'trunk' as const };
        });
        // Six flaps over the eye: two rows of three short leaves.
        const flaps: Part[] = [];
        for (const [row, dy, h] of [
          [1, -1.4, 4.4],
          [0, 0, 5.2],
        ] as const) {
          for (let k = 0; k < 3; k++) {
            const b: Pt = [31.2 + k * 3.2 + row * 1.6, 22.6 - row * 0.8 + dy + Math.abs(k - 1) * 0.6];
            flaps.push({ poly: spline([add(b, [-1, 0.4]), add(b, [-0.8, -h * 0.6]), [b[0] + 0.2, b[1] - h, 1], add(b, [0.9, -h * 0.5]), add(b, [1, 0.4])], true), paint: row ? 'pattern' : 'back', lines: [{ pts: [b, add(b, [0.15, -h * 0.85])], w: 0.6, o: 0.6 }], edge: 0.7 });
          }
        }
        return {
          marks: [...mottle, ...zebra],
          near: flaps,
          arms: (arm) => Array.from({ length: 6 }, (_, k) => ({ poly: arm.band(0.1 + k * 0.14, 0.15 + k * 0.14), paint: 'dark' as const, o: 0.8 })),
        };
      },
    }),
};

// ── Flamboyant cuttlefish ────────────────────────────────────────────────────
/** An arm cut to 70% of its length, with its tip curling over. */
const curl = <T extends { path: Ctrl[]; w: [number, number] }>(a: T): T => {
  const [p0, ...rest] = a.path;
  const o: Pt = [p0[0], p0[1]];
  const sc = rest.map((p) => [o[0] + (p[0] - o[0]) * 0.7, o[1] + (p[1] - o[1]) * 0.7] as Pt);
  const last = sc[sc.length - 1];
  const prev = sc[sc.length - 2] ?? o;
  const d: Pt = [last[0] - prev[0], last[1] - prev[1]];
  const l = Math.hypot(d[0], d[1]) || 1;
  const hook: Pt = [last[0] + (d[0] / l) * 1.6 + (-d[1] / l) * 1.8, last[1] + (d[1] / l) * 1.6 + (d[0] / l) * 1.8];
  return { ...a, path: [p0, ...sc, hook], w: [a.w[0] * 0.85, a.w[1]] };
};
// Short, broad and squat, walking on its arms over the sand; three pairs of fleshy flaps standing
// up along the back; blade-like arms tipped pink and red; a yellow fin; dark, white and yellow
// patchwork.
const flamboyant: PlateDef = {
  palette: { back: '#4A2C1E', belly: '#7A5040', fin: '#F2C230', dark: '#2A1810', accent: '#B0447A' },
  build: () =>
    cuttle({
      seed: 47,
      tip: [30, 30],
      blunt: 1,
      top: [[31, 25.4], [34.4, 21.6], [38.6, 20.4], [42, 21.4], [45, 20.6], [52, 17.6], [60, 16.6], [68, 17.6], [74, 20.6], [77.6, 25], [78.6, 29.4]],
      bot: [[31, 34.6], [35, 37.6], [40, 38.6], [46, 39.2], [54, 40], [62, 39.8], [70, 37.6], [76, 34], [78.6, 29.6]],
      fin: { t0: 0.24, t1: 0.995, h: (u) => 1.8 + 0.5 * Math.sin(Math.PI * u), waves: 5, paint: 'fin' },
      eye: { c: [38.8, 26], r: 2.8, iris: '#C9A54A' },
      sucker: '#E8C9D6',
      arms: armCone([30, 30], [
        // Front arms raised and spread; the ventral arms walking.
        { from: [1, -3], path: [[24, 22], [19, 16.6], [15.6, 12.6]], w: 2.4, suckers: -1 },
        { from: [1, -1], path: [[22, 26], [15, 24.6], [10, 25.6]], w: 2.4, suckers: 1 },
        { from: [1, 3], path: [[26, 38], [24, 44], [21, 49.6], [17, 50.4]], w: 2.6, suckers: -1 },
        { from: [2, 4], path: [[33, 41], [35, 46], [36, 50.6], [40, 50.6]], w: 2.6, suckers: 1 },
        { from: [1, -2], path: [[23, 20.6], [20, 14], [19.4, 9.6]], w: 2.2, far: true, suckers: -1 },
        { from: [1, 2], path: [[22, 33], [16, 36], [11, 37]], w: 2.2, far: true },
      ]).map((a) => curl({ ...a, paint: 'accent' as const })),
      extra: (c) => {
        const { s } = c;
        // Papillae: a row of small fleshy points standing up along the back, tipped yellow.
        const flaps: Part[] = [44.6, 48.4, 52.2, 56, 59.8, 63.6, 67.2, 70.6, 73.8].map((x, i) => {
          const h = 2.7 + (i % 3 === 1 ? 0.9 : 0) - i * 0.05;
          const w = 1.25;
          const b = atX(s, x, 0.02);
          const body: Ctrl[] = [add(b, [-w, 1.2]), add(b, [-w * 0.85, -h * 0.5]), add(b, [-w * 0.2, -h * 0.9]), [b[0] + 0.1, b[1] - h, 1], add(b, [w * 0.7, -h * 0.55]), add(b, [w, 1.2])];
          const tip: Ctrl[] = [add(b, [-w * 0.6, -h * 0.62]), add(b, [-w * 0.2, -h * 0.9]), [b[0] + 0.1, b[1] - h, 1], add(b, [w * 0.55, -h * 0.64]), add(b, [0, -h * 0.5])];
          return { poly: spline(body, true), paint: 'back', lines: [], edge: 0.7, marks: [{ poly: spline(tip, true), paint: '#F2C230', o: 0.95 }] };
        });
        const patches: Fill[] = [
          { poly: blob(atX(s, 47, 0.52), 2.8, 0.25, c.rand, 9, 1.3, 20), paint: '#F5F0E6', o: 0.9, clip: 'trunk' },
          { poly: shapeIn(s, [[tAtX(s, 50), 0.78], [tAtX(s, 58), 0.66], [tAtX(s, 68), 0.7], [tAtX(s, 75), 0.62], [tAtX(s, 74), 0.92], [tAtX(s, 60), 0.94], [tAtX(s, 51), 0.9]]), paint: '#F2C230', o: 0.9, clip: 'trunk' },
          { poly: blob(atX(s, 70, 0.4), 2.2, 0.3, c.rand, 9, 1.2, -20), paint: '#F5F0E6', o: 0.85, clip: 'trunk' },
          { poly: blob(atX(s, 35, 0.78), 2.6, 0.25, c.rand, 8, 1.4, 0), paint: '#F2C230', o: 0.85, clip: 'trunk' },
        ];
        // Dark waves rippling across the back.
        const waves: Fill[] = [54, 62, 75].map((x) => {
          const t = tAtX(s, x);
          return { poly: shapeIn(s, [[t - 0.012, 0], [t + 0.02, 0.2], [t - 0.005, 0.42], [t + 0.015, 0.62], [t + 0.04, 0.62], [t + 0.02, 0.42], [t + 0.045, 0.2], [t + 0.02, 0]]), paint: 'dark' as const, o: 0.9, clip: 'trunk' as const };
        });
        return {
          marks: [...patches, ...waves],
          near: flaps,
          arms: (arm) => [{ poly: arm.band(0.72, 1, -1.1, 1.1), paint: '#D6283A' }, { poly: arm.band(0.05, 0.72, -1, -0.6), paint: '#F2C230', o: 0.85 }],
        };
      },
    }),
};

// ── Bigfin reef squid ────────────────────────────────────────────────────────
// A long translucent mantle tapering to a point; thick oval fins along nearly its whole length,
// widest at the rear and meeting behind it (seen from a little above, one shows above the mantle
// and one below); a blue line where they join; arms bunched to a point with two longer tentacles;
// a big eye with a round pupil.
const bigfin: PlateDef = {
  palette: { back: '#A88468', belly: '#C9B49A', fin: '#E2D6C2', dark: '#6A4A36' },
  build: () =>
    cuttle({
      seed: 51,
      tip: [24, 30],
      blunt: 1,
      top: [[25, 26], [28, 23.4], [32, 22.6], [35.6, 24.2], [38.4, 23.4], [50, 22], [66, 22.6], [80, 24.6], [92, 27.6], [99, 29.6]],
      bot: [[25, 34], [28, 36.4], [32, 37.2], [36, 36], [40, 37.2], [54, 37.8], [68, 37], [82, 34.6], [93, 31.6], [99, 30.2]],
      fin: { t0: 0.2, t1: 1, h: (u) => 9.6 * Math.sin(Math.PI * Math.min(1, u * 0.86 + 0.07)) ** 0.9 * (u < 0.1 ? u / 0.1 : 1) + (u > 0.92 ? (u - 0.92) * 20 : 0), top: true, waves: 3, paint: 'fin' },
      eye: { c: [31.4, 29.4], r: 3.2, iris: '#6FAF8A', pupil: 'round' },
      arms: armCone([24, 30], [
        { from: [1, -2], path: [[16, 27.6], [9, 28.6], [3, 29.8]], w: 1.9, suckers: 1 },
        { from: [1, 0], path: [[15, 30], [8, 30.4], [1, 30.6]], w: 2 },
        { from: [1, 2], path: [[16, 32.4], [9, 32], [3, 31.2]], w: 1.9, suckers: -1 },
        { from: [1, -1], path: [[15, 29], [8, 29.4], [2, 30]], w: 1.6, far: true },
      ]),
      extra: (c) => {
        const { s } = c;
        // The two feeding tentacles, longer, with clubs.
        const tentacle = (y: number, dy: number) => {
          const arm = makeArm({ path: [[22, 30 + y], [12, 30 + y + dy * 0.5], [2, 30 + y + dy], [-5, 30 + y + dy * 1.1]], w: [0.75, 0.5] });
          const club = blob([-6.6, 30 + y + dy * 1.12], 1, 0.12, c.rand, 8, 2.6, dy * 4);
          return [armPart(arm, 'light', 0, 1), { poly: club, paint: 'back' as const, lines: [], edge: 0.7 }];
        };
        const spots = scatterIn(c.body, { r: 0.6, gap: 1.2, paint: 'dark', rand: c.rand, tries: 400, o: 0.55 }).map((f) => ({ ...f, clip: 'trunk' as const }));
        const finLine = (f: number): Line => ({ pts: lineAlong(s, f, 0.22, 0.97), w: 1.6, o: 0.9 });
        const blue = [0.06, 0.94].map((f) => ({ poly: region(s, 0.22, 0.97, f - 0.025, f + 0.025), paint: '#4FB8D8' as const, o: 0.9, clip: 'trunk' as const }));
        return { marks: [...spots, ...blue], lines: [finLine(0.03)].slice(0, 0), near: [...tentacle(-0.4, -1.6), ...tentacle(0.4, 1.8)] };
      },
    }),
};

// ── Bobtail squid ────────────────────────────────────────────────────────────
// Tiny and round, almost a ball, with two rounded ear-like fins; very large eyes; short arms; a
// dense stipple of dark, electric-blue and green dots.
const bobtail: PlateDef = {
  palette: { back: '#7A6A80', belly: '#9A8AA0', fin: '#A898B0', dark: '#2A1A24' },
  build: () =>
    octopus({
      seed: 55,
      lobes: [
        { c: [56, 30], rx: 12, ry: 11, rot: -4 },
        { c: [46, 31.4], rx: 8.6, ry: 8.6 },
        { c: [43.4, 28.6], rx: 6.4, ry: 6.2 },
      ],
      crown: { c: [38, 35.4], rx: 5, ry: 4.4 },
      eye: { c: [43.2, 28.6], r: 4.8, iris: '#C9B04A', pupil: 'round' },
      hub: [53, 30],
      web: 0.1,
      sucker: { paint: 'light', size: 0.9 },
      arms: [
        { path: [[38, 35], [31, 35.6], [26, 38], [24, 41.6]], w: [2.5, 0.45], suckers: -1 },
        { path: [[39, 37], [34, 41], [32, 45], [33, 48.6]], w: [2.5, 0.45], suckers: -1 },
        { path: [[41, 38], [41, 43], [43, 47], [46, 48.6]], w: [2.4, 0.45], suckers: 1 },
        { path: [[37, 34], [30, 33.4], [25.6, 34.6]], w: [2.1, 0.45], far: true },
        { path: [[40, 37], [37.6, 43], [37.6, 48]], w: [2.1, 0.45], far: true },
      ],
      extra: (c) => {
        // Ear fins: the near one on the flank, the far one over the back.
        const ear = (b: Pt, rot: number, k: number): Part => {
          const a = (rot * Math.PI) / 180;
          const pts: Ctrl[] = Array.from({ length: 9 }, (_, i) => {
            const u = (i / 8) * Math.PI;
            const x = Math.cos(u) * 7 * k;
            const y = -Math.sin(u) * 8.6 * k;
            return [b[0] + x * Math.cos(a) - y * Math.sin(a), b[1] + x * Math.sin(a) + y * Math.cos(a)] as Ctrl;
          });
          return { poly: spline(pts, true), paint: 'fin', lines: Array.from({ length: 5 }, (_, i) => ({ pts: [b, lerp(b, pts[i * 2] as Pt, 0.85)], w: 0.5, o: 0.5, taper: 'end' as const })), edge: 0.75 };
        };
        const dots = (paint: Fill['paint'], r: number, n: number, o = 1) => scatterIn(c.body, { r, gap: r * 0.8, paint, rand: c.rand, tries: n, o }).map((f) => ({ ...f, clip: 'trunk' as const }));
        return {
          far: [ear([58, 21], 8, 0.72)],
          near: [ear([59, 28.6], 22, 0.9)],
          marks: [...dots('dark', 0.55, 1400, 0.9), ...dots('#1FA6E8', 0.45, 500), ...dots('#3BC48A', 0.4, 300)],
          arms: (arm) => armSpots(arm, 'dark', 0.05, 0.35, c.rand, 0.8),
        };
      },
    }),
};

// ── Chambered nautilus ───────────────────────────────────────────────────────
// A smooth, tightly coiled shell seen from the side, the last whorl hiding the rest; flame
// stripes radiating from the closed umbilicus over the upper and rear shell, the body chamber
// near the opening left plain cream; a leathery hood over the opening, a pinhole eye beneath it
// and a fan of many thin tentacles without suckers.
function nautilus(): PlateGeom {
  const g = emptyGeom();
  const rand = rng(61);
  const O: Pt = [60, 30];
  const R = 27;
  const b = Math.log(3) / (Math.PI * 2);
  const pa = Math.PI * 0.5; // the opening, straight below the centre, facing forward
  const r = (phi: number) => R * Math.exp(b * (phi - pa));
  const P = (phi: number, k = 1): Pt => [O[0] + Math.cos(phi) * r(phi) * k, O[1] + Math.sin(phi) * r(phi) * k];
  // The shell outline: the outer edge from the opening back round one full turn.
  const N = 160;
  const outer = Array.from({ length: N + 1 }, (_, i) => P(pa - (i / N) * Math.PI * 2));
  // The aperture's lip is a curve bowing forward, not a straight cut.
  const lipIn = P(pa - Math.PI * 2);
  const lipOut = P(pa);
  const lip = spline([[lipIn[0], lipIn[1], 1], [lipIn[0] - 3.4, lipIn[1] + 2.6], [lipIn[0] - 5.2, lipIn[1] + 8.6], [lipIn[0] - 4, lipOut[1] - 6.2], [lipOut[0] - 1.2, lipOut[1] - 1.6], [lipOut[0], lipOut[1], 1]], false);
  const shell = [...outer, ...lip.slice(1, -1)];
  g.body = shell;
  g.trunk = shell;
  // Growth lines: gently sinuous curves from the inner whorl to the outer edge.
  const growth = (phi: number): Pt[] => {
    const a = P(phi - Math.PI * 2 + 0.0);
    const z = P(phi);
    const m = lerp(a, z, 0.5);
    const bend = [-(z[1] - a[1]) * 0.12, (z[0] - a[0]) * 0.12] as Pt;
    return spline([a, add(lerp(a, z, 0.3), bend), add(m, mul2(bend, 0.4)), add(lerp(a, z, 0.75), mul2(bend, -0.5)), z], false);
  };
  // Flame stripes on the upper and rear shell, fading before the opening.
  const stripes: Fill[] = [];
  for (let k = 0; k < 22; k++) {
    const phi = pa - Math.PI * 2 + 0.28 + k * 0.205;
    const fade = clamp01((pa - 0.9 - phi) / 1.3);
    if (fade <= 0.05) continue;
    const line = growth(phi);
    const w = (0.9 + rand() * 0.7) * (0.4 + 0.6 * fade);
    const len = 0.45 + 0.55 * fade;
    const pts = line.slice(Math.round(line.length * (1 - len)));
    const left = pts.map((p, i, arr) => {
      const d = sub2(arr[Math.min(arr.length - 1, i + 1)], arr[Math.max(0, i - 1)]);
      const n = norm2([d[1], -d[0]]);
      const ww = w * (0.35 + 0.65 * (i / (arr.length - 1))) * (1 + 0.25 * Math.sin(i * 0.7 + k));
      return add(p, [n[0] * ww, n[1] * ww]);
    });
    const right = pts.map((p, i, arr) => {
      const d = sub2(arr[Math.min(arr.length - 1, i + 1)], arr[Math.max(0, i - 1)]);
      const n = norm2([d[1], -d[0]]);
      const ww = w * (0.35 + 0.65 * (i / (arr.length - 1))) * (1 + 0.25 * Math.cos(i * 0.6 + k));
      return add(p, [-n[0] * ww, -n[1] * ww]);
    });
    stripes.push({ poly: [...left, ...right.reverse()], paint: k % 3 ? 'pattern' : 'dark', o: 0.92, clip: 'trunk' });
  }
  g.marks.push(...stripes);
  // Fine growth lines all round, and shading on the lower (shadowed) side.
  for (let k = 0; k < 40; k++) {
    const phi = pa - Math.PI * 2 + 0.1 + k * 0.155;
    g.lines.push({ pts: growth(phi), w: 0.5, o: 0.4, detail: true });
  }
  g.engraving.push(...[0.94, 0.88, 0.8].map((k, i) => ({ pts: Array.from({ length: 90 }, (_, j) => P(pa - 0.2 - (j / 89) * Math.PI * 1.3, k)), w: 1.6 - i * 0.4, taper: 'both' as const })));
  // The umbilicus: a small closed callus.
  g.marks.push({ poly: ellipse(O, 2.6), paint: 'light', edge: 0.8 }, { poly: ellipse(add(O, [0.4, 0.3]), 1.2), paint: 'pattern', o: 0.8 });
  // The opening: hood above, eye, tentacles below and in front.
  const inner = P(pa - Math.PI * 2);
  // The hood caps the opening, following the curve of the inner whorl and reaching forward of it.
  const hoodPoly = spline([add(inner, [1.4, -0.6]), add(inner, [-3, -3.6]), add(inner, [-8, -5.8]), add(inner, [-13.4, -5.6]), add(inner, [-17.6, -2.6]), add(inner, [-18.4, 1.6]), add(inner, [-16, 4.6]), add(inner, [-10, 5.8]), add(inner, [-4, 5.4]), add(inner, [1.4, 4])], true);
  const hood: Part = {
    poly: hoodPoly,
    paint: '#9A5A3A',
    lines: [0.25, 0.5, 0.75].map((k) => ({ pts: spline([add(inner, [-1 - k * 2, -2.4 - k * 1.4]), add(inner, [-8 - k * 3, -2.6 - k * 1.6]), add(inner, [-15 - k * 1.4, 1.4 - k])], false), w: 0.8, o: 0.6, taper: 'both' as const })),
    edge: 1,
    marks: scatterIn(hoodPoly, { r: 0.55, gap: 0.8, paint: '#E8D7C0', rand, tries: 220, o: 0.9 }),
  };
  const tentacleRoot = add(inner, [-5, 9]);
  const fan: Line[] = [];
  const mass: Pt[] = [];
  for (let k = 0; k < 14; k++) {
    const a = Math.PI * (0.74 + (k / 13) * 0.42) + (rand() - 0.5) * 0.05;
    const len = 8.4 + rand() * 3.2 + Math.sin(k * 1.3) * 1.2;
    const root = add(tentacleRoot, [(rand() - 0.5) * 4, (rand() - 0.5) * 6]);
    const tip = add(root, [Math.cos(a) * len, Math.sin(a) * len]);
    const mid = add(lerp(root, tip, 0.5), [(rand() - 0.5) * 2, 1.2]);
    fan.push({ pts: spline([root, mid, tip], false), w: 1.7, taper: 'end' });
    if (k % 3 === 0) mass.push(lerp(root, tip, 0.45));
  }
  const tentacleMass: Part = { poly: spline([add(tentacleRoot, [1, -4]), ...mass.map((p) => lerp(tentacleRoot, p, 0.7)), add(tentacleRoot, [1, 5])], true), paint: '#C9AE90', lines: fan, edge: 0.5 };
  g.near.push(tentacleMass, hood);
  const eyeAt = add(inner, [-12.6, 7.6]);
  g.near.push({ poly: ellipse(eyeAt, 2.6), paint: '#9A5A3A', lines: [], edge: 0.8 });
  g.eyes.push({ c: eyeAt, r: 1.7 });
  g.heavy.push(outer.slice(Math.round(N * 0.0), Math.round(N * 0.45)));
  return g;
}
const mul2 = (p: Pt, k: number): Pt => [p[0] * k, p[1] * k];
const sub2 = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const norm2 = (p: Pt): Pt => {
  const l = Math.hypot(p[0], p[1]) || 1;
  return [p[0] / l, p[1] / l];
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const CEPHALOPODS: Record<string, PlateDef> = {
  'day-octopus': day,
  'giant-pacific-octopus': gpo,
  'blue-ringed-octopus': blueRinged,
  'mimic-octopus': mimic,
  'coconut-octopus': coconut,
  'broadclub-cuttlefish': broadclub,
  'giant-cuttlefish': giantCuttle,
  'flamboyant-cuttlefish': flamboyant,
  'bigfin-reef-squid': bigfin,
  'bobtail-squid': bobtail,
  'chambered-nautilus': { build: nautilus, palette: { back: '#F1E8D8', belly: '#F3EBDD', fin: '#F1E8D8', pattern: '#A0462A', dark: '#7A3420' } },
};
