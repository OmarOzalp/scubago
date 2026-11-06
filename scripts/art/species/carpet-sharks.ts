/**
 * Pieces shared by the carpet sharks (nurse shark, zebra shark, tasselled wobbegong): rounded fin
 * outlines, barbels, branching skin flaps (a wobbegong's tassels), small slit decals and a cellular
 * (Worley) pattern for painting reticulated or spotted skin.
 */
import { Vector3 } from 'three';
import { blendSkins, curve, mix, noise, smoothstep, TAU, type RGB } from './kit';
import type { SharkContext } from './shark';

/**
 * A rounded fin outline for `outline()` (reef-sharks.ts): the leading and trailing edges at t = height /
 * full height, from a base `base` long centred on `centre` and leaning back by `lean` at the tip, with an
 * elliptical top (`power` sets how square its shoulders are) and an optional rear edge that sweeps back
 * further than the front (`tail`, for a free rear tip).
 */
export function roundFin(centre: number, lean: number, base: number, power = 2.4, tail = 0) {
  return (t: number): [number, number] => {
    const half = base / 2 * Math.sqrt(Math.max(0, 1 - t ** power));
    const c = centre + lean * t;
    return [c - half, c + half + tail * t ** 4 * (1 - t)];
  };
}

/** Cellular noise: distance to the nearest and second nearest feature point on a jittered grid, and the nearest cell's id (0..1). */
export function worley(x: number, y: number, seed = 0) {
  const hash = (a: number, b: number, k: number) => {
    const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7 + seed * 53.3) * 43758.5453;
    return v - Math.floor(v);
  };
  const ix = Math.floor(x), iy = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cy = iy + j;
      const dx = cx + .15 + .7 * hash(cx, cy, 0) - x, dy = cy + .15 + .7 * hash(cx, cy, 1) - y;
      const d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; id = hash(cx, cy, 2); } else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, edge: d2 - d1, id };
}

type Part = { ctx: SharkContext; base: Vector3; n: Vector3; weights: ReturnType<SharkContext['skin']> };
const placed = (ctx: SharkContext, s: number, theta: number, sink: number): Part => ({
  ctx, base: ctx.surface(s, theta, -sink), n: ctx.normal(s, theta), weights: ctx.skin(s),
});

/**
 * One flattened spike whose base is buried in the skin, from `from` along `dir`, `width` across its base, bent by
 * `curl` toward the surface normal. `sides` 4 gives a round-ish barbel with a waist (12 triangles); 3 a
 * flat blade with a waist (9); 2 a bare three-sided point (3). Returns the tip.
 */
function spike(part: Part, from: Vector3, dir: Vector3, length: number, width: number, curl: number, colorBase: RGB, colorTip: RGB, flat = .45, sides: 2 | 3 | 4 = 4) {
  const { ctx, n, weights } = part, { mesh } = ctx;
  const d = dir.clone().normalize();
  // Blades are broad in the horizontal plane (they lie out along the seabed like a fringe); barbels are round.
  const across = (sides === 4 ? d.clone().cross(n) : new Vector3(0, 1, 0).cross(d));
  if (across.lengthSq() < 1e-4) across.copy(d).cross(n);
  if (across.lengthSq() < 1e-6) across.set(1, 0, 0);
  across.normalize();
  const thick = d.clone().cross(across).normalize();
  const tip = from.clone().addScaledVector(d, length).addScaledVector(n, curl);
  const mid = from.clone().addScaledVector(d, length * .42).addScaledVector(n, curl * .35);
  mesh.begin();
  const ring = (at: Vector3, w: number, c: RGB) => (sides === 4
    ? [
      mesh.vertex(at.clone().addScaledVector(across, w / 2), c, weights),
      mesh.vertex(at.clone().addScaledVector(thick, w * flat / 2), c, weights),
      mesh.vertex(at.clone().addScaledVector(across, -w / 2), c, weights),
      mesh.vertex(at.clone().addScaledVector(thick, -w * flat / 2), c, weights),
    ]
    : [
      mesh.vertex(at.clone().addScaledVector(across, w / 2), c, weights),
      mesh.vertex(at.clone().addScaledVector(thick, w * flat), c, weights),
      mesh.vertex(at.clone().addScaledVector(across, -w / 2), c, weights),
    ]);
  const a = ring(from, width, colorBase);
  const t = mesh.vertex(tip, colorTip, weights);
  const m = a.length;
  if (sides === 2) {
    for (let i = 0; i < m; i++) mesh.tri(a[i], a[(i + 1) % m], t);
  } else {
    const b = ring(mid, width * .62, mix(colorBase, colorTip, .5));
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      mesh.quad(a[i], a[j], b[j], b[i]);
      mesh.tri(b[i], b[j], t);
    }
  }
  mesh.end({ closed: false, outward: (i) => mesh.point(i).sub(from.clone().addScaledVector(d, length * .3)) });
  return tip;
}

/** A tapered barbel (a spike, round in section) leaning off the surface at `[s, theta]`. */
export function barbel(ctx: SharkContext, s: number, theta: number, lean: Vector3, length: number, width: number, color: RGB, tipColor = color, curl = 0) {
  const part = placed(ctx, s, theta, .003);
  const dir = part.n.clone().multiplyScalar(.25).add(lean.clone().normalize()).normalize();
  return spike(part, part.base, dir, length, width, curl, color, tipColor, 1);
}

/**
 * A wobbegong's tassel: a short stem with two or three branches, all flattened, standing off the skin at
 * `[s, theta]` and leaning along `lean`. `spread` fans the branches (rad), `branches` is 2 or 3.
 */
export function tassel(
  ctx: SharkContext, s: number, theta: number, lean: Vector3, length: number, width: number,
  color: RGB, tipColor: RGB, options: { spread?: number; branches?: number; curl?: number; lift?: number; flat?: number } = {},
) {
  const part = placed(ctx, s, theta, .004);
  const spread = options.spread ?? .55, branches = options.branches ?? 2, curl = options.curl ?? 0;
  const dir = part.n.clone().multiplyScalar(options.lift ?? .35).add(lean.clone().normalize()).normalize();
  const up = new Vector3(0, 1, 0);
  const stemLength = length * .5;
  const fork = spike(part, part.base, dir, stemLength, width, curl * .4, color, mix(color, tipColor, .3), options.flat ?? .45, 3);
  for (let i = 0; i < branches; i++) {
    const side = branches === 2 ? (i === 0 ? -1 : 1) : i - 1;
    const bd = dir.clone().applyAxisAngle(up, side * spread).addScaledVector(part.n, .12).normalize();
    const bl = length * (side === 0 ? .62 : .5 + .12 * (i & 1));
    // Branches start a little before the stem's end, so the join is solid.
    const start = part.base.clone().lerp(fork, .86);
    spike(part, start, bd, bl, width * .7, curl, mix(color, tipColor, .3), tipColor, options.flat ?? .45, 2);
  }
}

/** A small flat oval slit or spot lying on the skin (a spiracle, a nostril): `rs` long in s, `rt` across in theta. */
export function slit(ctx: SharkContext, s: number, theta: number, rs: number, rt: number, color: RGB, lift = .001) {
  ctx.ribbon(Array.from({ length: 5 }, (_, i) => [s + rs * (i / 4 - .5), theta] as const), (t) => rt * Math.sin(Math.PI * (.08 + .84 * t)) ** .7, color, lift);
}


/** A flat many-sided dot lying on the skin at `[s, theta]`, `r` across in world units (`sides` triangles: cheaper than the shark kit's spot). */
export function dot(ctx: SharkContext, s: number, theta: number, r: number, color: RGB, sides = 5, squash = 1, lift = .0009, spin = .4) {
  const { mesh, raw, surface, normal, skin } = ctx;
  mesh.begin();
  const gs = raw(s + .002, theta).sub(raw(s - .002, theta)).length() / .004;
  const gt = raw(s, theta + .01).sub(raw(s, theta - .01)).length() / .02;
  const c = mesh.vertex(surface(s, theta, lift * 1.4), color, skin(s), normal(s, theta));
  const ring = Array.from({ length: sides }, (_, i) => {
    const a = TAU * i / sides + spin;
    const ps = s + Math.cos(a) * r * squash / gs, pt = theta + Math.sin(a) * r / gt;
    return mesh.vertex(surface(ps, pt, lift), color, skin(ps), normal(ps, pt));
  });
  for (let i = 0; i < sides; i++) mesh.tri(c, ring[i], ring[(i + 1) % sides]);
  mesh.end({ closed: false, normals: false, outward: (i) => new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]) });
}

/**
 * One thin, flat, curving strand of a wobbegong's beard: a ribbon `width` across (horizontal, so it lies out
 * like a blade of grass), narrowing to its tip in three segments (5 triangles), from `from` along `dir`, bent
 * toward `sag` (a world vector, so strands can droop) by `bend` of its length. Returns its points.
 */
function strand(part: Part, from: Vector3, dir: Vector3, length: number, width: number, sag: Vector3, bend: number, colorBase: RGB, colorTip: RGB) {
  const { mesh } = part.ctx, { weights } = part;
  const d = dir.clone().normalize();
  const across = new Vector3(0, 1, 0).cross(d);
  if (across.lengthSq() < 1e-4) across.set(1, 0, 0);
  across.normalize();
  const stops = [0, .34, .68, 1], widths = [1, .8, .5, 0];
  const points = stops.map((t) => from.clone().addScaledVector(d, length * t).addScaledVector(sag, length * bend * t * t));
  mesh.begin();
  const rows = points.map((p, i) => (i === stops.length - 1
    ? [mesh.vertex(p, colorTip, weights)]
    : [mesh.vertex(p.clone().addScaledVector(across, width * widths[i] / 2), mix(colorBase, colorTip, stops[i]), weights), mesh.vertex(p.clone().addScaledVector(across, -width * widths[i] / 2), mix(colorBase, colorTip, stops[i]), weights)]));
  for (let i = 0; i < rows.length - 2; i++) mesh.quad(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]);
  mesh.tri(rows[rows.length - 2][0], rows[rows.length - 2][1], rows[rows.length - 1][0]);
  mesh.end({ closed: false, outward: () => new Vector3(0, 1, 0) });
  return points;
}

/**
 * A lacy tuft of the wobbegong's beard at `[s, theta]`: a main strand with `branches` side strands springing from
 * it at 40% and 68% of its length, all drooping along `sag`. `lean` is where the tuft points; `spread` the side
 * strands' angle from it (rad). (5 triangles a strand.)
 */
export function frond(
  ctx: SharkContext, s: number, theta: number, lean: Vector3, length: number, width: number,
  color: RGB, tipColor: RGB, options: { branches?: number; spread?: number; sag?: number; droop?: number } = {},
) {
  const part = placed(ctx, s, theta, .004);
  const branches = options.branches ?? 3, spread = options.spread ?? .6, bend = options.sag ?? .5;
  const sag = new Vector3(0, -(options.droop ?? 1), 0);
  const dir = lean.clone().normalize();
  const up = new Vector3(0, 1, 0);
  const main = strand(part, part.base, dir, length, width, sag, bend, color, tipColor);
  const at = [.4, .68, .5, .8];
  for (let i = 0; i < branches; i++) {
    const side = i % 2 === 0 ? -1 : 1, t = at[i % at.length];
    const start = i < 2 ? main[1].clone().lerp(main[2], (t - .34) / .34) : main[1].clone().lerp(main[2], .5);
    const bd = dir.clone().applyAxisAngle(up, side * spread * (1 + .25 * (i >> 1)));
    strand(part, start, bd, length * (.55 - .12 * i + .1), width * .8, sag, bend, mix(color, tipColor, t), tipColor);
  }
}

/**
 * A flat, irregular polygon lying on the skin at `[s, theta]` (a tile of the wobbegong's pale mosaic): `sides` corners
 * whose radii and angles are jittered by `jitter` (0..1) from `seed`, `r` across in world units, `squash` stretching it along the body.
 */
export function tile(ctx: SharkContext, s: number, theta: number, r: number, color: RGB, sides = 6, squash = 1, lift = .0009, jitter = .35, seed = 0) {
  const { mesh, raw, surface, normal, skin } = ctx;
  mesh.begin();
  const gs = raw(s + .002, theta).sub(raw(s - .002, theta)).length() / .004;
  const gt = raw(s, theta + .01).sub(raw(s, theta - .01)).length() / .02;
  const c = mesh.vertex(surface(s, theta, lift * 1.4), color, skin(s), normal(s, theta));
  const spin = 6.28 * noise(seed * 3.1, 2);
  const ring = Array.from({ length: sides }, (_, i) => {
    const a = TAU * i / sides + spin + jitter * .6 * noise(seed * 5.3 + i * 1.7, 4);
    const rr = r * (1 + jitter * noise(seed * 7.9 + i * 2.3, 6));
    const ps = s + Math.cos(a) * rr * squash / gs, pt = theta + Math.sin(a) * rr / gt;
    return mesh.vertex(surface(ps, pt, lift), color, skin(ps), normal(ps, pt));
  });
  for (let i = 0; i < sides; i++) mesh.tri(c, ring[i], ring[(i + 1) % sides]);
  mesh.end({ closed: false, normals: false, outward: (i) => new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]) });
}

const airfoil = (u: number) => 5 * (.2969 * Math.sqrt(u) - .126 * u - .3516 * u * u + .2843 * u ** 3 - .1036 * u ** 4);

/** What a paired fin was made from (as `markedFins().paired` takes it): enough to find a point on its upper face again. */
export type FinPlan = {
  rootS: number; theta: number; span: number; droop: number; sweep?: number; sink?: number; thickness: number;
  le: readonly (readonly [number, number])[]; te: readonly (readonly [number, number])[]; bone?: (left: boolean) => string;
};

/** The upper face of a paired fin: a point at span fraction `a` and chord fraction `u`, its normal, its in-plane axes, its skin and its chord length. */
export function finSurface(ctx: SharkContext, plan: FinPlan, left: boolean) {
  const sink = plan.sink ?? .015, le = curve(plan.le), te = curve(plan.te), side = left ? 1 : -1, theta = side * plan.theta;
  const origin = ctx.surface(plan.rootS, theta, 0).addScaledVector(ctx.normal(plan.rootS, theta), -sink);
  const out = new Vector3(side * Math.cos(plan.droop), -Math.sin(plan.droop), 0).normalize();
  const back = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), -side * (plan.sweep ?? 0));
  const up = new Vector3(Math.sin(plan.droop) * side, Math.cos(plan.droop), 0).normalize();
  return {
    out, back, up,
    chord: (a: number) => { const b = a * plan.span + sink; return te(b) - le(b); },
    at(a: number, u: number, lift = 0) {
      const b = a * plan.span + sink, v = b / (plan.span + sink);
      const p = origin.clone().addScaledVector(out, b).addScaledVector(back, le(b) + u * (te(b) - le(b)));
      return p.addScaledVector(up, airfoil(u) * plan.thickness * (1 - .78 * v) + lift);
    },
    skin(p: Vector3, a: number) {
      const base = ctx.skin(ctx.sOf(p.z));
      const v = (a * plan.span + sink) / (plan.span + sink);
      return plan.bone ? blendSkins(base, { [plan.bone(left)]: 1 }, smoothstep(.1, .5, v)) : base;
    },
  };
}

/** A flat irregular polygon on a fin's upper face (a spot or a tile), `r` across in world units; skipped where it would hang over an edge. */
export function finTile(ctx: SharkContext, fin: ReturnType<typeof finSurface>, a: number, u: number, r: number, color: RGB, sides = 6, jitter = .3, seed = 0) {
  if (Math.min(u, 1 - u) * fin.chord(a) < r * 1.15 || a < .06 || a > .97) return;
  const { mesh } = ctx, c = fin.at(a, u, .0012), w = fin.skin(c, a), spin = 6.28 * noise(seed * 3.1, 2);
  mesh.begin();
  const centre = mesh.vertex(c, color, w, fin.up);
  const ring = Array.from({ length: sides }, (_, i) => {
    const ang = TAU * i / sides + spin + jitter * .6 * noise(seed * 5.3 + i * 1.7, 4);
    const rr = r * (1 + jitter * noise(seed * 7.9 + i * 2.3, 6));
    const p = c.clone().addScaledVector(fin.back, Math.cos(ang) * rr).addScaledVector(fin.out, Math.sin(ang) * rr);
    return mesh.vertex(p, color, w, fin.up);
  });
  for (let i = 0; i < sides; i++) mesh.tri(centre, ring[i], ring[(i + 1) % sides]);
  mesh.end({ closed: false, normals: false, outward: () => fin.up });
}

/** A flat polygon on the side of the tail fin at height `y` and chord fraction `u` (both faces, `face` +1 or -1), `r` across. */
export function tailTile(
  ctx: SharkContext, le: (y: number) => number, te: (y: number) => number, thickness: (y: number) => number,
  y: number, u: number, face: number, r: number, color: RGB, pivots: { axis: number; upper: number; lower: number }, sides = 6, seed = 0,
) {
  const s = le(y) + u * (te(y) - le(y)), p = new Vector3(face * (airfoil(u) * thickness(y) + .0012), y, ctx.z(s));
  const n = new Vector3(face, 0, 0), { mesh } = ctx;
  let w = ctx.skin(s);
  w = blendSkins(w, { TailUpper: 1 }, smoothstep(pivots.upper - .02, pivots.upper + .07, y));
  w = blendSkins(w, { TailLower: 1 }, smoothstep(-(pivots.lower - .015), -(pivots.lower + .05), y));
  mesh.begin();
  const centre = mesh.vertex(p, color, w, n), spin = 6.28 * noise(seed * 3.1, 2);
  const ring = Array.from({ length: sides }, (_, i) => {
    const ang = TAU * i / sides + spin, rr = r * (1 + .3 * noise(seed * 7.9 + i * 2.3, 6));
    return mesh.vertex(new Vector3(p.x, p.y + Math.sin(ang) * rr, p.z - Math.cos(ang) * rr), color, w, n);
  });
  for (let i = 0; i < sides; i++) mesh.tri(centre, ring[i], ring[(i + 1) % sides]);
  mesh.end({ closed: false, normals: false, outward: () => n });
}
