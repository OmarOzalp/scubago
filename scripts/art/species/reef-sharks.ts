/**
 * Pieces shared by the reef sharks (grey reef, blacktip reef, whitetip reef) and the sand tiger: fin
 * outlines, an eyeball with an iris, and fin lofts whose colour marks have crisp edges. The kit's `fin`
 * spaces its sections evenly, so a black tip or a white cap would smear across a whole section; here
 * the sections are placed in close pairs either side of every mark's edge (and along a trailing-edge
 * margin), so the colour changes within a sliver of fin instead.
 */
import { Vector3 } from 'three';
import { blendSkins, curve, MeshBuilder, mix, smoothstep, TAU, type RGB, type Skin } from './kit';
import type { SharkContext } from './shark';

/** Half-width of a crisp colour edge: in span fraction on midline and paired fins, in height on the caudal fin, in chord fraction along a margin. */
export const HALF = .01, HALF_Y = .002, HALF_U = .012;

/** 0 before `edge` and 1 after it, over the narrow gap the lofts leave around each edge. */
export const crisp = (edge: number, x: number, half = HALF) => smoothstep(edge - half, edge + half, x);

/**
 * A fin outline from `at(t)`, the leading and trailing edge positions at t = height / full height
 * (the two meet at t = 1), sampled densely toward the tip so its rounding survives.
 */
export function outline(height: number, at: (t: number) => readonly [number, number], sink = .012) {
  const ts = [0, .05, .12, .2, .3, .4, .5, .6, .7, .8, .88, .93, .96, .98, 1];
  const le = ts.map((t) => [t * height, at(t)[0]] as const), te = ts.map((t) => [t * height, at(t)[1]] as const);
  // Below the skin the edges simply continue their slope.
  const below = (pts: typeof le) => (sink ? [[-sink, pts[0][1] - (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]) * sink] as const] : []);
  return { le: [...below(le), ...le], te: [...below(te), ...te] };
}

/** Symmetric NACA-style half thickness at chord fraction u (as the kit's fin lofts it). */
const airfoil = (u: number) => 5 * (.2969 * Math.sqrt(u) - .126 * u - .3516 * u * u + .2843 * u ** 3 - .1036 * u ** 4);

/** What a fin's colour function learns about its section: the chord, and how far inside the trailing-edge margin (0 to 1) the point lies. */
export type FinInfo = { chord: number; rear: number };

type Loft = {
  /** Span positions of the sections from the root; the tip (v = 1) closes to a point, and so does the root when `rootPoint` is set. */
  vs: readonly number[];
  le: (v: number) => Vector3; te: (v: number) => Vector3;
  thickness: (v: number) => number;
  side: Vector3;
  color: (p: Vector3, v: number, u: number, face: number, info: FinInfo) => RGB;
  skin: (p: Vector3, v: number, u: number) => Skin;
  /** Width of a margin along the trailing edge with a crisp inner edge, as a length. */
  rear?: number;
  rootPoint?: boolean;
  chordPoints?: number;
};

/** The kit's airfoil loft with explicit sections, and a pair of chord points either side of a trailing-edge margin's edge. */
function loft(mesh: MeshBuilder, spec: Loft) {
  const k = spec.chordPoints ?? 5;
  const mid = (v: number) => spec.le(v).add(spec.te(v)).multiplyScalar(.5);
  mesh.begin();
  const rings: number[][] = [];
  for (const v of spec.vs) {
    const le = spec.le(v), te = spec.te(v);
    const chord = te.clone().sub(le), length = chord.length();
    const span = mid(Math.min(1, v + .02)).sub(mid(Math.max(0, v - .02)));
    const normal = span.clone().cross(chord).normalize();
    if (normal.lengthSq() < .5) normal.copy(spec.side).normalize();
    if (normal.dot(spec.side) < 0) normal.negate();
    const thickness = spec.thickness(v);
    const edge = spec.rear ? Math.min(.985, Math.max(.2, 1 - spec.rear / Math.max(length, 1e-6))) : 1;
    const us = Array.from({ length: k }, (_, i) => (1 - Math.cos(Math.PI * i / (k - 1))) / 2);
    if (spec.rear) us.push(Math.max(.02, edge - HALF_U), Math.min(.995, edge + HALF_U));
    us.sort((a, b) => a - b);
    const ring: number[] = [];
    const add = (u: number, sign: number) => {
      const p = le.clone().addScaledVector(chord, u).addScaledVector(normal, sign * airfoil(u) * thickness);
      const info = { chord: length, rear: spec.rear ? smoothstep(edge - HALF_U, edge + HALF_U, u) : 0 };
      ring.push(mesh.vertex(p, spec.color(p, v, u, sign, info), spec.skin(p, v, u)));
    };
    us.forEach((u) => add(u, 1));
    us.slice(1, -1).reverse().forEach((u) => add(u, -1));
    rings.push(ring);
  }
  const m = rings[0].length;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < m; i++) mesh.quad(rings[r][i], rings[r][(i + 1) % m], rings[r + 1][(i + 1) % m], rings[r + 1][i]);
  }
  const rootCenter = spec.rootPoint ? mid(0) : rings[0].reduce((acc, i) => acc.add(mesh.point(i)), new Vector3()).multiplyScalar(1 / m);
  const root = mesh.vertex(rootCenter, spec.color(rootCenter, 0, .5, 1, { chord: 0, rear: 0 }), spec.skin(rootCenter, 0, .5));
  const tipPoint = mid(1);
  const tip = mesh.vertex(tipPoint, spec.color(tipPoint, 1, .5, 1, { chord: 0, rear: 1 }), spec.skin(tipPoint, 1, .5));
  const last = rings[rings.length - 1];
  for (let i = 0; i < m; i++) {
    mesh.tri(root, rings[0][(i + 1) % m], rings[0][i]);
    mesh.tri(tip, last[i], last[(i + 1) % m]);
  }
  mesh.end();
}

/**
 * Section positions: `count` evenly graded ones (packed toward the tip, as the kit's fin does), minus any
 * that crowd an edge, plus a pair either side of every edge.
 */
function sections(count: number, edges: readonly number[], half: number, spacing = (t: number) => 1 - (1 - t) ** 1.35) {
  const base = Array.from({ length: count }, (_, i) => spacing(i / count));
  const kept = base.filter((v, i) => i === 0 || edges.every((e) => Math.abs(v - e) > 3 * half));
  return [...kept, ...edges.flatMap((e) => [e - half, e + half])].sort((a, b) => a - b);
}

type Colour<A> = (p: Vector3, a: A, u: number, face: number, info: FinInfo) => RGB;

/**
 * The context's fins with crisp mark edges. `edges` lists where a colour changes: as a fraction of
 * a midline fin's visible height or a paired fin's visible span, and as an absolute height on the
 * caudal fin. The colour functions receive that same coordinate, so `crisp(edge, a)` finds the mark.
 */
export function markedFins(ctx: SharkContext) {
  const { mesh, skin, sOf, z, surface, normal, yTop, yBottom, center } = ctx;
  const toV = (e: number, size: number, sink: number) => (e * size + sink) / (size + sink);

  function midline(options: {
    le: readonly (readonly [number, number])[]; te: readonly (readonly [number, number])[]; height: number; thickness: number;
    ventral?: boolean; bone?: string; stations?: number; sink?: number; edges?: readonly number[]; rear?: number;
    color: Colour<number>;
  }) {
    const le = curve(options.le), te = curve(options.te);
    const sink = options.sink ?? .012, sign = options.ventral ? -1 : 1;
    const at = (s: number, h: number) => new Vector3(0, (options.ventral ? yBottom(s) : yTop(s)) + sign * h, z(s));
    const height = (v: number) => -sink + v * (options.height + sink);
    const vEdges = (options.edges ?? []).map((e) => toV(e, options.height, sink));
    loft(mesh, {
      vs: sections(options.stations ?? 7, vEdges, HALF),
      le: (v) => at(le(height(v)), height(v)),
      te: (v) => at(te(height(v)), height(v)),
      thickness: (v) => options.thickness * (1 - .75 * v),
      side: new Vector3(1, 0, 0), rear: options.rear,
      color: (p, v, u, face, info) => options.color(p, Math.max(0, height(v) / options.height), u, face, info),
      skin: (p, v) => {
        const base = skin(sOf(p.z));
        return options.bone ? blendSkins(base, { [options.bone]: 1 }, smoothstep(.12, .55, v)) : base;
      },
    });
    const baseS = (le(0) + te(0)) / 2;
    return { base: at(baseS, 0), baseS };
  }

  function paired(options: {
    rootS: number; theta: number; le: readonly (readonly [number, number])[]; te: readonly (readonly [number, number])[];
    span: number; droop: number; thickness: number; stations?: number; sweep?: number; sink?: number;
    bone?: (left: boolean) => string; edges?: readonly number[]; rear?: number;
    color: (p: Vector3, a: number, u: number, left: boolean, face: number, info: FinInfo) => RGB;
  }) {
    const le = curve(options.le), te = curve(options.te);
    const sink = options.sink ?? .015;
    const vEdges = (options.edges ?? []).map((e) => toV(e, options.span, sink));
    const vs = sections(options.stations ?? 7, vEdges, HALF);
    const roots: Vector3[] = [];
    for (const left of [true, false]) {
      const side = left ? 1 : -1;
      const theta = side * options.theta;
      const origin = surface(options.rootS, theta, 0).addScaledVector(normal(options.rootS, theta), -sink);
      const out = new Vector3(side * Math.cos(options.droop), -Math.sin(options.droop), 0).normalize();
      const back = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), -side * (options.sweep ?? 0));
      const at = (b: number) => origin.clone().addScaledVector(out, b);
      const span = (v: number) => v * (options.span + sink);
      loft(mesh, {
        vs,
        le: (v) => at(span(v)).addScaledVector(back, le(span(v))),
        te: (v) => at(span(v)).addScaledVector(back, te(span(v))),
        thickness: (v) => options.thickness * (1 - .78 * v),
        side: new Vector3(Math.sin(options.droop) * side, Math.cos(options.droop), 0), rear: options.rear,
        color: (p, v, u, face, info) => options.color(p, Math.max(0, span(v) - sink) / options.span, u, left, face, info),
        skin: (p, v) => {
          const base = skin(sOf(p.z));
          return options.bone ? blendSkins(base, { [options.bone(left)]: 1 }, smoothstep(.1, .5, v)) : base;
        },
      });
      roots.push(origin.clone().addScaledVector(back, (le(0) + te(0)) / 2).addScaledVector(out, sink));
    }
    return roots;
  }

  function caudal(options: {
    le: readonly (readonly [number, number])[]; te: readonly (readonly [number, number])[]; low: number; high: number;
    thickness: (y: number) => number; upperPivot: number; lowerPivot: number; stations?: number;
    edges?: readonly number[]; rear?: number; color: Colour<number>;
  }) {
    const le = curve(options.le), te = curve(options.te);
    const range = options.high - options.low;
    const y = (v: number) => options.low + v * range;
    const axis = center(ctx.design.rig.joints[4]);
    const vEdges = (options.edges ?? []).map((e) => (e - options.low) / range);
    const cosine = (t: number) => .5 - .5 * Math.cos(Math.PI * t);
    const count = options.stations ?? 16;
    const base = Array.from({ length: count }, (_, i) => cosine((i + 1) / (count + 1)));
    const half = HALF_Y / range;
    const vs = [...base.filter((v) => vEdges.every((e) => Math.abs(v - e) > 3 * half)), ...vEdges.flatMap((e) => [e - half, e + half])].sort((a, b) => a - b);
    loft(mesh, {
      vs, rootPoint: true,
      le: (v) => new Vector3(0, y(v), z(le(y(v)))),
      te: (v) => new Vector3(0, y(v), z(te(y(v)))),
      thickness: (v) => options.thickness(y(v)),
      side: new Vector3(1, 0, 0), rear: options.rear,
      color: (p, _v, u, face, info) => options.color(p, p.y, u, face, info),
      skin: (p) => {
        let weights = skin(sOf(p.z));
        weights = blendSkins(weights, { TailUpper: 1 }, smoothstep(options.upperPivot - .02, options.upperPivot + .07, p.y));
        return blendSkins(weights, { TailLower: 1 }, smoothstep(-(options.lowerPivot - .015), -(options.lowerPivot + .05), p.y));
      },
    });
    const pivot = (height: number) => new Vector3(0, height, z((le(height) + te(height)) / 2));
    return { upper: pivot(axis + options.upperPivot), lower: pivot(axis - options.lowerPivot) };
  }

  return { midline, paired, caudal };
}

/** A small dome eye set into the skin: a black pupil in an iris ringed by a paler lid; `squash` < 1 makes it a horizontal oval. */
export function eyeball(
  ctx: SharkContext, s: number, theta: number, radius: number,
  colors: { pupil: RGB; iris: RGB; lid: RGB }, options: { squash?: number; height?: number } = {},
) {
  const { mesh } = ctx;
  const squash = options.squash ?? 1, height = options.height ?? .6;
  const n = ctx.normal(s, theta), center = ctx.surface(s, theta, -.25 * radius);
  const t1 = (Math.abs(n.y) < .9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).cross(n).normalize(), t2 = n.clone().cross(t1);
  const weights = ctx.skin(s), segments = 12, rings = [.34, .7, 1];
  const shades: RGB[] = [colors.pupil, mix(colors.pupil, colors.iris, .5), mix(colors.iris, colors.lid, .75)];
  mesh.begin();
  const top = mesh.vertex(center.clone().addScaledVector(n, radius * height), colors.pupil, weights);
  const rows = rings.map((r, k) => Array.from({ length: segments }, (_, i) => {
    const a = TAU * i / segments;
    const lift = radius * (height * Math.sqrt(Math.max(0, 1 - r * r)) + .02);
    const p = center.clone().addScaledVector(n, lift).addScaledVector(t1, Math.cos(a) * r * radius).addScaledVector(t2, Math.sin(a) * r * radius * squash);
    return mesh.vertex(p, shades[k], weights);
  }));
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    mesh.tri(top, rows[0][i], rows[0][j]);
    for (let k = 0; k < rows.length - 1; k++) mesh.quad(rows[k][i], rows[k + 1][i], rows[k + 1][j], rows[k][j]);
  }
  // A shallow base so the shell is closed inside the skin.
  const base = mesh.vertex(center.clone().addScaledVector(n, -radius * .4), colors.pupil, weights);
  for (let i = 0; i < segments; i++) mesh.tri(base, rows[rows.length - 1][(i + 1) % segments], rows[rows.length - 1][i]);
  mesh.end();
}

/** The precaudal pits: a pair of shallow notches above and below the base of the tail. */
export function precaudalPits(ctx: SharkContext, back: RGB, belly: RGB, at = .768) {
  for (const [theta, color] of [[0, back], [Math.PI, belly]] as const) {
    ctx.ribbon(Array.from({ length: 7 }, (_, i) => {
      const t = i / 6, a = (t - .5) * .9;
      return [at + .006 * (2 * t - 1) ** 2, theta === 0 ? a : Math.PI + a] as const;
    }), (t) => .0016 * Math.sin(Math.PI * (.1 + .8 * t)) ** .6, color, .0008);
  }
}

/** Slanting nostrils on the snout ahead of the mouth, and labial furrows running back from the mouth's corners. */
export function nostrilsAndFurrows(ctx: SharkContext, options: { nostril: number; corner: number; spread: number; color: RGB }) {
  for (const side of [1, -1]) {
    ctx.ribbon(Array.from({ length: 5 }, (_, i) => [options.nostril + .014 * i / 4, side * (Math.PI - .5 - .2 * i / 4)] as const),
      (t) => .0019 * Math.sin(Math.PI * (.12 + .76 * t)) ** .6, options.color, .001);
    const a = Math.PI - options.spread;
    ctx.ribbon([[options.corner, side * a], [options.corner + .009, side * (a - .07)], [options.corner + .018, side * (a - .16)]],
      (t) => .0011 * Math.sin(Math.PI * (.1 + .8 * t)) ** .5, options.color, .001);
  }
}
