/**
 * Markings for side-view animals, placed in body coordinates (t along the body, f from back to
 * belly) so they follow its shape: spots, bars, bands along a fin's edge, mottling.
 */
import { add, blob, clamp, dist, ellipse, lerp, mul, norm, offsetLine, perp, type Pt, slice, spline, sub } from './kit';
import { at, type Strip } from './side';
import type { Fill, Paint } from './types';

/** A band of colour along part of an outline, `w` wide, on its inner side (`side` 1) or outer (-1). */
export function edgeBand(outline: Pt[], from: number, to: number, w: number | ((t: number) => number), paint: Paint, side: 1 | -1 = 1, o = 1): Fill {
  const seg = slice(outline, from, to);
  // Which side is inside depends on the outline's direction: let the caller flip it with `side`.
  const inner = offsetLine(seg, typeof w === 'number' ? -w * side : (t) => -w(t) * side);
  return { poly: [...seg, ...inner.reverse()], paint, o };
}

/** Index range of an outline between the points nearest to a and b, as length fractions. */
export function between(outline: Pt[], a: Pt, b: Pt): [number, number] {
  const near = (p: Pt) => outline.reduce((bi, q, i) => (dist(q, p) < dist(outline[bi], p) ? i : bi), 0);
  let total = 0;
  const cum = [0];
  for (let i = 1; i < outline.length; i++) {
    total += dist(outline[i - 1], outline[i]);
    cum.push(total);
  }
  const ia = near(a);
  const ib = near(b);
  return [cum[Math.min(ia, ib)] / total, cum[Math.max(ia, ib)] / total];
}

/** Spots scattered over part of the body (Poisson-ish: each keeps clear of the others). */
export function scatter(
  s: Strip,
  o: { t0: number; t1: number; f0: number | ((t: number) => number); f1: number | ((t: number) => number); r: number | ((t: number, f: number) => number); gap: number; paint: Paint; rand: () => number; wobble?: number; stretch?: number; o?: number; tries?: number },
): Fill[] {
  const placed: { c: Pt; r: number }[] = [];
  const out: Fill[] = [];
  const tries = o.tries ?? 1400;
  for (let k = 0; k < tries; k++) {
    const t = o.t0 + (o.t1 - o.t0) * o.rand();
    const f0 = typeof o.f0 === 'number' ? o.f0 : o.f0(t);
    const f1 = typeof o.f1 === 'number' ? o.f1 : o.f1(t);
    const f = f0 + (f1 - f0) * o.rand();
    const r = typeof o.r === 'number' ? o.r : o.r(t, f);
    if (r <= 0.05) continue;
    const c = at(s, t, f);
    if (placed.some((p) => dist(p.c, c) < p.r + r + o.gap)) continue;
    placed.push({ c, r });
    out.push({ poly: blob(c, r, o.wobble ?? 0.18, o.rand, 8, o.stretch ?? 1), paint: o.paint, o: o.o, clip: 'trunk' });
  }
  return out;
}

/** Spots scattered inside any polygon (fins, tails). */
export function scatterIn(poly: Pt[], o: { r: number; gap: number; paint: Paint; rand: () => number; o?: number; tries?: number; wobble?: number }): Fill[] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const placed: Pt[] = [];
  const out: Fill[] = [];
  const inside = (p: Pt) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  for (let k = 0; k < (o.tries ?? 300); k++) {
    const c: Pt = [x0 + (x1 - x0) * o.rand(), y0 + (y1 - y0) * o.rand()];
    if (!inside(c) || placed.some((p) => dist(p, c) < 2 * o.r + o.gap)) continue;
    placed.push(c);
    out.push({ poly: blob(c, o.r * (0.8 + 0.4 * o.rand()), o.wobble ?? 0.2, o.rand, 8), paint: o.paint, o: o.o });
  }
  return out;
}

/** A vertical bar across the body at t, from f0 to f1, with a wavy edge. */
export function bar(s: Strip, t: number, width: number, f0: number, f1: number, paint: Paint, rand: () => number, o = 1, lean = 0): Fill {
  const n = 7;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const f = f0 + ((f1 - f0) * i) / n;
    const taper = Math.sin((Math.PI * i) / n) * 0.5 + 0.5;
    const w = width * (0.55 + 0.45 * taper) * (0.85 + 0.3 * rand());
    const tc = t + lean * (f - f0);
    left.push(at(s, tc - w / 2, f));
    right.push(at(s, tc + w / 2, f));
  }
  return { poly: spline([...left, ...right.reverse()], true), paint, o, clip: 'trunk' };
}

/** A soft-edged patch: several overlapping blobs of falling opacity. */
export function patch(c: Pt, r: number, paint: Paint, rand: () => number, o = 1, stretch = 1, rot = 0): Fill[] {
  return [0, 1, 2].map((i) => ({ poly: blob(c, r * (1 - i * 0.22), 0.22, rand, 9, stretch, rot), paint, o: o * (0.35 + i * 0.3) }));
}

/** Points along a curve through body coordinates. */
export const curveIn = (s: Strip, pts: [number, number][]): Pt[] => spline(pts.map(([t, f]) => at(s, t, f)), false);

/** A closed shape through body coordinates. */
export const shapeIn = (s: Strip, pts: [number, number][]): Pt[] => spline(pts.map(([t, f]) => at(s, t, f)), true);

export { add, clamp, ellipse, lerp, mul, norm, perp, sub };
