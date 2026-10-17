/**
 * Sharks, side on, facing left, in units of 1% of total length (snout tip at x = 0, tip of the
 * upper tail lobe at x = 100). A species is the requiem-shark base with its own proportions,
 * snout, fins, tail and markings.
 */
import { add, clipLine, type Ctrl, dist, lerp, mul, norm, perp, type Pt, rng, spline, sub } from './kit';
import {
  at,
  atX,
  contours,
  type FinShape,
  finLines,
  lineAlong,
  medianFin,
  type MedianFinSpec,
  outlineOf,
  outsideTrunk,
  pairedFin,
  type PairedFinSpec,
  region,
  spliceFins,
  type Strip,
  trunk,
} from './side';
import { emptyGeom, type Fill, type Line, type Paint, type Part, type PlateGeom } from './types';

export interface CaudalSpec {
  /** Tip of the upper lobe. */
  upper: Pt;
  /** Tip of the lower lobe. */
  lower: Pt;
  /** The inner corner of the trailing edge, between the lobes. */
  fork: Pt;
  /** Size of the terminal lobe and its notch (0: none, as in mackerel sharks). */
  notch?: number;
  /** Bulge of the upper lobe's top edge. */
  upperBow?: number;
  /** Bulge of the lower lobe's leading edge. */
  lowerBow?: number;
  /** Hollow of the upper lobe's trailing edge. */
  trail?: number;
  /** Hollow of the lower lobe's trailing edge. */
  lowerTrail?: number;
  /** Round the lower lobe's tip (nurse and carpet sharks have barely any). */
  lowerRound?: number;
  /** A single rounded paddle instead of lobes (manatee): its length and half-height. */
  paddle?: [number, number];
}

export interface SharkCtx {
  s: Strip;
  trunk: Pt[];
  d1?: FinShape;
  d2?: FinShape;
  anal?: FinShape;
  pelvic?: FinShape;
  pec: FinShape;
  caudal: FinShape & { lower: FinShape };
  rand: () => number;
}

export interface SharkSpec {
  /** Mammals and bony fish skip the shark-only details (nostril, gill slits). */
  kind?: 'shark' | 'mammal';
  /** A row of small knuckles along the back (sperm and humpback whales). */
  knuckles?: { at: number[]; base: number; h: number };
  tip: Pt;
  top: Ctrl[];
  bot: Ctrl[];
  blunt?: number;
  noseTilt?: number;
  caudal: CaudalSpec;
  d1?: MedianFinSpec;
  d2?: MedianFinSpec;
  anal?: MedianFinSpec;
  pelvic?: MedianFinSpec;
  pec: PairedFinSpec;
  eye: { x: number; f: number; r: number; iris?: Paint };
  gills: { n: number; x: number; step: number; f0: number; f1: number; grow?: number; bow?: number; weight?: number };
  /** The mouth as a curve of [x, depth] points. */
  mouth?: [number, number][];
  /** Where the pale belly starts, as a depth fraction along the body (a number or a function of t). */
  belly?: number | ((t: number) => number);
  /** A soft band above the belly line instead of a hard edge. */
  softBelly?: boolean;
  /** A ridge (keel) along the tail stock. */
  keel?: boolean;
  /** Extra drawing: markings, barbels, ridges. */
  extra?: (c: SharkCtx) => { marks?: Fill[]; tint?: Fill[]; lines?: Line[]; near?: Part[]; median?: { fin: keyof SharkCtx; marks: Fill[] }[] };
  seed?: number;
}

/** The tail: a lobed outline from the top of the tail stock round to the bottom of it. */
export function caudal(s: Strip, c: CaudalSpec): FinShape & { lower: FinShape } {
  const top = s.top[s.top.length - 1];
  const bot = s.bot[s.bot.length - 1];
  const { upper: T, lower: L, fork: F, notch = 0, upperBow = 0.06, lowerBow = 0.12, trail = 0.08, lowerTrail = 0.04, lowerRound = 0 } = c;
  const bulge = (a: Pt, b: Pt, k: number): Pt => add(lerp(a, b, 0.5), mul(perp(norm(sub(b, a))), k * dist(a, b)));
  if (c.paddle) {
    const [len, half] = c.paddle;
    const x0 = top[0];
    const midY = (top[1] + bot[1]) / 2;
    const outline = spline([top, [x0 + len * 0.3, midY - half * 0.85], [x0 + len * 0.75, midY - half], [x0 + len, midY], [x0 + len * 0.75, midY + half], [x0 + len * 0.3, midY + half * 0.85], bot], false, 1, 14, { start: [1, -1.2], end: [-1, -1.2] });
    const poly = [...outline, add(bot, [-3, 0]), add(top, [-3, 0])];
    const n = outline.length;
    const upper = outline.slice(0, Math.floor(n / 2) + 1);
    const lower = outline.slice(Math.floor(n / 2));
    const fin = { outline, poly, le: upper, te: [...upper].reverse(), apex: outline[Math.floor(n / 2)] };
    return { ...fin, le: upper, te: lower.slice().reverse(), lower: { ...fin, le: lower.slice().reverse(), te: upper } };
  }
  const ctrl: Ctrl[] = [top, bulge(top, T, upperBow), [T[0], T[1], 1]];
  let afterTip: Pt = T;
  if (notch > 0) {
    // Terminal lobe: down from the tip, then forward into the subterminal notch.
    const lobe: Pt = add(T, [-notch * 0.3, notch * 1.05]);
    const n: Pt = add(T, [-notch * 1.15, notch * 1.3]);
    ctrl.push(lobe, [n[0], n[1], 1]);
    afterTip = n;
  }
  ctrl.push(bulge(afterTip, F, -trail), [F[0], F[1], 1], bulge(F, L, -lowerTrail));
  if (lowerRound > 0) {
    ctrl.push(add(L, mul(norm(sub(F, L)), lowerRound)), add(L, mul(norm(sub(bot, L)), lowerRound)));
  } else ctrl.push([L[0], L[1], 1]);
  ctrl.push(bulge(L, bot, lowerBow), bot);
  const outline = spline(ctrl, false, 1, 14, { start: norm(sub(T, top)) });
  const k = (p: Pt) => outline.reduce((bi, q, i) => (dist(q, p) < dist(outline[bi], p) ? i : bi), 0);
  const ti = k(T);
  const fi = k(F);
  const li = k(L);
  const poly = [...outline, add(bot, [-3, 0]), add(top, [-3, 0])];
  return {
    outline,
    poly,
    le: outline.slice(0, ti + 1),
    te: outline.slice(ti, fi + 1).reverse(),
    apex: T,
    lower: { outline, poly, le: [...outline.slice(li).reverse()], te: outline.slice(fi, li + 1), apex: L },
  };
}

export function shark(spec: SharkSpec): PlateGeom {
  const g = emptyGeom();
  const s = trunk({ tip: spec.tip, top: spec.top, bot: spec.bot, blunt: spec.blunt, noseTilt: spec.noseTilt });
  const trunkPoly = outlineOf(s);
  const d1 = spec.d1 && medianFin(s.top, spec.d1, -1);
  const d2 = spec.d2 && medianFin(s.top, spec.d2, -1);
  const knuckles = (spec.knuckles?.at ?? []).map((x) => medianFin(s.top, { at: x, base: spec.knuckles!.base, h: spec.knuckles!.h, sweep: 0.5, round: spec.knuckles!.base * 0.4, convex: 0.2, concave: 0 }, -1));
  const anal = spec.anal && medianFin(s.bot, spec.anal, 1);
  const pelvic = spec.pelvic && medianFin(s.bot, spec.pelvic, 1);
  const pec = pairedFin(s, spec.pec);
  const cd = caudal(s, spec.caudal);
  const topEdge = spliceFins(s.top, [d1, d2, ...knuckles].filter(Boolean) as FinShape[]);
  const botEdge = spliceFins(s.bot, [...(pelvic ? [pelvic] : []), ...(anal ? [anal] : [])]);
  g.body = [...topEdge, ...cd.outline.slice(1, -1), ...botEdge.reverse()];
  g.trunk = trunkPoly;
  const ctx: SharkCtx = { s, trunk: trunkPoly, d1, d2, anal, pelvic, pec, caudal: cd, rand: rng(spec.seed ?? 7) };

  // Median fins: wash and lines (kept off the body).
  const med = (f: FinShape | undefined, n: number): Part | undefined =>
    f && { poly: f.poly, paint: 'back', lines: outsideTrunk(finLines(f, n, 0.86, 0.75), trunkPoly) };
  const medians = [med(d1, 7), med(d2, 3), med(anal, 3), med(pelvic, 4)].filter(Boolean) as Part[];
  medians.push({ poly: cd.poly, paint: 'back', lines: outsideTrunk([...finLines(cd, 7, 0.9, 0.75), ...finLines(cd.lower, 5, 0.85, 0.7)], trunkPoly) });
  g.median = medians;

  // Belly: pale below a line along the flank.
  const belly = spec.belly ?? 0.6;
  if (spec.softBelly) g.tint.push({ poly: region(s, 0, 1, typeof belly === 'number' ? belly - 0.1 : (t) => belly(t) - 0.1, 1.02), paint: 'belly', o: 0.45, clip: 'trunk' });
  g.tint.push({ poly: region(s, 0, 1, belly, 1.02), paint: 'belly', clip: 'trunk' });

  // Shadow along the back and under the belly, under the engraving.
  g.tint.push({ poly: region(s, 0, 1, -0.02, 0.2), paint: 'dark', o: 0.13, clip: 'trunk' });
  g.tint.push({ poly: region(s, 0, 1, 0.93, 1.02), paint: 'dark', o: 0.08, clip: 'trunk' });
  g.engraving = contours(s);
  // Shadow under the pectoral fin.
  const shadow = region(s, 0.21, 0.36, 0.7, 0.98);
  g.engraving.push(
    ...[0, 1, 2, 3, 4, 5, 6].flatMap((i) =>
      clipLine([at(s, 0.2 + i * 0.022, 0.62), at(s, 0.24 + i * 0.022, 1)], shadow).map((pts) => ({ pts, w: 0.6 })),
    ),
  );

  const pecPart: Part = { poly: pec.poly, paint: 'back', lines: finLines(pec, 6, 0.9, 0.7) };
  g.near.push(pecPart);

  // Gill slits: slightly bowed, each with a fine shadow line behind it.
  const { n, x, step, f0, f1, grow = 0, bow = 0.6, weight = 1.5 } = spec.kind === 'mammal' ? { ...spec.gills, n: 0 } : spec.gills;
  for (let i = 0; i < n; i++) {
    const gx = x + i * step;
    const lenK = 1 + grow * (i - (n - 1) / 2);
    const mid = (f0 + f1) / 2;
    const a = atX(s, gx, mid - ((f1 - f0) / 2) * lenK);
    const b = atX(s, gx - 0.3, mid + ((f1 - f0) / 2) * lenK);
    const m = add(lerp(a, b, 0.5), [bow, 0]);
    const slit = spline([a, m, b], false);
    g.lines.push({ pts: slit, w: weight });
    g.lines.push({ pts: slit.map(([px, py]) => [px + 0.55, py] as Pt), w: 0.6, o: 0.5, detail: true });
  }
  if (spec.mouth) {
    const m = spline(spec.mouth.map(([mx, mf]) => atX(s, mx, mf)), false);
    g.lines.push({ pts: m, w: 1.5 }, { pts: m.map(([px, py]) => [px, py + 0.45] as Pt), w: 0.6, o: 0.5, detail: true });
  }
  // Nostril.
  if (spec.kind !== 'mammal') g.lines.push({ pts: spline([atX(s, 2.6, 0.82), atX(s, 3.3, 0.88), atX(s, 4.1, 0.84)], false), w: 0.9, detail: true });
  if (spec.keel) {
    const k0 = s.top.length - 1;
    g.lines.push({ pts: lineAlong(s, 0.52, (k0 - 14) / k0, 1), w: 1 });
    g.lines.push({ pts: [at(s, 1, 0.52), lerp(cd.apex, cd.lower.apex, 0.5).map((v, i) => (i ? v : v - 6)) as Pt], w: 0.8, detail: true });
  }
  g.eyes.push({ c: atX(s, spec.eye.x, spec.eye.f), r: spec.eye.r, iris: spec.eye.iris });
  g.heavy.push(s.bot);

  const extra = spec.extra?.(ctx);
  if (extra) {
    g.marks.push(...(extra.marks ?? []));
    g.tint.push(...(extra.tint ?? []));
    g.lines.push(...(extra.lines ?? []));
    g.near.push(...(extra.near ?? []));
    for (const m of extra.median ?? []) {
      const finShape = ctx[m.fin] as FinShape | undefined;
      const target = finShape === pec ? pecPart : medians.find((p) => p.poly === finShape?.poly);
      if (target) target.marks = [...(target.marks ?? []), ...m.marks];
    }
  }
  return g;
}

/** The requiem-shark base (Carcharhinus): every shark starts here and changes what makes it itself. */
export const requiem: SharkSpec = {
  tip: [0, 0],
  blunt: 0.5,
  top: [
    [2.5, -2.5],
    [7, -5.2],
    [14, -7.8],
    [22, -9.6],
    [32, -10.2],
    [44, -9.2],
    [55, -7.2],
    [64, -5.1],
    [70, -3.7],
    [74, -3],
  ],
  bot: [
    [3, 1.6],
    [8, 3.4],
    [15, 5.6],
    [25, 7.9],
    [36, 8.9],
    [46, 8.4],
    [56, 6.5],
    [64, 4.4],
    [70, 3],
    [74, 2.4],
  ],
  caudal: { upper: [100, -17.5], lower: [87, 11.5], fork: [85.5, 1.8], notch: 3.4, upperBow: 0.05, lowerBow: 0.14, trail: 0.06 },
  d1: { at: 29, base: 10, h: 10.5, sweep: 0.62, rear: 3, rearLift: 0.5, convex: 0.08, concave: 0.12, round: 0.9 },
  d2: { at: 60.5, base: 3.3, h: 2.9, sweep: 0.55, rear: 3, rearLift: 0.6, convex: 0.05, concave: 0.1 },
  anal: { at: 61.5, base: 3.4, h: 3.2, sweep: 0.5, rear: 2.8, rearLift: 0.6, convex: 0.05, concave: 0.12 },
  pelvic: { at: 47, base: 4.2, h: 4.6, sweep: 0.5, rear: 2.4, rearLift: 0.8, convex: 0.06, concave: 0.08 },
  pec: { at: [19.5, 0.74], base: 5, len: 17.5, angle: 50, width: 0.36, convex: 0.07, concave: 0.13, round: 0.7, rear: 0.12 },
  eye: { x: 7.4, f: 0.36, r: 0.95 },
  gills: { n: 5, x: 15.2, step: 1.55, f0: 0.3, f1: 0.74, grow: -0.04 },
  mouth: [
    [4.6, 0.95],
    [7.2, 0.9],
    [9.6, 0.84],
  ],
  belly: 0.62,
  softBelly: true,
};

type SharkChanges = Partial<Omit<SharkSpec, 'pec' | 'caudal' | 'eye' | 'gills'>> & {
  pec?: Partial<PairedFinSpec>;
  caudal?: Partial<CaudalSpec>;
  eye?: Partial<SharkSpec['eye']>;
  gills?: Partial<SharkSpec['gills']>;
};

/** A species from the base with some parts changed (fins and tail merge field by field). */
export function variant(base: SharkSpec, changes: SharkChanges): SharkSpec {
  const merged = { ...base, ...changes } as SharkSpec;
  for (const k of ['d1', 'd2', 'anal', 'pelvic', 'pec', 'caudal', 'eye', 'gills'] as const) {
    const ch = changes[k];
    if (ch && base[k]) (merged as unknown as Record<string, unknown>)[k] = { ...base[k], ...ch };
  }
  return merged;
}

export interface BodyShape {
  /** x of the start of the tail (end of the trunk). */
  ped: number;
  /** Greatest depth, % TL. */
  depth: number;
  /** x of the deepest point. */
  at: number;
  /** Share of the depth above the snout's line (the rest is below). */
  up?: number;
  /** Tail-stock height, % TL. */
  pedH?: number;
  /** How fast the back and belly rise behind the snout: 2 pointed, 3+ blunt. */
  riseTop?: number;
  riseBot?: number;
  /** How slender the tail stock gets (1 even taper; more pinches it in). */
  taper?: number;
  /** A hump on the back just ahead of the first dorsal (sand tiger), % TL. */
  hump?: [number, number];
  /** Extra sag of the belly (big adults), % TL at its deepest. */
  sag?: number;
  /** The whole body arches: positive lifts the tail end. */
  arch?: number;
  /** How blunt and rounded the snout is, 0 (tapering to a point) to 1 (a rounded, square front). */
  nose?: number;
}

/** Back and belly control points for a shark-like body from a few proportions. */
export function bodyShape(b: BodyShape): { top: Ctrl[]; bot: Ctrl[] } {
  const { ped, depth, at: deep, up = 0.53, pedH = 5, riseTop = 2.3, riseBot = 1.9, taper = 1, hump, sag = 0, arch = 0, nose } = b;
  const pedRatio = pedH / depth;
  // A blunt snout widens faster right at the tip: the distance from it is warped by a power below 1.
  const warp = 1 - 0.5 * (nose ?? 0);
  const shape = (x: number, rise: number) => {
    if (x <= deep) return 1 - (1 - (x / deep) ** warp) ** rise;
    const s = (x - deep) / (ped - deep);
    return pedRatio + (1 - pedRatio) * (0.5 + 0.5 * Math.cos(Math.PI * s)) ** taper;
  };
  const lift = (x: number) => -arch * Math.max(0, (x - deep) / (ped - deep)) ** 2;
  const xs = nose ? [0.15, 0.5, 1, 1.7, 2.6, 3.7, 5, 6.6, 8.5, 11.5, 15, 19.5, 25] : [0.7, 1.6, 2.8, 4.3, 6.2, 8.5, 11.5, 15, 19.5, 25];
  for (let x = 30; x < ped; x += 6) xs.push(x);
  const all = [...xs.filter((x) => x < ped - 2), ped];
  const top = all.map((x) => {
    let y = -depth * up * shape(x, riseTop);
    if (hump) y -= hump[1] * Math.exp(-(((x - hump[0]) / 9) ** 2));
    return [x, y + lift(x)] as Ctrl;
  });
  const bot = all.map((x) => {
    let y = depth * (1 - up) * shape(x, riseBot);
    if (sag) y += sag * Math.exp(-(((x - deep - 6) / 14) ** 2));
    return [x, y + lift(x)] as Ctrl;
  });
  return { top, bot };
}
