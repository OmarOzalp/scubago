/**
 * Geometry for the engraved species plates. Everything is built as dense polylines (smooth curves
 * sampled finely), which keeps clipping, offsetting and joining simple; paths are only written out
 * at the end, simplified.
 */

export type Pt = [number, number];
/** A control point; a third element of 1 makes it a corner (the curve doesn't round it off). */
export type Ctrl = [number, number] | [number, number, 1];

export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const norm = (a: Pt): Pt => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};
/** The left-hand normal of a direction (x right, y down: it points "up" for a direction going right). */
export const perp = (a: Pt): Pt => [a[1], -a[0]];
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const mixNum = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function bezier(p0: Pt, c1: Pt, c2: Pt, p1: Pt, steps: number, out: Pt[]) {
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
      u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
    ]);
  }
}

/**
 * A smooth curve through the points (Catmull–Rom, drawn as Béziers), sampled into a polyline.
 * Corner points keep their sharpness; `tension` below 1 makes the curve hug its points tighter.
 */
export function spline(ctrl: Ctrl[], closed = false, tension = 1, steps = 14, ends: { start?: Pt; end?: Pt } = {}): Pt[] {
  const n = ctrl.length;
  if (n < 2) return ctrl.map((c) => [c[0], c[1]] as Pt);
  const P = ctrl.map((c) => [c[0], c[1]] as Pt);
  const corner = ctrl.map((c) => c.length === 3);
  const at = (i: number): Pt => (closed ? P[(i + n) % n] : P[clamp(i, 0, n - 1)]);
  const sharp = (i: number) => (!closed && (i <= 0 || i >= n - 1)) || corner[(i + n) % n];
  // Direction of the curve through a smooth point: along the line joining its neighbours. Handle
  // lengths follow each side's own chord, which keeps uneven spacing from looping or overshooting.
  const dir = (i: number): Pt => norm(sub(at(i + 1), at(i - 1)));
  const out: Pt[] = [P[0]];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i);
    const p1 = at(i + 1);
    const len = dist(p0, p1);
    let c1 = sharp(i) ? lerp(p0, p1, 1 / 3) : add(p0, mul(dir(i), (tension * len) / 3));
    let c2 = sharp(i + 1) ? lerp(p1, p0, 1 / 3) : sub(p1, mul(dir(i + 1), (tension * len) / 3));
    // Open curves can be told which way to leave their first point and arrive at their last.
    if (!closed && i === 0 && ends.start) c1 = add(p0, mul(norm(ends.start), len / 3));
    if (!closed && i === segs - 1 && ends.end) c2 = sub(p1, mul(norm(ends.end), len / 3));
    bezier(p0, c1, c2, p1, Math.max(3, Math.min(steps * 2, Math.round(len / 1.2) + 2)), out);
  }
  if (closed) out.pop();
  return out;
}

export function polyLength(poly: Pt[]) {
  let l = 0;
  for (let i = 1; i < poly.length; i++) l += dist(poly[i - 1], poly[i]);
  return l;
}

/** The point at fraction t of the way along a polyline (by length). */
export function along(poly: Pt[], t: number): Pt {
  const total = polyLength(poly);
  let target = clamp(t, 0, 1) * total;
  for (let i = 1; i < poly.length; i++) {
    const d = dist(poly[i - 1], poly[i]);
    if (target <= d || i === poly.length - 1) return lerp(poly[i - 1], poly[i], d ? clamp(target / d, 0, 1) : 0);
    target -= d;
  }
  return poly[poly.length - 1];
}

/** n points evenly spaced along a polyline. */
export function resample(poly: Pt[], n: number): Pt[] {
  const total = polyLength(poly);
  const out: Pt[] = [];
  let i = 1;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    while (i < poly.length - 1 && acc + dist(poly[i - 1], poly[i]) < target) {
      acc += dist(poly[i - 1], poly[i]);
      i++;
    }
    const d = dist(poly[i - 1], poly[i]);
    out.push(lerp(poly[i - 1], poly[i], d ? clamp((target - acc) / d, 0, 1) : 0));
  }
  return out;
}

/** The part of a polyline between fractions t0 and t1 of its length. */
export function slice(poly: Pt[], t0: number, t1: number): Pt[] {
  const total = polyLength(poly);
  const a = t0 * total;
  const b = t1 * total;
  const out: Pt[] = [];
  let acc = 0;
  for (let i = 1; i < poly.length; i++) {
    const d = dist(poly[i - 1], poly[i]);
    const s0 = acc;
    const s1 = acc + d;
    if (s1 >= a && s0 <= b) {
      if (!out.length) out.push(lerp(poly[i - 1], poly[i], d ? clamp((a - s0) / d, 0, 1) : 0));
      if (s1 <= b) out.push(poly[i]);
      else {
        out.push(lerp(poly[i - 1], poly[i], d ? clamp((b - s0) / d, 0, 1) : 0));
        break;
      }
    }
    acc = s1;
  }
  return out;
}

/** Ramer–Douglas–Peucker: drop points that sit within eps of the line through their neighbours. */
export function simplify(poly: Pt[], eps = 0.12): Pt[] {
  if (poly.length < 3) return poly;
  const keep = new Uint8Array(poly.length);
  keep[0] = 1;
  keep[poly.length - 1] = 1;
  const stack: [number, number][] = [[0, poly.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const a = poly[s];
    const b = poly[e];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let wd = eps;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((poly[i][0] - a[0]) * dy - (poly[i][1] - a[1]) * dx) / l;
      if (d > wd) {
        wd = d;
        worst = i;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([s, worst], [worst, e]);
    }
  }
  return poly.filter((_, i) => keep[i]);
}

const f1 = (n: number) => String(Math.round(n * 10) / 10);

/** SVG path data for a polyline (simplified first). */
export function pathOf(poly: Pt[], closed = false, eps = 0.12): string {
  let p: Pt[];
  if (closed && poly.length > 3) {
    // A closed outline starts and ends in the same place, which would fool the simplifier:
    // simplify the two halves either side of its furthest point instead.
    let far = 0;
    poly.forEach((q, i) => {
      if (dist(q, poly[0]) > dist(poly[far], poly[0])) far = i;
    });
    p = [...simplify(poly.slice(0, far + 1), eps), ...simplify([...poly.slice(far), poly[0]], eps).slice(1, -1)];
  } else p = simplify(poly, eps);
  if (!p.length) return '';
  let d = `M${f1(p[0][0])},${f1(p[0][1])}`;
  for (let i = 1; i < p.length; i++) d += `L${f1(p[i][0])},${f1(p[i][1])}`;
  return closed ? `${d}Z` : d;
}

export function bbox(polys: Pt[][]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const poly of polys)
    for (const [x, y] of poly) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** Even–odd point-in-polygon test. */
export function inside(p: Pt, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/** Where a straight segment a→b crosses a polygon's edges, as fractions along the segment. */
function crossings(a: Pt, b: Pt, poly: Pt[]): number[] {
  const ts: number[] = [];
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[j];
    const q = poly[i];
    const sx = q[0] - p[0];
    const sy = q[1] - p[1];
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((p[0] - a[0]) * sy - (p[1] - a[1]) * sx) / den;
    const u = ((p[0] - a[0]) * ry - (p[1] - a[1]) * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u < 1) ts.push(t);
  }
  return ts.sort((x, y) => x - y);
}

/**
 * The pieces of a polyline that lie inside a polygon (or outside it, with `keepOutside`), cut
 * exactly where it crosses the polygon's edges.
 */
export function clipLine(line: Pt[], poly: Pt[], keepOutside = false): Pt[][] {
  const pieces: Pt[][] = [];
  let cur: Pt[] = [];
  const keep = (p: Pt) => inside(p, poly) !== keepOutside;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const ts = [0, ...crossings(a, b, poly), 1];
    for (let k = 1; k < ts.length; k++) {
      const p0 = lerp(a, b, ts[k - 1]);
      const p1 = lerp(a, b, ts[k]);
      if (keep(lerp(a, b, (ts[k - 1] + ts[k]) / 2))) {
        if (!cur.length) cur.push(p0);
        cur.push(p1);
      } else if (cur.length) {
        pieces.push(cur);
        cur = [];
      }
    }
  }
  if (cur.length) pieces.push(cur);
  return pieces.filter((p) => p.length > 1 && polyLength(p) > 0.6);
}

/** Parallel hatching lines at an angle (degrees) across a polygon, `gap` apart, clipped to it. */
export function hatch(poly: Pt[], angle: number, gap: number, exclude?: Pt[]): Pt[][] {
  const b = bbox([poly]);
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const r = Math.hypot(b.w, b.h) / 2 + 1;
  const dir: Pt = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)];
  const nrm = perp(dir);
  const out: Pt[][] = [];
  for (let o = -r; o <= r; o += gap) {
    const c: Pt = [cx + nrm[0] * o, cy + nrm[1] * o];
    const line: Pt[] = [add(c, mul(dir, -r)), add(c, mul(dir, r))];
    for (const piece of clipLine(line, poly)) {
      if (exclude) out.push(...clipLine(piece, exclude, true));
      else out.push(piece);
    }
  }
  return out;
}

/** y of an x-monotonic polyline at x (clamped to its ends). */
export function yAt(edge: Pt[], x: number): number {
  if (x <= edge[0][0]) return edge[0][1];
  for (let i = 1; i < edge.length; i++) {
    if (edge[i][0] >= x) {
      const a = edge[i - 1];
      const b = edge[i];
      return b[0] === a[0] ? b[1] : a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
    }
  }
  return edge[edge.length - 1][1];
}

/** A circle (or ellipse, rotated by `rot` degrees) as a polygon. */
export function ellipse(c: Pt, rx: number, ry = rx, rot = 0, n = 0): Pt[] {
  const k = n || Math.max(10, Math.min(48, Math.round(Math.max(rx, ry) * 6)));
  const cr = Math.cos((rot * Math.PI) / 180);
  const sr = Math.sin((rot * Math.PI) / 180);
  return Array.from({ length: k }, (_, i) => {
    const a = (i / k) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    return [c[0] + x * cr - y * sr, c[1] + x * sr + y * cr] as Pt;
  });
}

/** A small seeded random generator, so drawings come out the same every time. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** A blob: a circle with a wobbly edge (for spots, patches and mottling). */
export function blob(c: Pt, r: number, wobble: number, rand: () => number, n = 9, stretch = 1, rot = 0): Pt[] {
  const pts: Ctrl[] = [];
  const cr = Math.cos((rot * Math.PI) / 180);
  const sr = Math.sin((rot * Math.PI) / 180);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + (rand() - 0.5) * 2 * wobble);
    const x = Math.cos(a) * rr * stretch;
    const y = Math.sin(a) * rr;
    pts.push([c[0] + x * cr - y * sr, c[1] + x * sr + y * cr]);
  }
  return spline(pts, true, 1, 6);
}

/** Moves every point of the given polylines with f (used to place a drawing in the plate box). */
export function mapPolys<T extends Pt[]>(polys: T[], f: (p: Pt) => Pt): T[] {
  return polys.map((poly) => poly.map(f) as T);
}

/** A polyline offset sideways by d (positive: to the left of its direction of travel). */
export function offsetLine(line: Pt[], d: number | ((t: number) => number)): Pt[] {
  const n = line.length;
  return line.map((p, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(n - 1, i + 1)];
    const nr = perp(norm(sub(b, a)));
    const dd = typeof d === 'number' ? d : d(n === 1 ? 0 : i / (n - 1));
    return add(p, mul(nr, dd));
  });
}

/** The average of a polygon's points (good enough for the convex-ish shapes it's used on). */
export function centroidOf(poly: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}
