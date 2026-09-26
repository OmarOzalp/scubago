/**
 * Geometry toolkit for the procedural species models: smooth profile curves,
 * a mesh builder that tracks per-vertex colors and bone weights, airfoil fin
 * lofting and small embedded eyes. Everything is authored in model space
 * (nose +Z, Y up, +X on the animal's left).
 */
import { Color, Vector3 } from 'three';

export type RGB = [number, number, number];
export type Skin = Record<string, number>;
export const TAU = Math.PI * 2;

/** sRGB hex to the linear values stored in glTF vertex colors. */
export function hex(value: string): RGB {
  const color = new Color(value);
  return [color.r, color.g, color.b];
}
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
/** Cheap deterministic value noise in [-1, 1]; keeps markings irregular but reproducible. */
export function noise(x: number, seed = 0) {
  const hash = (n: number) => {
    const v = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const i = Math.floor(x), f = x - i;
  const t = f * f * (3 - 2 * f);
  return (hash(i) * (1 - t) + hash(i + 1) * t) * 2 - 1;
}

/** Monotone cubic interpolation (Fritsch–Carlson): smooth, and never overshoots the profile. */
export function curve(points: readonly (readonly [number, number])[]) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const n = xs.length;
  const d = xs.slice(0, -1).map((x, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - x));
  const m = xs.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const h = Math.hypot(a, b);
    if (h > 3) { m[i] = 3 * a / h * d[i]; m[i + 1] = 3 * b / h * d[i]; }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/** Centripetal Catmull-Rom through 3D points, parameterized 0..1 by arc length. */
export function path(points: readonly (readonly [number, number, number])[]) {
  const p = points.map((q) => new Vector3(q[0], q[1], q[2]));
  const ends = [p[0].clone().multiplyScalar(2).sub(p[1]), p[p.length - 1].clone().multiplyScalar(2).sub(p[p.length - 2])];
  const all = [ends[0], ...p, ends[1]];
  const segment = (i: number, t: number) => {
    const [p0, p1, p2, p3] = [all[i], all[i + 1], all[i + 2], all[i + 3]];
    const t2 = t * t, t3 = t2 * t;
    return new Vector3()
      .addScaledVector(p0, -t3 + 2 * t2 - t)
      .addScaledVector(p1, 3 * t3 - 5 * t2 + 2)
      .addScaledVector(p2, -3 * t3 + 4 * t2 + t)
      .addScaledVector(p3, t3 - t2)
      .multiplyScalar(.5);
  };
  // Arc-length table so stations spread evenly along the edge.
  const samples: { t: number; length: number; i: number; u: number }[] = [];
  let length = 0, previous = p[0];
  for (let i = 0; i < p.length - 1; i++) {
    for (let j = 0; j <= 16; j++) {
      if (i > 0 && j === 0) continue;
      const q = segment(i, j / 16);
      length += q.distanceTo(previous);
      previous = q;
      samples.push({ t: 0, length, i, u: j / 16 });
    }
  }
  samples.forEach((sample) => { sample.t = sample.length / length; });
  return (t: number) => {
    const target = clamp(t);
    let k = 1;
    while (k < samples.length - 1 && samples[k].t < target) k++;
    const a = samples[k - 1], b = samples[k];
    const f = (target - a.t) / Math.max(b.t - a.t, 1e-9);
    const u = a.i === b.i ? a.u + (b.u - a.u) * f : b.u * f;
    return segment(b.i, u);
  };
}

export function blendSkins(a: Skin, b: Skin, t: number): Skin {
  const out: Skin = {};
  for (const [bone, w] of Object.entries(a)) out[bone] = (out[bone] ?? 0) + w * (1 - t);
  for (const [bone, w] of Object.entries(b)) out[bone] = (out[bone] ?? 0) + w * t;
  return out;
}

/**
 * Weights over a bone chain: each bone owns the middle of its segment and blends
 * with its neighbors between segment midpoints, so joints bend smoothly.
 */
export function chainSkin(x: number, joints: readonly number[], names: readonly string[], end: number): Skin {
  const mids = names.map((_, i) => ((joints[i] ?? 0) + (joints[i + 1] ?? end)) / 2);
  if (x <= mids[0]) return { [names[0]]: 1 };
  if (x >= mids[mids.length - 1]) return { [names[names.length - 1]]: 1 };
  let i = 0;
  while (x > mids[i + 1]) i++;
  const t = smoothstep(mids[i], mids[i + 1], x);
  return { [names[i]]: 1 - t, [names[i + 1]]: t };
}

export class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  skins: Skin[] = [];
  indices: number[] = [];
  private start = { vertex: 0, index: 0 };

  get vertexCount() { return this.positions.length / 3; }
  get triangleCount() { return this.indices.length / 3; }

  begin() { this.start = { vertex: this.vertexCount, index: this.indices.length }; }

  vertex(p: Vector3, color: RGB, skin: Skin, normal?: Vector3) {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(normal?.x ?? 0, normal?.y ?? 0, normal?.z ?? 0);
    this.colors.push(...color);
    this.skins.push(skin);
    return this.vertexCount - 1;
  }
  tri(a: number, b: number, c: number) { this.indices.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number) { this.tri(a, b, c); this.tri(a, c, d); }
  point(i: number) { return new Vector3(this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]); }

  /**
   * Close the current part: orient closed shells outward by signed volume (or by
   * the `outward` test for open surface decals) and compute smooth normals unless
   * the part supplied its own.
   */
  end({ closed = true, normals = true, outward }: { closed?: boolean; normals?: boolean; outward?: (i: number) => Vector3 } = {}) {
    const { vertex, index } = this.start;
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3();
    let flip = false;
    if (closed) {
      let volume = 0;
      for (let i = index; i < this.indices.length; i += 3) {
        a.copy(this.point(this.indices[i])); b.copy(this.point(this.indices[i + 1])); c.copy(this.point(this.indices[i + 2]));
        volume += a.dot(b.clone().cross(c));
      }
      flip = volume < 0;
    } else if (outward) {
      let score = 0;
      for (let i = index; i < this.indices.length; i += 3) {
        a.copy(this.point(this.indices[i])); b.copy(this.point(this.indices[i + 1])); c.copy(this.point(this.indices[i + 2]));
        n.subVectors(b, a).cross(c.clone().sub(a));
        score += n.dot(outward(this.indices[i]));
      }
      flip = score < 0;
    }
    if (flip) {
      for (let i = index; i < this.indices.length; i += 3) {
        const t = this.indices[i + 1];
        this.indices[i + 1] = this.indices[i + 2];
        this.indices[i + 2] = t;
      }
    }
    if (!normals) return;
    const sum = new Map<number, Vector3>();
    for (let i = index; i < this.indices.length; i += 3) {
      const [ia, ib, ic] = [this.indices[i], this.indices[i + 1], this.indices[i + 2]];
      a.copy(this.point(ia)); b.copy(this.point(ib)); c.copy(this.point(ic));
      n.subVectors(b, a).cross(c.clone().sub(a));
      for (const v of [ia, ib, ic]) sum.set(v, (sum.get(v) ?? new Vector3()).add(n));
    }
    const center = new Vector3();
    for (let v = vertex; v < this.vertexCount; v++) center.add(this.point(v));
    center.multiplyScalar(1 / Math.max(1, this.vertexCount - vertex));
    for (let v = vertex; v < this.vertexCount; v++) {
      let value = sum.get(v) ?? new Vector3();
      // At a thin fin's tip the upper and lower faces cancel; point the normal outward instead.
      if (value.lengthSq() < 1e-14) value = this.point(v).sub(center);
      value.normalize();
      this.normals.splice(v * 3, 3, value.x, value.y, value.z);
    }
  }
}

export type FinSpec = {
  /** Sections from the root (v = 0) toward the tip; the tip itself closes to a point at v = 1. */
  stations: number;
  le: (v: number) => Vector3;
  te: (v: number) => Vector3;
  /** Absolute maximum section thickness at span position v. */
  thickness: (v: number) => number;
  /** Rough thickness direction, used only to keep section orientation consistent. */
  side: Vector3;
  /** `face` is +1 on the surface facing `side`, -1 on the other. */
  color: (p: Vector3, v: number, u: number, face: number) => RGB;
  skin: (p: Vector3, v: number, u: number) => Skin;
  chordPoints?: number;
  /** Station distribution; default packs sections toward the tip where the outline turns fastest. */
  spacing?: (t: number) => number;
  /** Close the root to a point too (a fin with two free tips, such as a caudal fin running lobe to lobe). */
  rootPoint?: boolean;
};

/** Symmetric NACA-style half thickness at chord fraction u, for a section of unit maximum thickness. */
function airfoil(u: number) {
  return 5 * (.2969 * Math.sqrt(u) - .126 * u - .3516 * u * u + .2843 * u ** 3 - .1036 * u ** 4);
}

/** Loft a fin from airfoil sections between its leading and trailing edge curves. */
export function fin(mesh: MeshBuilder, spec: FinSpec) {
  const k = spec.chordPoints ?? 6;
  const spacing = spec.spacing ?? (spec.rootPoint ? ((t: number) => .5 - .5 * Math.cos(Math.PI * t)) : ((t: number) => 1 - (1 - t) ** 1.35));
  const vs = spec.rootPoint
    ? Array.from({ length: spec.stations }, (_, i) => spacing((i + 1) / (spec.stations + 1)))
    : Array.from({ length: spec.stations }, (_, i) => spacing(i / spec.stations));
  const mid = (v: number) => spec.le(v).add(spec.te(v)).multiplyScalar(.5);
  mesh.begin();
  const rings: number[][] = [];
  for (const v of vs) {
    const le = spec.le(v), te = spec.te(v);
    const chord = te.clone().sub(le);
    const span = mid(Math.min(1, v + .02)).sub(mid(Math.max(0, v - .02)));
    const normal = span.clone().cross(chord).normalize();
    if (normal.lengthSq() < .5) normal.copy(spec.side).normalize();
    if (normal.dot(spec.side) < 0) normal.negate();
    const thickness = spec.thickness(v);
    const ring: number[] = [];
    const us = Array.from({ length: k }, (_, i) => (1 - Math.cos(Math.PI * i / (k - 1))) / 2);
    const add = (u: number, sign: number) => {
      const p = le.clone().addScaledVector(chord, u).addScaledVector(normal, sign * airfoil(u) * thickness);
      ring.push(mesh.vertex(p, spec.color(p, v, u, sign), spec.skin(p, v, u)));
    };
    us.forEach((u) => add(u, 1));
    us.slice(1, -1).reverse().forEach((u) => add(u, -1));
    rings.push(ring);
  }
  const m = rings[0].length;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < m; i++) mesh.quad(rings[r][i], rings[r][(i + 1) % m], rings[r + 1][(i + 1) % m], rings[r + 1][i]);
  }
  // Root cap (hidden inside the body) or a second free tip, and a pointed tip.
  const rootCenter = spec.rootPoint ? mid(0) : rings[0].reduce((acc, i) => acc.add(mesh.point(i)), new Vector3()).multiplyScalar(1 / m);
  const root = mesh.vertex(rootCenter, spec.color(rootCenter, 0, .5, 1), spec.skin(rootCenter, 0, .5));
  const tipPoint = mid(1);
  const tip = mesh.vertex(tipPoint, spec.color(tipPoint, 1, .5, 1), spec.skin(tipPoint, 1, .5));
  const last = rings[rings.length - 1];
  for (let i = 0; i < m; i++) {
    mesh.tri(root, rings[0][(i + 1) % m], rings[0][i]);
    mesh.tri(tip, last[i], last[(i + 1) % m]);
  }
  mesh.end();
}

/** A small, slightly domed eye set halfway into the skin. */
export function eye(mesh: MeshBuilder, center: Vector3, outward: Vector3, radius: number, color: RGB, skin: Skin, flatten = .55) {
  const n = outward.clone().normalize();
  const t1 = Math.abs(n.y) < .9 ? new Vector3(0, 1, 0).cross(n).normalize() : new Vector3(1, 0, 0).cross(n).normalize();
  const t2 = n.clone().cross(t1);
  mesh.begin();
  const segments = 8, rings = 4;
  const top = mesh.vertex(center.clone().addScaledVector(n, radius * flatten), color, skin);
  const rows: number[][] = [];
  for (let r = 1; r <= rings; r++) {
    const phi = Math.PI * r / (rings + 1);
    const row: number[] = [];
    for (let s = 0; s < segments; s++) {
      const a = TAU * s / segments;
      const p = center.clone()
        .addScaledVector(n, Math.cos(phi) * radius * flatten)
        .addScaledVector(t1, Math.sin(phi) * Math.cos(a) * radius)
        .addScaledVector(t2, Math.sin(phi) * Math.sin(a) * radius);
      row.push(mesh.vertex(p, color, skin));
    }
    rows.push(row);
  }
  const bottom = mesh.vertex(center.clone().addScaledVector(n, -radius * flatten), color, skin);
  for (let s = 0; s < segments; s++) {
    const s1 = (s + 1) % segments;
    mesh.tri(top, rows[0][s], rows[0][s1]);
    for (let r = 0; r < rings - 1; r++) mesh.quad(rows[r][s], rows[r + 1][s], rows[r + 1][s1], rows[r][s1]);
    mesh.tri(bottom, rows[rings - 1][s1], rows[rings - 1][s]);
  }
  mesh.end();
}
