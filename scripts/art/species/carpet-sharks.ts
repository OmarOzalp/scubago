/**
 * Pieces shared by the carpet sharks (nurse shark, zebra shark, tasselled wobbegong): rounded fin
 * outlines, barbels, branching skin flaps (a wobbegong's tassels), small slit decals and a cellular
 * (Worley) pattern for painting reticulated or spotted skin.
 */
import { Vector3 } from 'three';
import { mix, TAU, type RGB } from './kit';
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
  color: RGB, tipColor: RGB, options: { spread?: number; branches?: number; curl?: number; lift?: number } = {},
) {
  const part = placed(ctx, s, theta, .004);
  const spread = options.spread ?? .55, branches = options.branches ?? 2, curl = options.curl ?? 0;
  const dir = part.n.clone().multiplyScalar(options.lift ?? .35).add(lean.clone().normalize()).normalize();
  const up = new Vector3(0, 1, 0);
  const stemLength = length * .5;
  const fork = spike(part, part.base, dir, stemLength, width, curl * .4, color, mix(color, tipColor, .3), .45, 3);
  for (let i = 0; i < branches; i++) {
    const side = branches === 2 ? (i === 0 ? -1 : 1) : i - 1;
    const bd = dir.clone().applyAxisAngle(up, side * spread).addScaledVector(part.n, .12).normalize();
    const bl = length * (side === 0 ? .62 : .5 + .12 * (i & 1));
    // Branches start a little before the stem's end, so the join is solid.
    const start = part.base.clone().lerp(fork, .86);
    spike(part, start, bd, bl, width * .7, curl, mix(color, tipColor, .3), tipColor, .45, 2);
  }
}

/** A small flat oval slit or spot lying on the skin (a spiracle, a nostril): `rs` long in s, `rt` across in theta. */
export function slit(ctx: SharkContext, s: number, theta: number, rs: number, rt: number, color: RGB, lift = .001) {
  ctx.ribbon(Array.from({ length: 5 }, (_, i) => [s + rs * (i / 4 - .5), theta] as const), (t) => rt * Math.sin(Math.PI * (.08 + .84 * t)) ** .7, color, lift);
}


/** A flat many-sided dot lying on the skin at `[s, theta]`, `r` across in world units (`sides` triangles: cheaper than the shark kit's spot). */
export function dot(ctx: SharkContext, s: number, theta: number, r: number, color: RGB, sides = 5, squash = 1, lift = .0009) {
  const { mesh, raw, surface, normal, skin } = ctx;
  mesh.begin();
  const gs = raw(s + .002, theta).sub(raw(s - .002, theta)).length() / .004;
  const gt = raw(s, theta + .01).sub(raw(s, theta - .01)).length() / .02;
  const c = mesh.vertex(surface(s, theta, lift * 1.4), color, skin(s), normal(s, theta));
  const ring = Array.from({ length: sides }, (_, i) => {
    const a = TAU * i / sides + .4;
    const ps = s + Math.cos(a) * r * squash / gs, pt = theta + Math.sin(a) * r / gt;
    return mesh.vertex(surface(ps, pt, lift), color, skin(ps), normal(ps, pt));
  });
  for (let i = 0; i < sides; i++) mesh.tri(c, ring[i], ring[(i + 1) % sides]);
  mesh.end({ closed: false, normals: false, outward: (i) => new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]) });
}
