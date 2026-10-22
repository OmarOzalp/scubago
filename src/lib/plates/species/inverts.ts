/**
 * Sea slugs, crustaceans, a worm and a clam: each drawn in the pose that shows its one decisive
 * feature, from the chromodoris's banded margin to the lobster's whip antennae.
 */
import { add, blob, type Ctrl, ellipse, inside, lerp, mul, norm, perp, type Pt, resample, rng, spline, sub } from '../kit';
import { scatterIn, shapeIn } from '../marks';
import { tube } from '../ray';
import { makeArm } from '../cephalopod';
import type { PlateDef } from '../registry';
import { atX, contours, lineAlong, outlineOf, region, tAtX, trunk } from '../side';
import { softUnion } from '../soft';
import { emptyGeom, type Fill, type Line, type Paint, type Part, type PlateGeom } from '../types';

/** A point offset from p, marked as a sharp corner for spline(). */
const corner = (p: Pt, d: Pt): Ctrl => [p[0] + d[0], p[1] + d[1], 1];

/** A rounded-oblong outline (a superellipse), narrowing towards the rear by `taper`. */
function oblong(c: Pt, a: number, b: number, n = 2.6, taper = 0, steps = 120, wave = 0, freq = 14): Pt[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    let x = a * Math.sign(ct) * Math.abs(ct) ** (2 / n);
    let y = b * Math.sign(st) * Math.abs(st) ** (2 / n) * (1 - taper * (x / a + 1) * 0.5);
    if (wave) {
      // A ruffled margin: the edge waves in and out along its normal.
      const r = Math.hypot(x / a, y / b) || 1;
      const k = wave * Math.sin(t * freq);
      x += (x / a / r) * k;
      y += (y / b / r) * k;
    }
    return [c[0] + x, c[1] + y] as Pt;
  });
}

/** A leaf or petal from base to tip, `w` wide. */
function leaf(base: Pt, tip: Pt, w: number, bulge = 0.45): Pt[] {
  const d = sub(tip, base);
  const n = mul(norm(perp(d)), w / 2);
  return spline([base, add(lerp(base, tip, bulge), n), [tip[0], tip[1], 1], add(lerp(base, tip, bulge), mul(n, -1))], true);
}

/** A tapering segmented limb (shrimp legs, antennae) along a path. */
function limb(path: Ctrl[], w0: number, w1: number, paint: Paint, joints = 0, edge = 0.7): Part {
  const c = resample(spline(path, false), 50);
  const lines: Line[] = [];
  for (let k = 1; k <= joints; k++) {
    const i = Math.round((k / (joints + 1)) * (c.length - 1));
    const d = norm(sub(c[Math.min(c.length - 1, i + 1)], c[i - 1]));
    const w = w0 + (w1 - w0) * (i / (c.length - 1));
    lines.push({ pts: [add(c[i], mul(perp(d), w)), add(c[i], mul(perp(d), -w))], w: 0.7, o: 0.8 });
  }
  return { poly: tube(c, (t) => w0 + (w1 - w0) * t), paint, lines, edge };
}

// ── Anna's chromodoris ───────────────────────────────────────────────────────
// Seen from a little above: a long dorid with a smooth mantle overhanging the foot; a blue back
// with tiny black speckles, edged white, orange-yellow, white and a black line; a black dash
// between the orange rhinophores; an orange gill plume at the rear; the white tail behind.
function anna(): PlateGeom {
  const g = emptyGeom();
  const rand = rng(81);
  const C: Pt = [50, 34];
  const A = 36;
  const B = 13;
  // The mantle edge is ruffled, the waves dying away towards the blue centre.
  const band = (d: number) => oblong(C, A - d, B - d, 2.4, 0.2, 260, 1.25 * Math.max(0, 1 - d / 4.6), 15);
  const mantle = band(0);
  g.body = mantle;
  g.trunk = mantle;
  // The foot shows below the mantle's near edge, and the tail behind.
  const foot = oblong(add(C, [3, 4]), A - 2, B - 1.6, 2.4, 0.2);
  const tail = spline([[80, 33], [88, 34.6], [95, 38, 1], [88, 41], [80, 41.4]], true);
  g.far.push({ poly: tail, paint: '#F7F7F2', lines: [], edge: 0.8, marks: [{ poly: spline([[82, 40.4], [88, 40], [94, 38.4], [88, 41.4], [82, 41.8]], true), paint: '#F2B230', o: 0.9 }] });
  g.far.push({ poly: foot, paint: '#F7F7F2', lines: [], edge: 0.8 });
  // Bands from the edge in: white (the mantle itself), orange-yellow, white, a black line, blue.
  g.tint.push(
    { poly: band(0), paint: '#F7F7F2' },
    { poly: band(1.2), paint: '#F2B230' },
    { poly: band(3), paint: '#F7F7F2' },
    { poly: band(4.3), paint: 'ink' },
    { poly: band(5.1), paint: 'back' },
  );
  const blue = band(5.1);
  g.marks.push(...scatterIn(blue, { r: 0.22, gap: 0.55, paint: 'ink', rand, tries: 2200, o: 0.85 }));
  // The black dash between the rhinophores and a broken line down the middle.
  g.marks.push({ poly: oblong([24.4, 34], 3.2, 0.8, 2.4), paint: 'ink' });
  for (const [x0, x1] of [
    [33, 46],
    [50, 60],
    [64, 72],
  ])
    g.marks.push({ poly: oblong([(x0 + x1) / 2, 34.4], (x1 - x0) / 2, 0.65, 2.2), paint: 'ink', o: 0.9 });
  // Shading: the mantle domes up, darker towards its near edge.
  g.engraving.push(
    ...[0.78, 0.62].map((k, i) => ({ pts: oblong(C, (A - 5.4) * k + 4, (B - 5.4) * k, 2.4, 0.2).filter((p) => p[1] > C[1] + 1), w: 1.3 - i * 0.4, taper: 'both' as const })),
  );
  // Rhinophores: orange clubs ringed with plates, standing up at the front.
  const rhino = (base: Pt, k: number): Part => {
    const tip = add(base, [1.8, -14 * k]);
    const club = softUnion([{ c: lerp(base, tip, 0.2), rx: 1.1 * k, ry: 2.6 * k, rot: 0 }, { c: lerp(base, tip, 0.62), rx: 2.2 * k, ry: 4.6 * k, rot: 8 }], 0.12, 0.2);
    // Stacked lamellae: a dozen fine curved plates up the club.
    const rings: Line[] = Array.from({ length: 12 }, (_, i) => {
      const p = lerp(lerp(base, tip, 0.3), tip, i / 12.6);
      const w = 2.1 * k * Math.sin(Math.PI * (0.18 + (i / 12) * 0.78));
      return { pts: spline([add(p, [-w, 0.7]), add(p, [0, -0.5]), add(p, [w, 0.5])], false), w: 0.6, o: 0.8 };
    });
    return { poly: club, paint: '#F08A24', lines: rings, edge: 0.8 };
  };
  g.far.push(rhino([24, 28.6], 0.9));
  g.near.push(rhino([25, 36.6], 1.05));
  // The gill plume: a ring of branched leaves standing up at the rear.
  const gb: Pt = [74, 34];
  for (let k = 0; k < 10; k++) {
    const a = (-162 + k * 16) * (Math.PI / 180);
    const tip = add(gb, [Math.cos(a) * 12.6, Math.sin(a) * 12.6 - 1]);
    const lf = leaf(gb, tip, 3.2, 0.55);
    const twigs: Line[] = [0.35, 0.55, 0.75].flatMap((u) => {
      const p = lerp(gb, tip, u);
      const d = norm(sub(tip, gb));
      return [-1, 1].map((sd) => ({ pts: [p, add(add(p, mul(perp(d), sd * 1.1)), mul(d, 0.8))] as Pt[], w: 0.5, o: 0.7 }));
    });
    (k < 2 || k > 7 ? g.far : g.near).push({ poly: lf, paint: '#F08A24', lines: [{ pts: [gb, lerp(gb, tip, 0.9)], w: 0.6, o: 0.7 }, ...twigs], edge: 0.7 });
  }
  g.heavy.push(mantle.filter((p) => p[1] > C[1] + 4));
  return g;
}

// ── Pikachu nudibranch ───────────────────────────────────────────────────────
// A small slender yellow slug with no skirt; tall black-tipped rhinophores standing in cup-shaped
// sheaths like ears; two finger-like processes beside the little gill, banded black and tipped
// blue; a long tapering tail with a blue tip.
function pikachu(): PlateGeom {
  const g = emptyGeom();
  const s = trunk({
    tip: [8, 38],
    top: [[9, 33.6], [13, 30.4], [20, 28.6], [32, 27.8], [44, 28], [56, 29.6], [68, 32.6], [80, 36.2], [93, 39]],
    bot: [[9, 41.4], [14, 42.6], [30, 42.8], [50, 42.6], [66, 41.8], [80, 40.6], [93, 39.4]],
    blunt: 0.9,
  });
  const body = outlineOf(s);
  g.body = body;
  g.trunk = body;
  g.engraving = contours(s, { top: [0.06, 0.14], bot: [0.7, 0.8, 0.9] });
  g.heavy.push(s.bot);
  // The tail tip: black then blue.
  g.marks.push({ poly: region(s, tAtX(s, 82), tAtX(s, 86), 0, 1), paint: 'ink', clip: 'trunk' }, { poly: region(s, tAtX(s, 86), 1, 0, 1), paint: '#5EC4F0', clip: 'trunk' });
  // A banded finger: black, then blue, then a pale tip.
  const finger = (base: Pt, tip: Pt, w: number, far: boolean) => {
    const arm = makeArm({ path: [base, add(lerp(base, tip, 0.5), [-0.5, 0]), tip], w: [w * 1.15, w * 0.5] });
    // Lamellae: fine plates stacked up the finger.
    const plates: Line[] = Array.from({ length: 11 }, (_, i) => {
      const t = 0.12 + i * 0.075;
      return { pts: [arm.at(t, -1), arm.at(t + 0.015, 0), arm.at(t, 1)], w: 0.55, o: 0.7 };
    });
    const part: Part = { poly: arm.poly, paint: 'back', lines: plates, edge: 0.8, marks: [{ poly: arm.band(0.46, 0.7, -1.05, 1.05), paint: 'ink' }, { poly: arm.band(0.7, 0.9, -1.05, 1.05), paint: '#5EC4F0' }, { poly: arm.band(0.9, 1, -1.05, 1.05), paint: '#EAF6FB' }] };
    (far ? g.far : g.near).push(part);
  };
  const back = (x: number) => atX(s, x, 0.02);
  finger(back(40), add(back(40), [-1.4, -15]), 1.6, false);
  finger(back(53), add(back(53), [1.4, -14]), 1.45, true);
  // The gill: a small cluster of leaves with black axes.
  for (const [dx, a, h] of [
    [44, -110, 6.4],
    [46, -92, 7.2],
    [48, -74, 6.4],
    [50, -60, 5],
  ] as const) {
    const b = back(dx);
    const tip = add(b, [Math.cos((a * Math.PI) / 180) * h, Math.sin((a * Math.PI) / 180) * h]);
    g.far.push({ poly: leaf(b, tip, 2, 0.5), paint: 'back', lines: [{ pts: [b, lerp(b, tip, 0.9)], w: 1.1, o: 0.95 }], edge: 0.7 });
  }
  // Rhinophores in their sheaths: the sheath a flared cup, slanting up towards the back, black in
  // front and sky blue behind; the black-tipped rhinophore rising out of it.
  const rhino = (x: number, k: number, far: boolean) => {
    const b = back(x);
    const P = (dx: number, dy: number, sharp = false): Ctrl => (sharp ? [b[0] + dx * k * 1.3, b[1] + dy * k * 1.2, 1] : [b[0] + dx * k * 1.3, b[1] + dy * k * 1.2]);
    // A short collar round the rhinophore's base (not a tall flag).
    const cup = spline([P(-1.8, 0.8, true), P(-1.9, -1.6), P(-2.6, -3.4, true), P(-0.6, -2.8), P(1.2, -3.6), P(2.6, -4.2, true), P(2, -1.6), P(1.8, 0.8, true)], true);
    const rh = makeArm({ path: [P(0.2, -2), P(0.5, -6.4), P(0.9, -11.4)], w: [1.1 * k, 1.2 * k] });
    const club: Part = {
      poly: rh.poly,
      paint: 'back',
      lines: Array.from({ length: 10 }, (_, i) => {
        const t = 0.3 + i * 0.055;
        return { pts: [rh.at(t, -1), rh.at(t + 0.015, 0), rh.at(t, 1)], w: 0.55, o: 0.75 };
      }),
      edge: 0.8,
      marks: [{ poly: rh.band(0.86, 1, -1.05, 1.05), paint: 'ink' }],
    };
    const sheath: Part = { poly: cup, paint: '#5EC4F0', lines: [], edge: 0.85 };
    (far ? g.far : g.near).push(club, sheath);
  };
  rhino(20, 0.9, true);
  rhino(15.6, 1, false);
  // Oral tentacles.
  g.near.push(limb([[10, 39], [6, 40.6], [3.6, 42.4]], 0.9, 0.4, 'back'));
  return g;
}

// ── Spanish dancer ───────────────────────────────────────────────────────────
// Swimming: the mantle skirt unfurled into a broad, rippling crimson cloak with a white rim,
// the body flexed; six pale gill tufts in a rosette at the rear; red rhinophores at the front.
function spanishDancer(): PlateGeom {
  const g = emptyGeom();
  const C: Pt = [52, 34];
  // The rippled skirt: an oval whose radius waves, bent into an S.
  const rim = (k: number) =>
    Array.from({ length: 200 }, (_, i) => {
      const t = (i / 200) * Math.PI * 2;
      const wave = 1 + 0.115 * Math.sin(t * 6 + 0.6) + 0.045 * Math.sin(t * 13);
      const x = Math.cos(t) * 44 * wave * k;
      const y = Math.sin(t) * 27 * wave * k;
      return [C[0] + x, C[1] + y + 5 * Math.sin((x / 44) * Math.PI)] as Pt;
    });
  const skirt = rim(1);
  g.body = skirt;
  g.trunk = skirt;
  // White rim, broken at the front.
  g.tint.push({ poly: skirt, paint: '#FAF6F0' }, { poly: rim(0.93), paint: 'back' });
  // Folds: from the core out to each trough of the ripple, heavier on the lower side.
  for (let k = 0; k < 12; k++) {
    const t = ((k + 0.5) / 12) * Math.PI * 2 - 0.1;
    const o = rim(0.97)[Math.round((t / (Math.PI * 2)) * 200) % 200];
    const inner = lerp(C, o, 0.35);
    const mid = add(lerp(inner, o, 0.55), [Math.sin(t) * 2, -Math.cos(t) * 2]);
    const lower = Math.sin(t) > 0;
    g.engraving.push({ pts: spline([inner, mid, o], false), w: lower ? 2.2 : 1.2, taper: 'both' });
    g.engraving.push({ pts: spline([lerp(inner, o, 0.2), add(mid, [Math.sin(t) * 1.4, -Math.cos(t) * 1.4]), lerp(o, mid, 0.1)], false), w: lower ? 1.2 : 0.7, taper: 'both' });
  }
  // The gill plume: six big feathery fronds in a rosette near the rear, white-pink, each a
  // midrib with fine barbs down both sides.
  const gc: Pt = [74, 33];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const b = add(gc, [Math.cos(a) * 3.4, Math.sin(a) * 2.2]);
    const dir = norm([Math.cos(a) * 0.9, -1.1 + Math.sin(a) * 0.35]);
    const tip = add(b, mul(dir, 12.6));
    const n = perp(dir);
    // A frilly frond: a chain of soft lobes narrowing to the tip, wavering either side of its axis.
    const frond = softUnion(
      Array.from({ length: 10 }, (_, j) => {
        const u = j / 9;
        return { c: add(lerp(b, tip, u), mul(n, Math.sin(j * 1.9 + k * 2.1) * 1.7)), rx: 2.4 * (1 - u * 0.55), ry: 2.1 * (1 - u * 0.5) };
      }),
      0.25,
      0.2,
    );
    const barbs: Line[] = [];
    for (let j = 1; j <= 8; j++) {
      const p = lerp(b, tip, j / 9);
      for (const sd of [-1, 1]) barbs.push({ pts: [p, add(add(p, mul(n, sd * 1.8)), mul(dir, 0.8))], w: 0.5, o: 0.6, taper: 'end' });
    }
    g.near.push({ poly: frond, paint: '#F8DCD6', lines: [{ pts: [b, lerp(b, tip, 0.9)], w: 0.8, o: 0.7 }, ...barbs], edge: 0.7 });
  }
  // Rhinophores at the front.
  for (const [b, k] of [
    [[22, 30], 0.85],
    [[23, 35], 1],
  ] as const) {
    const tip = add(b as Pt, [-1.4, -6.4 * k]);
    g.near.push({
      poly: leaf(b as Pt, tip, 3 * k, 0.55),
      paint: 'back',
      lines: Array.from({ length: 5 }, (_, i) => {
        const p = lerp(lerp(b as Pt, tip, 0.25), tip, i / 5);
        return { pts: [add(p, [-1.2 * k, 0.3]), add(p, [1.2 * k, -0.3])], w: 0.8, o: 0.8 };
      }),
      edge: 0.8,
    });
  }
  g.heavy.push(skirt.slice(10, 95));
  return g;
}

// ── Harlequin shrimp ─────────────────────────────────────────────────────────
// Standing high on a sea star: huge flat petal-like claws raised like wings; leaf-like antennules
// held forward; a small humped cream body covered in large rounded blotches, each ringed in
// yellow.
function harlequin(): PlateGeom {
  const g = emptyGeom();
  const rand = rng(85);
  // Body: carapace and a humped abdomen curling down to the tail fan.
  const spineCurve = resample(spline([[34, 31], [44, 28.6], [54, 25.6], [62, 26], [70, 30], [76, 36]], false), 40);
  const body = softUnion(
    [
      { c: [38, 32], rx: 9.6, ry: 7.4, rot: -8 },
      ...spineCurve.filter((_, i) => i % 5 === 0).map((p, i) => ({ c: p, rx: 6.2 - i * 0.45, ry: 5.6 - i * 0.4 })),
    ],
    0.12,
    0.3,
  );
  g.body = body;
  g.trunk = body;
  // Segment seams across the abdomen.
  for (const i of [12, 17, 22, 27, 32]) {
    const p = spineCurve[i];
    const d = norm(sub(spineCurve[i + 1], spineCurve[i - 1]));
    const w = 6.4 - i * 0.1;
    g.lines.push({ pts: spline([add(p, mul(perp(d), w)), add(add(p, mul(d, -0.8)), mul(perp(d), 0)), add(p, mul(perp(d), -w * 0.9))], false), w: 1, o: 0.8, taper: 'both' });
  }
  // Tail fan.
  const tf: Pt = spineCurve[39];
  const fan: Part = {
    poly: spline([add(tf, [-2.6, -1]), add(tf, [3, 2]), add(tf, [5, 7]), corner(tf, [1.6, 9.6]), add(tf, [-1.6, 8]), corner(tf, [-4.4, 9.2]), add(tf, [-5.4, 4]), add(tf, [-3.6, 0.6])], true),
    paint: 'back',
    lines: [0.3, 0.6].map((k) => ({ pts: [tf, add(tf, [-1 + k * 4, 9])] as Pt[], w: 0.6, o: 0.6 })),
    edge: 0.8,
  };
  g.far.push(fan);
  // The sea star underfoot: a knobbly blue cushion with two arm tips curling up at its ends and
  // a fringe of tube feet along its lower edge.
  const star = spline([[3, 53.4], [9, 48.6], [15, 48.4], [30, 48.4], [60, 47.4], [88, 48.6], [95, 46.6], [100.6, 50], [98, 56.4], [80, 58.2], [40, 58.6], [6, 58]], true);
  g.far.unshift({
    poly: star,
    paint: '#3E7CC0',
    lines: Array.from({ length: 34 }, (_, k) => {
      const x = 8 + k * 2.7;
      return { pts: [[x, 57.6 + Math.sin(k) * 0.4], [x + 0.3, 59.4 + (k % 3) * 0.3]] as Pt[], w: 0.7, o: 0.8 };
    }),
    edge: 0.9,
    marks: [
      ...scatterIn(star, { r: 0.8, gap: 1.2, paint: '#2A5A94', rand, tries: 300 }),
      // The arm tips: a darker, rounder end to each curled arm.
      { poly: ellipse([8.6, 51], 5.4, 3.4, -35), paint: '#356EB0', o: 0.6 },
      { poly: ellipse([95.4, 50.2], 5.2, 3.4, 32), paint: '#356EB0', o: 0.6 },
    ],
  });
  // Walking legs: slender, banded, short and angled out at the knee (the body sits close to the star).
  const legPaint: Paint = '#6A5AB0';
  for (const [x, dx, far] of [
    [40, -6, false],
    [46, -3, false],
    [52, 3, false],
    [58, 6.4, false],
    [43, -4.4, true],
    [55, 4.4, true],
  ] as const) {
    const top: Pt = [x, 36];
    const knee: Pt = [x + dx * 1.5, 41.4];
    const foot: Pt = [x + dx * 1.1, 47.6];
    const leg = limb([top, knee, foot], 0.75, 0.45, 'light', 2);
    leg.marks = [0.25, 0.55, 0.8].map((u) => ({ poly: tube(resample(spline([lerp(top, knee, u * 1.6 > 1 ? 1 : u * 1.6), lerp(knee, foot, u)], false), 4), () => 0.8), paint: legPaint, o: 0.8 }));
    (far ? g.far : g.near).push(leg);
  }
  // A blotch: purple-pink, ringed with yellow.
  const blotch = (c: Pt, r: number, rot = 0): Fill[] => [
    { poly: blob(c, r * 1.2, 0.18, rand, 9, 1.2, rot), paint: '#F2C640' },
    { poly: blob(c, r, 0.18, rand, 9, 1.2, rot), paint: '#B0306E' },
  ];
  g.marks.push(...[[37, 30.4, 3.2], [48, 27, 2.6], [58, 25, 2.4], [66, 29, 2.2], [72, 34.6, 1.8], [33, 35.6, 1.8]].flatMap(([x, y, r]) => blotch([x, y], r)).map((f) => ({ ...f, clip: 'trunk' as const })));
  g.engraving.push(...[0.85, 0.7].map((k, i) => ({ pts: body.filter((p) => p[1] > 32).map((p) => lerp([50, 30], p, k)), w: 1.4 - i * 0.5, taper: 'both' as const })));
  // The claws: big flat petals raised up and forward on jointed arms.
  const claw = (shoulder: Pt, elbow: Pt, palmTip: Pt, w: number, far: boolean) => {
    const arm = limb([shoulder, elbow], 1.3, 1.1, 'back', 1);
    const base = elbow;
    const palm = leaf(base, palmTip, w, 0.5);
    const d = norm(sub(palmTip, base));
    const fingerTip = add(lerp(base, palmTip, 0.95), mul(perp(d), w * 0.5));
    const finger = leaf(lerp(base, palmTip, 0.45), fingerTip, w * 0.42, 0.5);
    const palmPart: Part = { poly: palm, paint: 'back', lines: [{ pts: [base, lerp(base, palmTip, 0.85)], w: 0.6, o: 0.5 }], edge: 0.9, marks: [...blotch(lerp(base, palmTip, 0.5), w * 0.22, 0), ...blotch(lerp(base, palmTip, 0.8), w * 0.14, 0)] };
    const fingerPart: Part = { poly: finger, paint: 'back', lines: [], edge: 0.8, marks: blotch(lerp(lerp(base, palmTip, 0.45), fingerTip, 0.55), w * 0.1) };
    (far ? g.far : g.near).push(arm, palmPart, fingerPart);
  };
  claw([36, 36], [30, 26], [22, 6], 13, true);
  claw([38, 37], [27, 30], [8, 18], 14, false);
  // Antennules: flat leaves held forward; eyes on short stalks.
  for (const [tip, w, far] of [
    [[10, 30], 4.6, true],
    [[12, 37], 5, false],
  ] as const) {
    const lf = leaf([29, 31.4], tip as Pt, w, 0.55);
    (far ? g.far : g.near).push({ poly: lf, paint: 'back', lines: [{ pts: [[29, 31.4], lerp([29, 31.4], tip as Pt, 0.9)], w: 0.6, o: 0.5 }], edge: 0.8, marks: blotch(lerp([29, 31.4], tip as Pt, 0.55), w * 0.2) });
  }
  g.near.push({ poly: ellipse([30.6, 27.6], 2.2, 1.6, -20), paint: 'back', lines: [], edge: 0.8 });
  g.eyes.push({ c: [30.2, 27.4], r: 1.1 });
  g.heavy.push(body.filter((p) => p[1] > 33));
  return g;
}

// ── Peacock mantis shrimp ────────────────────────────────────────────────────
// A deep, domed carapace over the front third (leaf-green, spotted like a leopard, with a small
// rostral plate and big stalked eyes split by a dark midband), a narrower abdomen of six
// dark-edged armoured segments with a keel; the red-pink raptorial club folded under the face,
// its swollen heel and spined arm in front of it; short orange legs; orange antennal scales; a
// spiny telson with two eyespots between orange-edged uropods.
function mantis(): PlateGeom {
  const g = emptyGeom();
  const rand = rng(87);
  const s = trunk({
    tip: [16, 29],
    top: [[17.6, 25.4], [20.4, 22.8], [25, 21.2], [31, 20.8], [37, 21.4], [41, 23], [46, 24.2], [56, 24.8], [66, 25.2], [76, 25.8], [83, 26.6]],
    bot: [[17.6, 32.2], [20.4, 34.4], [25, 35.8], [31, 36.4], [37, 36.2], [41, 34.6], [46, 33.2], [56, 32.8], [66, 33], [76, 33.2], [83, 33]],
    blunt: 0.7,
  });
  const body = outlineOf(s);
  g.body = body;
  g.trunk = body;
  g.engraving = contours(s, { top: [0.05, 0.13], bot: [0.7, 0.8, 0.9, 0.96] });
  g.heavy.push(s.bot);
  // The carapace is the front third: a groove behind it, its rear edge warm orange-red.
  const rear = shapeIn(s, [[tAtX(s, 36.2), 0.02], [tAtX(s, 40.6), 0.0], [tAtX(s, 41.2), 0.5], [tAtX(s, 39.2), 1.02], [tAtX(s, 35.2), 1.02], [tAtX(s, 37.6), 0.5]]);
  g.marks.push({ poly: rear, paint: '#E8572A', o: 0.5, clip: 'trunk' });
  g.lines.push({ pts: [atX(s, 41.4, 0.0), atX(s, 40.2, 0.3), atX(s, 40.8, 0.7), atX(s, 39.2, 1)], w: 1.3, o: 0.9, taper: 'both' });
  g.lines.push({ pts: [atX(s, 27, 0.0), atX(s, 29, 0.4), atX(s, 28, 0.85)], w: 0.7, o: 0.5, taper: 'both' });
  // Abdomen: six armoured segments, each edged dark at its rear, with a keel along the back.
  const seg = [48, 54.2, 60.4, 66.6, 72.8, 79];
  seg.forEach((x, i) => {
    g.lines.push({ pts: [atX(s, x, 0), atX(s, x - 0.7, 0.5), atX(s, x, 1)], w: 1.1, o: 0.9, taper: 'both' });
    g.marks.push({ poly: region(s, tAtX(s, x - 1.7), tAtX(s, x), 0, 1), paint: 'dark', o: 0.4, clip: 'trunk' });
    // A small pointed plate at each segment's top rear corner.
    g.far.push({ poly: [add(atX(s, x - 3.6, 0), [0, 0.4]), add(atX(s, x - 0.2, 0), [0.8, -1.5 + i * 0.05]), add(atX(s, x, 0), [0, 0.8])], paint: 'back', lines: [], edge: 0.6 });
  });
  g.lines.push({ pts: lineAlong(s, 0.2, tAtX(s, 44), tAtX(s, 83)), w: 0.6, o: 0.6 });
  // Leopard spots on the carapace.
  const front = shapeIn(s, [[tAtX(s, 19.5), 0.28], [tAtX(s, 24), 0.08], [tAtX(s, 32), 0.06], [tAtX(s, 37), 0.12], [tAtX(s, 37.4), 0.52], [tAtX(s, 32), 0.7], [tAtX(s, 24), 0.7]]);
  g.marks.push(
    { poly: front, paint: '#C4D6A8', o: 0.4, clip: 'trunk' },
    ...scatterIn(front, { r: 0.55, gap: 1.4, paint: 'ink', rand, tries: 220, o: 0.85 }).map((f) => ({ ...f, clip: 'trunk' as const })),
  );
  // The tail fan: uropods (orange, dark-edged) either side of a spiny telson with two eyespots.
  const uropod: Part = {
    poly: leaf([81, 31], [94.5, 38.4], 6.2, 0.55),
    paint: '#E8572A',
    lines: [{ pts: [[82, 31.6], [93, 37.8]], w: 0.6, o: 0.6 }],
    edge: 0.85,
    marks: [{ poly: leaf([88, 34.4], [94.5, 38.4], 4, 0.4), paint: 'dark', o: 0.5 }, { poly: ellipse([90.6, 35.8], 1.1, 1), paint: '#F0E8C0', edge: 0.6 }, { poly: ellipse([90.6, 35.8], 0.55), paint: 'ink' }],
  };
  g.far.push(uropod);
  const telson = spline([atX(s, 82.6, 0), [87, 24.6], [92, 24], [96.2, 25.6, 1], [94.8, 27.2], [99, 28.6, 1], [95.6, 30.2], [99.4, 32.6, 1], [94.4, 33.6], [89.4, 35.4], atX(s, 82.6, 1)], true);
  g.far.push({
    poly: telson,
    paint: 'back',
    lines: [{ pts: [[84, 29.8], [95, 29.8]], w: 0.6, o: 0.6 }],
    edge: 0.85,
    marks: [{ poly: ellipse([89.6, 28.4], 1.7, 1.5), paint: '#F0E8C0', edge: 0.7 }, { poly: ellipse([89.6, 28.4], 0.85, 0.8), paint: 'ink' }],
  });
  // Walking legs: four short pairs under the thorax; pleopods under the abdomen.
  for (const x of [37, 41, 45, 49]) g.far.push(limb([atX(s, x, 0.95), [x - 1.4, 38.2], [x - 3.2, 41.4]], 0.85, 0.5, '#E8572A', 1));
  for (const x of [38.5, 42.5, 46.5]) g.near.push(limb([atX(s, x, 0.95), [x - 1.2, 38.8], [x - 3, 42.4]], 0.9, 0.5, '#E8572A', 1));
  for (const x of [54, 60.2, 66.4, 72.6]) g.far.push(limb([atX(s, x, 0.9), [x + 0.6, 37], [x + 2.4, 39]], 1, 0.6, '#E8572A'));
  // The raptorial arm: a spined upper arm folding forward and down, the swollen red-pink club
  // tucked back under the face with its heel at the front.
  const arm = makeArm({ path: [[27, 34.6], [22, 38.2], [17.4, 41.6]], w: [1.7, 1.5] });
  g.near.push({ poly: arm.poly, paint: '#E8572A', lines: [], edge: 0.85, marks: [] });
  const club = spline([[17.4, 41.8, 1], [15.6, 44.6], [18.6, 47.2], [24, 46.6], [30, 44], [33, 41.6], [28, 41.2], [22, 40.2]], true);
  g.near.push({
    poly: club,
    paint: '#E0506A',
    lines: [{ pts: [[18.6, 44.4], [24, 43.4], [30.4, 42.4]], w: 0.7, o: 0.6, taper: 'both' }],
    edge: 0.9,
    marks: [{ poly: ellipse([19.4, 45], 2.4, 2), paint: '#F2A0AC', o: 0.8 }],
  });
  for (const k of [0.25, 0.5, 0.75]) {
    const p = arm.at(k, -1);
    g.near.push({ poly: [add(p, [0.4, -0.6]), add(p, [-2.4, -1.8]), add(p, [-0.6, 0.8])], paint: '#E8572A', lines: [], edge: 0.7 });
  }
  // Antennal scales: orange paddles with a fringe, and short antennules (kept inside the plate).
  for (const [tip, far] of [
    [[8, 24.4], true],
    [[8.6, 30.6], false],
  ] as const) {
    const base: Pt = [17.2, 28.4];
    (far ? g.far : g.near).push({ poly: leaf(base, tip as Pt, 3.6, 0.5), paint: '#E8572A', lines: Array.from({ length: 5 }, (_, i) => ({ pts: [lerp(base, tip as Pt, 0.3 + i * 0.12), add(lerp(base, tip as Pt, 0.3 + i * 0.12), [-0.6, -1.8])] as Pt[], w: 0.5, o: 0.6 })), edge: 0.8 });
  }
  for (const [end, bend] of [
    [[6, 18], [11, 23]],
    [[5.4, 22.4], [10.4, 26]],
  ] as const) g.far.push(limb([[17, 26], bend as Pt, end as Pt], 0.3, 0.2, 'ink', 0, 0.5));
  // Stalked eyes, each split by a dark midband.
  for (const [b, far] of [
    [[19.6, 22.4], true],
    [[22.4, 21.6], false],
  ] as const) {
    const top = add(b as Pt, [-1.6, -4.6]);
    const stalk = limb([b as Pt, top], 0.9, 0.9, 'back');
    const eye: Part = {
      poly: ellipse(top, 3, 3.3, -12),
      paint: '#4FA7A0',
      lines: [],
      edge: 0.85,
      marks: [{ poly: ellipse(top, 3, 0.9, -12), paint: 'ink', o: 0.85, edge: 0 }, { poly: ellipse(add(top, [-0.8, -1.2]), 0.7), paint: '#F6F0E2', o: 0.8 }],
    };
    (far ? g.far : g.near).push(stalk, eye);
  }
  // The rostral plate between the eyes.
  g.near.push({ poly: spline([[18, 25.8], [14.4, 24.2, 1], [18.8, 24]], true), paint: 'back', lines: [], edge: 0.7 });
  return g;
}

// ── Caribbean spiny lobster ──────────────────────────────────────────────────
// No claws; very long, thick, spiny antennae sweeping forward and back over the body; two big
// horns over the eyes; a spiny carapace and a smooth segmented tail with big pale spots; legs
// striped blue and yellow.
function lobster(): PlateGeom {
  const g = emptyGeom();
  const s = trunk({
    tip: [26, 30],
    top: [[28, 25], [34, 21.4], [44, 19.8], [54, 20.4], [60, 22.4], [70, 24.4], [80, 26], [90, 27.6], [96, 28.8]],
    bot: [[28, 35], [34, 38.4], [44, 40], [54, 39.6], [60, 37.6], [70, 35.6], [80, 34.2], [90, 33], [96, 32.4]],
    blunt: 0.7,
  });
  const body = outlineOf(s);
  g.body = body;
  g.trunk = body;
  g.engraving = contours(s, { top: [0.05, 0.12, 0.2], bot: [0.7, 0.8, 0.88, 0.95] });
  g.heavy.push(s.bot);
  // The carapace ends at x 58; spines over it, pointing forward.
  g.lines.push({ pts: [atX(s, 58, 0), atX(s, 57, 0.5), atX(s, 58, 1)], w: 1.6, taper: 'both' });
  const spines: Part[] = [];
  for (let x = 30; x < 57; x += 3.4) {
    const p = atX(s, x, 0);
    spines.push({ poly: [add(p, [1.4, 0.4]), add(p, [-1.2, -2.2]), add(p, [-0.6, 0.6])], paint: 'back', lines: [], edge: 0.6 });
  }
  g.near.push(...spines);
  const rand = rng(89);
  g.marks.push(...scatterIn(region(s, tAtX(s, 30), tAtX(s, 56), 0.1, 0.85), { r: 0.5, gap: 1.6, paint: '#F0D27A', rand, tries: 220, o: 0.9 }).map((f) => ({ ...f, clip: 'trunk' as const })));
  // Tail segments with grooves and big pale spots (largest on the 2nd and 6th).
  for (const x of [64, 70, 76, 82, 88]) g.lines.push({ pts: [atX(s, x, 0), atX(s, x - 0.8, 0.55), atX(s, x, 1)], w: 1.1, o: 0.85, taper: 'both' });
  for (const [x, r] of [
    [67, 1.8],
    [73, 1.2],
    [79, 1.2],
    [85, 1.2],
    [91, 1.7],
  ])
    g.marks.push({ poly: ellipse(atX(s, x, 0.42), r, r * 0.85), paint: '#F0D27A', edge: 0.5 });
  // Tail fan.
  const tf = atX(s, 96, 0.5);
  g.far.push({
    poly: spline([add(tf, [0, -2.4]), add(tf, [6, -5.6]), corner(tf, [10.6, -3.4]), add(tf, [8.6, 0]), corner(tf, [10.6, 3.6]), add(tf, [6, 5.8]), add(tf, [0, 2.4])], true),
    paint: 'back',
    lines: [-0.5, 0, 0.5].map((k) => ({ pts: [tf, add(tf, [9, k * 5])] as Pt[], w: 0.6, o: 0.6 })),
    edge: 0.85,
    marks: [{ poly: spline([add(tf, [6, -5.6]), corner(tf, [10.6, -3.4]), add(tf, [8.6, 0]), corner(tf, [10.6, 3.6]), add(tf, [6, 5.8]), add(tf, [8, 0])], true), paint: '#E8C54A', o: 0.6 }],
  });
  // Legs: five pairs spread along the carapace, the front ones reaching forward and the back ones
  // trailing, striped lengthwise.
  for (const [x, far] of [
    [32, false],
    [38, false],
    [44, false],
    [50, false],
    [55.6, false],
    [35, true],
    [41, true],
    [47, true],
    [53, true],
  ] as const) {
    const top = atX(s, x, 0.92);
    const lean = (x - 43.8) * 0.9;
    const knee: Pt = [x + lean * 0.5 - 1, 44.6 + (far ? -1.2 : 0)];
    const foot: Pt = [x + lean * 1.2 - (far ? 0 : 1), 54 + (far ? -1.8 : 0) + Math.abs(lean) * 0.08];
    const leg = limb([top, knee, foot], 0.9, 0.4, '#E8C54A', 2);
    leg.marks = [{ poly: tube(resample(spline([top, knee, foot], false), 20), (t) => 0.32 * (1 - t * 0.5)), paint: '#3E6FB0' }];
    (far ? g.far : g.near).push(leg);
  }
  // Horns over the eyes, eye on its stalk.
  g.near.push({ poly: spline([[29, 25], [26, 20.6], [24, 17, 1], [27.6, 19.4], [32, 23.6]], true), paint: 'back', lines: [], edge: 0.8 });
  g.far.push({ poly: spline([[31, 24.4], [29.6, 19.6], [28.6, 16, 1], [31.6, 18.6], [34, 23]], true), paint: 'back', lines: [], edge: 0.8 });
  g.eyes.push({ c: [28.4, 26.6], r: 1.2 });
  // The antennae: long, thick at the base, spiny, sweeping forward and up and back over the body.
  const antenna = (path: Ctrl[], w: number, far: boolean) => {
    const c = resample(spline(path, false), 80);
    const part: Part = { poly: tube(c, (t) => w * (1 - t * 0.85)), paint: '#A8683A', lines: [], edge: 0.8 };
    const sp: Part[] = [];
    for (let i = 3; i < 40; i += 3) {
      const d = norm(sub(c[i + 1], c[i - 1]));
      const n = perp(d);
      const ww = w * (1 - (i / 79) * 0.85);
      for (const side of [-1, 1]) {
        const b = add(c[i], mul(n, side * ww * 0.9));
        sp.push({ poly: [add(b, mul(d, 0.6)), add(add(b, mul(n, side * 1.2)), mul(d, -1.2)), add(b, mul(d, -0.6))], paint: '#A8683A', lines: [], edge: 0.5 });
      }
    }
    (far ? g.far : g.near).push(part, ...sp);
  };
  // One sweeps forward and up, the other forward and out: they do not arch back over the body.
  antenna([[27, 28.6], [18, 24], [9, 17.6], [0, 11], [-9, 4]], 1.8, false);
  antenna([[28, 31], [18, 31.6], [8, 34.4], [-3, 39], [-13, 45]], 1.6, true);
  // Antennules: short, forked.
  for (const dy of [-1.4, 1]) g.lines.push({ pts: spline([[26, 30], [19, 30 + dy], [12, 29 + dy * 2]], false), w: 0.9, taper: 'end' }, { pts: spline([[19, 30 + dy], [13, 31.4 + dy * 2]], false), w: 0.7, taper: 'end' });
  return g;
}

// ── Christmas tree worm ──────────────────────────────────────────────────────
// Two spiral crowns of feathery radioles, like little fir trees, rising side by side from a dome
// of boulder coral; the antlered operculum between them.
function christmasTree(): PlateGeom {
  const g = emptyGeom();
  const rand = rng(91);
  // A low, rounded mound of coral (about a quarter of the plate), not a tall dome with hard sides.
  const coral = spline([[2, 66], [0.6, 61.4], [7, 57.4], [24, 54.6], [50, 53.2], [76, 54.6], [93, 57.4], [99.4, 61.4], [98, 66], [50, 67.6]], true);
  g.body = coral;
  g.trunk = coral;
  g.tint.push({ poly: coral, paint: '#B8A27A' });
  // Polyp cups over the coral.
  for (let k = 0; k < 160; k++) {
    const p: Pt = [rand() * 100, 53 + rand() * 14];
    if (![[-1.2, 0], [1.2, 0], [0, -0.7], [0, 0.7]].every(([dx, dy]) => inside([p[0] + dx, p[1] + dy], coral))) continue;
    g.lines.push({ pts: ellipse(p, 1, 0.6), w: 0.5, o: 0.55, detail: true });
  }
  g.engraving.push(...[0.92, 0.84, 0.76].map((k, i) => ({ pts: coral.filter((p) => p[1] < 65).map((p) => [50 + (p[0] - 50) * k, 66 - (66 - p[1]) * k] as Pt), w: 1.3 - i * 0.3, taper: 'both' as const })));
  // A crown: five tiers of frilled whorls stacked into a cone, each turn offset to suggest the spiral.
  const crown = (cx: number, base: number, h: number, w: number, dir: 1 | -1) => {
    const tiers = 7;
    for (let k = 0; k < tiers; k++) {
      const u = k / tiers;
      const y = base - u * h;
      const half = w * (1 - u * 0.86) * 0.5;
      const shift = dir * Math.sin(k * 1.4) * half * 0.12;
      const top = y - h / tiers - 1.6;
      const skirt: Pt[] = [];
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const x = cx + shift - half + (2 * half * i) / n;
        skirt.push([x, y + (i % 2 ? 0.9 : -0.2) - Math.sin((i / n) * Math.PI) * 1.2]);
      }
      const poly = [...skirt, [cx + shift + half * 0.3, top] as Pt, [cx + shift, top - 0.6] as Pt, [cx + shift - half * 0.3, top] as Pt];
      const radioles: Line[] = Array.from({ length: n }, (_, i) => ({ pts: [lerp([cx + shift, top], skirt[i], 0.25), skirt[i]] as Pt[], w: 0.5, o: 0.7 }));
      g.near.push({ poly: spline(poly as Ctrl[], true, 0.6, 6), paint: k % 2 ? 'back' : 'accent', lines: radioles, edge: 0.75 });
    }
  };
  crown(36, 51, 37, 26, 1);
  crown(64, 51, 37, 26, -1);
  // The operculum between them: a lid on a stalk with antler spines; the tube-rim spine.
  g.near.push({ poly: spline([[48.6, 52], [49, 45], [51, 45], [51.4, 52]], true), paint: '#E8DCC8', lines: [], edge: 0.7 });
  g.near.push({ poly: ellipse([50, 44.4], 3, 1.2), paint: '#E8DCC8', lines: [], edge: 0.8 });
  for (const [a, b] of [
    [[48.6, 43.6], [46.4, 39.4]],
    [[51.4, 43.6], [53.6, 39.4]],
    [[50, 43.4], [50, 38.6]],
  ] as const) {
    g.lines.push({ pts: [a as Pt, b as Pt], w: 1.2, taper: 'end' }, { pts: [lerp(a as Pt, b as Pt, 0.6), add(lerp(a as Pt, b as Pt, 0.6), [b[0] > a[0] ? 1.2 : -1.2, -0.8])], w: 0.8, taper: 'end' });
  }
  g.near.push({ poly: [[46, 52.2], [44.6, 48.4], [47.4, 51.6]], paint: '#E8DCC8', lines: [], edge: 0.6 });
  return g;
}

// ── Giant clam ───────────────────────────────────────────────────────────────
// Hinge down, valves gaping upward, seen from the front and above: a massive shell of four or
// five huge rounded folds, the lips of the two valves waving in and out of each other; the
// golden-brown mantle in the gape, speckled with iridescent blue-green spots.
function giantClam(): PlateGeom {
  const g = emptyGeom();
  const rand = rng(93);
  const folds = 5;
  const x0 = 6;
  const x1 = 94;
  const hinge: Pt = [50, 66];
  const N = 120;
  const lip = (base: number, amp: number, phase: number) =>
    Array.from({ length: N + 1 }, (_, i) => {
      const u = i / N;
      const x = x0 + (x1 - x0) * u;
      const edge = Math.sin(Math.PI * u) ** 0.5;
      return [x, base - 7 * Math.sin(Math.PI * u) + amp * edge * Math.cos(Math.PI * 2 * folds * u + phase)] as Pt;
    });
  const near = lip(33, 6.4, 0);
  const far = lip(22, 6.4, Math.PI);
  const farTop = far.map(([x, y]) => [x, y - 3.8 * Math.sin(Math.PI * ((x - x0) / (x1 - x0)))] as Pt);
  const belly = spline([[x1, near[N][1]], [93, 48], [80, 61], hinge, [20, 61], [7, 48], [x0, near[0][1]]], false);
  const whole = [...farTop, ...belly];
  g.body = whole;
  g.trunk = whole;
  // The far valve's rim (its thickness), then the mantle filling the gape.
  g.tint.push({ poly: [...farTop, ...far.slice().reverse()], paint: 'belly' });
  const mantle = [...far, ...near.slice().reverse()];
  g.tint.push({ poly: mantle, paint: 'accent' }, { poly: mantle, paint: '#2A9CA8', o: 0.4 });
  g.marks.push(
    ...scatterIn(mantle, { r: 0.6, gap: 0.5, paint: '#2EC2C8', rand, tries: 2200 }),
    ...scatterIn(mantle, { r: 0.5, gap: 0.8, paint: '#3E8AE0', rand, tries: 1200 }),
    ...scatterIn(mantle, { r: 0.35, gap: 0.6, paint: '#BEEFF0', rand, tries: 800, o: 0.85 }),
  );
  // Wavy fold lines along the mantle, and the exhalent siphon.
  for (const k of [0.3, 0.55, 0.78]) g.lines.push({ pts: far.map((p, i) => lerp(p, near[i], k)), w: 0.8, o: 0.55, taper: 'both' });
  g.marks.push({ poly: ellipse(lerp(far[N / 2], near[N / 2], 0.5), 3.2, 1.8), paint: 'accent', edge: 0.9 }, { poly: ellipse(lerp(far[N / 2], near[N / 2], 0.5), 1.6, 0.8), paint: 'ink', o: 0.8 });
  // The near valve: broad rounded folds converging on the hinge, shaded in their troughs.
  const valve = [...near, ...belly.slice(1)];
  const lines: Line[] = [];
  for (let f = 0; f < folds * 2; f++) {
    const u = (f + 0.5) / (folds * 2);
    const top = near[Math.round(u * N)];
    const trough = f % 2 === 1;
    lines.push({ pts: spline([top, lerp(top, hinge, 0.45), lerp(top, hinge, 0.9)], false), w: trough ? 2.4 : 0.6, o: trough ? 0.85 : 0.4, taper: 'end' });
    if (trough) {
      for (const dk of [-0.025, 0.025]) {
        const t2 = near[Math.round((u + dk) * N)];
        lines.push({ pts: spline([t2, lerp(t2, hinge, 0.45), lerp(t2, hinge, 0.86)], false), w: 1, o: 0.6, taper: 'end' });
      }
    }
  }
  // Growth lines across the folds.
  for (const k of [0.22, 0.4, 0.58, 0.74]) lines.push({ pts: near.map((p) => lerp(p, hinge, k)), w: 0.7, o: 0.5, taper: 'both' });
  // The near valve's rim has real thickness: a pale band along its inner side.
  const lipBand: Pt[] = [...near, ...near.slice().reverse().map(([x, y]) => [x, y + 3] as Pt)];
  g.near.push({ poly: valve, paint: 'back', lines, edge: 1.3, marks: [...scatterIn(valve, { r: 1.6, gap: 2.6, paint: '#9A9078', rand, tries: 50, o: 0.4, wobble: 0.5 }), { poly: lipBand, paint: '#E9E1CF' }] });
  g.heavy.push(belly);
  return g;
}

// ── Golden jellyfish ─────────────────────────────────────────────────────────
// The Jellyfish Lake form: a smooth golden hemispherical bell, paler at the crown, its margin a
// row of small lappets and no tentacles; a dense frilly cauliflower of oral arms hanging beneath,
// without long clubs; seen from a little below.
function goldenJelly(): PlateGeom {
  const g = emptyGeom();
  const rand = rng(99);
  const bell = spline([[16, 40, 1], [18, 28], [27, 15], [50, 8], [73, 15], [82, 28], [84, 40, 1], [70, 43], [50, 44.4], [30, 43]], true);
  g.body = bell;
  g.trunk = bell;
  // Paler towards the crown; the underside of the bell showing at the rim.
  g.tint.push({ poly: ellipse([46, 18], 18, 8, -8), paint: '#F1D58A', o: 0.75 }, { poly: ellipse([50, 41.4], 33, 3.6), paint: 'dark', o: 0.25 });
  // Fine granules and faint radial canals.
  g.marks.push(...scatterIn(bell, { r: 0.3, gap: 0.9, paint: '#F4EEDC', rand, tries: 900, o: 0.7 }).map((f) => ({ ...f, clip: 'trunk' as const })));
  for (let k = 0; k < 15; k++) {
    const u = (k + 0.5) / 15;
    const rimP: Pt = [16 + 68 * u, 40 + Math.sin(Math.PI * u) * 3.4];
    g.lines.push({ pts: spline([[50, 9.6], lerp([50, 9.6], rimP, 0.5).map((v, i) => v + (i ? 0 : (u - 0.5) * 6)) as Pt, rimP], false), w: 0.6, o: 0.4, taper: 'both' });
  }
  // Shading round the dome, heavier on the right.
  g.engraving.push(...[0.92, 0.82, 0.7].map((k, i) => ({ pts: spline([[50 + (16 - 50) * k, 40 - 2 * (1 - k)], [50 + (27 - 50) * k, 8 + 7 * k], [50, 8 + (1 - k) * 4], [50 + 23 * k, 8 + 7 * k], [50 + 34 * k, 40 - 2 * (1 - k)]], false).filter((p) => p[0] > 44), w: 1.6 - i * 0.4, taper: 'both' as const })));
  // The margin of the bell is glassy: a pale translucent band, with small lappets along its edge.
  g.marks.push({ poly: spline([[14, 35], [50, 33.4], [86, 35], [86, 47], [50, 49], [14, 47]], true), paint: '#FFF6D8', o: 0.5, clip: 'trunk' });
  for (let k = 0; k < 22; k++) {
    const u = (k + 0.5) / 22;
    const c: Pt = [16 + 68 * u, 40 + Math.sin(Math.PI * u) * 4.2];
    g.near.push({ poly: ellipse(c, 1.7, 1.1), paint: '#F1DB9C', lines: [], edge: 0.55 });
  }
  // The oral arms: four thick arms hanging from under the bell, each swelling into a knobbed,
  // frilly club.
  for (const [x0, bend, len, far] of [
    [41, -6, 22, true],
    [59, 6, 23, true],
    [46.4, -2.4, 26, false],
    [53.6, 2.4, 25, false],
  ] as const) {
    const lobes = Array.from({ length: 13 }, (_, j) => {
      const u = j / 12;
      const c: Pt = [x0 + bend * u * u + Math.sin(j * 1.6 + x0) * 0.7, 44 + len * u];
      const club = Math.exp(-(((u - 0.82) / 0.2) ** 2));
      return { c, rx: 2 + 2.2 * club + (j % 2) * 0.35, ry: 2.1 + 1.8 * club };
    });
    const arm = softUnion(lobes, 0.22, 0.3);
    const frills: Fill[] = scatterIn(arm, { r: 0.9, gap: 0.2, paint: '#C8923A', rand, tries: 160, o: 0.85 }).map((f) => ({ ...f, edge: 0.45 }));
    (far ? g.far : g.near).push({ poly: arm, paint: '#B8862E', lines: [], edge: 0.9, marks: frills });
  }
  g.heavy.push(spline([[50, 8], [73, 15], [82, 28], [84, 40]], false));
  return g;
}

export const INVERTS: Record<string, PlateDef> = {
  'anna-chromodoris': { build: anna, palette: { back: '#3B6FD4', belly: '#F7F7F2' } },
  'pikachu-nudibranch': { build: pikachu, palette: { back: '#F4B02A', belly: '#F7C24A', fin: '#F4B02A' } },
  'spanish-dancer': { build: spanishDancer, palette: { back: '#B3121E', belly: '#8E0E18', fin: '#B3121E', dark: '#6E0A12' } },
  'harlequin-shrimp': { build: harlequin, palette: { back: '#F6F0E4', belly: '#F6F0E4', fin: '#F6F0E4' } },
  'peacock-mantis-shrimp': { build: mantis, palette: { back: '#3E9A4A', belly: '#5CB060', fin: '#3E9A4A', dark: '#1E4A24' } },
  'caribbean-spiny-lobster': { build: lobster, palette: { back: '#7A5E36', belly: '#9A7A4A', fin: '#7A5E36', dark: '#3A2A16' } },
  'christmas-tree-worm': { build: christmasTree, palette: { back: '#F07A2A', belly: '#B8A27A', fin: '#B8A27A', accent: '#F6A86A' } },
  'golden-jellyfish': { build: goldenJelly, palette: { back: '#D6A443', belly: '#E7C774', fin: '#D6A443', dark: '#8A5A20' } },
  'giant-clam': { build: giantClam, palette: { back: '#D9D2C2', belly: '#C9C0AC', fin: '#D9D2C2', accent: '#8A6A2E' } },
};
