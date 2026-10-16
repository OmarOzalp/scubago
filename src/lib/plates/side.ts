/**
 * Building blocks for animals drawn from the side, head to the left: the trunk as a "strip"
 * (a top edge and a bottom edge sampled at the same points from snout to tail), fins attached to
 * its edges, and the engraving lines that follow its form.
 */
import {
  add,
  along,
  clipLine,
  type Ctrl,
  dist,
  lerp,
  mixNum,
  mul,
  norm,
  perp,
  type Pt,
  resample,
  slice,
  spline,
  sub,
  yAt,
} from './kit';
import type { Fill, Line, Paint, Part } from './types';

/** Top and bottom edges of a side-view trunk, sampled at the same x positions, snout first. */
export interface Strip {
  top: Pt[];
  bot: Pt[];
}

const idx = (s: Strip, t: number) => {
  const k = Math.max(0, Math.min(1, t)) * (s.top.length - 1);
  const i = Math.min(s.top.length - 2, Math.floor(k));
  return { i, r: k - i };
};

/** The point a fraction t along the trunk (by sample) and f of the way from its top to its bottom. */
export function at(s: Strip, t: number, f: number): Pt {
  const { i, r } = idx(s, t);
  const top = lerp(s.top[i], s.top[i + 1], r);
  const bot = lerp(s.bot[i], s.bot[i + 1], r);
  return lerp(top, bot, f);
}

/** t for an x position (the strip is sampled at increasing x). */
export function tAtX(s: Strip, x: number): number {
  const xs = s.top;
  if (x <= xs[0][0]) return 0;
  for (let i = 1; i < xs.length; i++) {
    if (xs[i][0] >= x) return (i - 1 + (x - xs[i - 1][0]) / (xs[i][0] - xs[i - 1][0] || 1)) / (xs.length - 1);
  }
  return 1;
}

/** The point at x (rather than t) and f. */
export const atX = (s: Strip, x: number, f: number) => at(s, tAtX(s, x), f);

/** A line along the trunk at depth f (a number, or a function of t), from t0 to t1. */
export function lineAlong(s: Strip, f: number | ((t: number) => number), t0 = 0, t1 = 1, n = 0): Pt[] {
  const count = n || Math.max(8, Math.round((t1 - t0) * s.top.length));
  return Array.from({ length: count }, (_, k) => {
    const t = t0 + ((t1 - t0) * k) / (count - 1);
    return at(s, t, typeof f === 'number' ? f : f(t));
  });
}

/** A closed region of the trunk between two depth lines, from t0 to t1. */
export function region(s: Strip, t0: number, t1: number, f0: number | ((t: number) => number), f1: number | ((t: number) => number)): Pt[] {
  return [...lineAlong(s, f0, t0, t1), ...lineAlong(s, f1, t0, t1).reverse()];
}

/** The trunk outline: along the top from the snout, back along the bottom. */
export const outlineOf = (s: Strip): Pt[] => [...s.top, ...s.bot.slice(0, -1).reverse()];

export interface TrunkSpec {
  /** The snout tip. */
  tip: Pt;
  /** Points along the back from just behind the snout to the tail end (the last is the end). */
  top: Ctrl[];
  /** Points along the belly, likewise. */
  bot: Ctrl[];
  /** How blunt the snout is: 0 pointed (the edges leave the tip along their own line), 1 round (straight up and down). */
  blunt?: number;
  /** For blunt snouts, how far the roundness leans: positive tips the nose down. */
  noseTilt?: number;
  samples?: number;
}

/** The trunk as a strip, from the snout tip and the control points of its back and belly. */
export function trunk(spec: TrunkSpec): Strip {
  const { tip, blunt = 0, noseTilt = 0, samples = 170 } = spec;
  const leave = (first: Ctrl, up: number): Pt => {
    const along = norm(sub([first[0], first[1]], tip));
    const round: Pt = norm([noseTilt * 0.6, up]);
    return norm(lerp(along, round, blunt));
  };
  const top = spline([tip, ...spec.top], false, 1, 14, { start: leave(spec.top[0], -1) });
  const bot = spline([tip, ...spec.bot], false, 1, 14, { start: leave(spec.bot[0], 1) });
  const x0 = tip[0];
  const x1 = Math.min(top[top.length - 1][0], bot[bot.length - 1][0]);
  // Sample densely near the snout, where the edges turn fastest.
  const xs = Array.from({ length: samples }, (_, k) => {
    const u = k / (samples - 1);
    return x0 + (x1 - x0) * (u < 0.18 ? (u / 0.18) ** 1.6 * 0.18 : u);
  });
  return { top: xs.map((x) => [x, yAt(top, x)] as Pt), bot: xs.map((x) => [x, yAt(bot, x)] as Pt) };
}

/** Engraving that follows the trunk: lines along its length, close together along the back and the belly. */
export function contours(
  s: Strip,
  opts: { top?: number[]; bot?: number[]; t0?: number; t1?: number; weight?: number; topW?: number[]; botW?: number[] } = {},
): Line[] {
  const topF = opts.top ?? [0.035, 0.075, 0.12, 0.17, 0.225, 0.285, 0.35];
  const botF = opts.bot ?? [0.74, 0.79, 0.835, 0.875, 0.91, 0.94, 0.968];
  const w = opts.weight ?? 1;
  const out: Line[] = [];
  const t0 = opts.t0 ?? 0.012;
  const t1 = opts.t1 ?? 1;
  topF.forEach((f, i) => {
    const k = 1 - i / topF.length;
    out.push({ pts: lineAlong(s, f, t0, t1), w: w * (opts.topW?.[i] ?? 0.6 + 1.5 * k), taper: 'both' });
  });
  botF.forEach((f, i) => {
    const k = (i + 1) / botF.length;
    out.push({ pts: lineAlong(s, f, t0, t1), w: w * (opts.botW?.[i] ?? 0.6 + 1.6 * k), taper: 'both' });
  });
  return out;
}

export interface MedianFinSpec {
  /** x of the fin's origin (its leading edge meets the body). */
  at: number;
  /** Length of its base along the body. */
  base: number;
  /** Height of the apex above (or below) the body line. */
  h: number;
  /** Where the apex sits over the base: 0 over the origin, 1 over the insertion, more raked further back. */
  sweep?: number;
  /** How far the free rear tip trails behind the insertion. */
  rear?: number;
  /** How high the free rear tip sits off the body. */
  rearLift?: number;
  /** Bulge of the leading edge (0 straight). */
  convex?: number;
  /** Hollow of the trailing edge (0 straight; sharks' falcate fins about 0.12). */
  concave?: number;
  /** Rounding of the apex, in drawing units. */
  round?: number;
  /** Extra points along the leading edge (fractions [along, out]) for special shapes. */
  paint?: Paint;
}

export interface FinShape {
  /** From the origin, out round the fin, to the insertion (to splice into the body outline). */
  outline: Pt[];
  /** Closed shape for washes and hatching (its base dips into the body). */
  poly: Pt[];
  /** Leading edge, origin to apex. */
  le: Pt[];
  /** Trailing edge, rear tip to apex. */
  te: Pt[];
  apex: Pt;
}

/**
 * A median fin (dorsal, anal, pelvic in side view) standing on a body edge. `dir` is -1 for fins
 * on the back (pointing up) and 1 for fins under the belly.
 */
export function medianFin(edge: Pt[], spec: MedianFinSpec, dir: -1 | 1): FinShape {
  const { at: x0, base, h, sweep = 0.6, rear = 0, rearLift = 0, convex = 0.06, concave = 0.08, round = 0 } = spec;
  const O: Pt = [x0, yAt(edge, x0)];
  const I: Pt = [x0 + base, yAt(edge, x0 + base)];
  const ax = x0 + base * sweep;
  const A: Pt = [ax, yAt(edge, Math.min(ax, x0 + base)) + dir * h];
  const R: Pt = rear > 0 ? [I[0] + rear, yAt(edge, I[0] + rear) + dir * rearLift] : I;
  const out = (a: Pt, b: Pt, k: number): Pt => {
    // A point between a and b pushed sideways: k > 0 bulges away from the fin's middle.
    const m = lerp(a, b, 0.5);
    const n = perp(norm(sub(b, a)));
    return add(m, mul(n, k * dist(a, b) * (dir === -1 ? 1 : -1)));
  };
  const M1 = out(O, A, convex);
  const M2 = out(A, R, -concave);
  const apex: Ctrl[] = [];
  if (round > 0) {
    const a1 = add(A, mul(norm(sub(O, A)), round));
    const a2 = add(A, mul(norm(sub(R, A)), round));
    apex.push(a1, lerp(A, lerp(a1, a2, 0.5), 0.42), a2);
  } else apex.push([A[0], A[1], 1]);
  const ctrl: Ctrl[] = [O, M1, ...apex, M2];
  if (rear > 0) ctrl.push([R[0], R[1], 1], lerp(R, I, 0.5), I);
  else ctrl.push(I);
  const edgeDir = norm(sub([x0 + 1, yAt(edge, x0 + 1)], O));
  const leDir = norm(sub(M1, O));
  const outline = spline(ctrl, false, 1, 14, { start: norm(lerp(edgeDir, leDir, 0.72)) });
  // Split at the apex (the outline point furthest from the body line).
  let ai = 0;
  let best = -Infinity;
  outline.forEach((p, i) => {
    const d = dir * (p[1] - yAt(edge, p[0]));
    if (d > best) {
      best = d;
      ai = i;
    }
  });
  const ri = rear > 0 ? outline.reduce((bi, p, i) => (p[0] > outline[bi][0] ? i : bi), 0) : outline.length - 1;
  const dip = -dir * 3;
  const poly = [...outline, [I[0], I[1] + dip] as Pt, [O[0], O[1] + dip] as Pt];
  return { outline, poly, le: outline.slice(0, ai + 1), te: outline.slice(ai, ri + 1).reverse(), apex: outline[ai] };
}

/** Splices fins into an edge: the edge up to each fin's origin, the fin, then on from its insertion. */
export function spliceFins(edge: Pt[], fins: FinShape[]): Pt[] {
  const sorted = [...fins].sort((a, b) => a.outline[0][0] - b.outline[0][0]);
  const out: Pt[] = [];
  let k = 0;
  for (const f of sorted) {
    const x0 = f.outline[0][0];
    const x1 = f.outline[f.outline.length - 1][0];
    while (k < edge.length && edge[k][0] < x0) out.push(edge[k++]);
    out.push(...f.outline);
    while (k < edge.length && edge[k][0] <= x1) k++;
  }
  while (k < edge.length) out.push(edge[k++]);
  return out;
}

/**
 * Lines that run up a fin from its base towards the apex, between its leading and trailing edges
 * (closer together towards the trailing edge, where it's in shadow).
 */
export function finLines(fin: { le: Pt[]; te: Pt[] }, n = 6, reach = 0.9, w = 0.7): Line[] {
  const N = 40;
  const le = resample(fin.le, N);
  const te = resample(fin.te, N);
  const out: Line[] = [];
  for (let k = 1; k <= n; k++) {
    const f = (k / (n + 1)) ** 0.8;
    const pts: Pt[] = [];
    for (let i = 0; i < N * reach; i++) pts.push(lerp(le[i], te[i], f));
    out.push({ pts, w: w * (0.7 + 0.9 * f), taper: 'end' });
  }
  return out;
}

/** Lines kept outside the trunk (for fins whose base dips into the body). */
export const outsideTrunk = (lines: Line[], trunkPoly: Pt[]): Line[] =>
  lines.flatMap((l) => clipLine(l.pts, trunkPoly, true).map((pts) => ({ ...l, pts })));

export interface PairedFinSpec {
  /** The origin (front of the base) as [x, depth fraction from the top]. */
  at: [number, number];
  /** Length of the base along the body. */
  base: number;
  /** Length of the leading edge. */
  len: number;
  /** Angle of the leading edge below the horizontal, pointing back (degrees). */
  angle: number;
  /** Width of the fin across its tip region, as a fraction of `len`. */
  width?: number;
  convex?: number;
  concave?: number;
  round?: number;
  /** How far back the inner corner (free rear tip) reaches past the base, as a fraction of `len`. */
  rear?: number;
}

/** A paired fin (pectoral, or a pelvic seen from the side) lying on the flank. */
export function pairedFin(s: Strip, spec: PairedFinSpec): FinShape & { base: Pt[] } {
  const { at: [x, f], base, len, angle, width = 0.45, convex = 0.08, concave = 0.12, round = 0, rear = 0.15 } = spec;
  const O = atX(s, x, f);
  const I = atX(s, x + base, f - 0.04);
  const a = (angle * Math.PI) / 180;
  const T: Pt = add(O, [Math.cos(a) * len, Math.sin(a) * len]);
  // The free rear tip: back from the base, a little way down the trailing edge.
  const back = norm(sub(T, O));
  const P: Pt = add(add(I, mul(back, len * 0.18)), [len * rear, 0]);
  const wvec = mul(perp(back), -len * width);
  const side = (p: Pt, q: Pt, k: number): Pt => add(lerp(p, q, 0.5), mul(perp(norm(sub(q, p))), k * dist(p, q)));
  const tipCtrl: Ctrl[] =
    round > 0
      ? [add(T, mul(norm(sub(O, T)), round)), add(T, mul(norm(wvec), -round * 0.2)), add(T, mul(norm(sub(P, T)), round))]
      : [[T[0], T[1], 1]];
  const le = spline([O, side(O, T, -convex), ...tipCtrl.slice(0, Math.ceil(tipCtrl.length / 2))], false);
  const ctrl: Ctrl[] = [[O[0], O[1], 1], side(O, T, -convex), ...tipCtrl, side(T, P, concave), [P[0], P[1], 1], lerp(P, I, 0.5), [I[0], I[1], 1]];
  const outline = spline(ctrl, false);
  const baseLine = spline([I, lerp(lerp(I, O, 0.5), atX(s, x + base / 2, f + 0.02), 0.5), O], false);
  const poly = [...outline, ...baseLine.slice(1, -1)];
  // Trailing edge from the rear tip to the apex.
  let ti = 0;
  let far = -1;
  outline.forEach((p, i) => {
    const d = dist(p, O);
    if (d > far) {
      far = d;
      ti = i;
    }
  });
  let pi = ti;
  let pd = Infinity;
  for (let i = ti; i < outline.length; i++) {
    const d = dist(outline[i], P);
    if (d < pd) {
      pd = d;
      pi = i;
    }
  }
  return { outline, poly, le, te: outline.slice(ti, pi + 1).reverse(), apex: outline[ti], base: baseLine };
}

/** A part (fin) ready to draw: its shape, wash and lines. */
export const part = (shape: { poly: Pt[]; le: Pt[]; te: Pt[] }, paint: Paint, n = 6, w = 0.7, reach = 0.88): Part => ({
  poly: shape.poly,
  paint,
  lines: finLines(shape, n, reach, w),
});

/** A wavering line (for countershading edges): f(t) plus a seeded zigzag. */
export function ragged(base: (t: number) => number, amp: number, freq: number, seed = 1): (t: number) => number {
  return (t) => base(t) + amp * (Math.sin(t * freq * 6.283 + seed) * 0.6 + Math.sin(t * freq * 2.7 * 6.283 + seed * 2.1) * 0.4);
}

/** Region of a fin beyond a fraction of the way from its base to its apex (for coloured tips). */
export function finTip(fin: { poly: Pt[]; le: Pt[]; te: Pt[] }, from: number, paint: Paint, o = 1): Fill {
  const a = along(fin.le, from);
  const b = along(fin.te, from);
  // Keep the part of the fin on the apex side of the line a–b.
  const n = perp(norm(sub(b, a)));
  const apex = fin.le[fin.le.length - 1];
  const sideOf = (p: Pt) => Math.sign((p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1]);
  const want = sideOf(apex);
  const poly = clipHalf(fin.poly, a, n, want);
  return { poly, paint, o };
}

/** Sutherland–Hodgman against one half-plane (points p with sign((p - a)·n) == want). */
export function clipHalf(poly: Pt[], a: Pt, n: Pt, want: number): Pt[] {
  const val = (p: Pt) => ((p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1]) * want;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const vp = val(p);
    const vq = val(q);
    if (vp >= 0) out.push(p);
    if (vp >= 0 !== vq >= 0) out.push(lerp(p, q, vp / (vp - vq)));
  }
  return out;
}

/** Part of a polyline between fractions (re-exported for builders). */
export { slice, mixNum };
