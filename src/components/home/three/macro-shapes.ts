import { BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, Matrix4, Vector3 } from 'three';

/**
 * A small kit for the reef's procedural small life (macro-creatures.ts): tubes along a curve, lathes
 * and lumpy blobs, built as flat-shaded triangles, each face one color, like the island's other
 * low-poly props. A paint function picks each face's color from where it is: along the shape (u, 0
 * to 1), around it (v, 0 to 1; a quarter of the way round is its top) and the face's middle.
 */
export type Paint = Color | ((u: number, v: number, at: Vector3) => Color);
const pick = (paint: Paint, u: number, v: number, at: Vector3) => (paint instanceof Color ? paint : paint(u, v, at));

/** A deterministic value from 0 to 1 for a pair of numbers (patterns that look random but never change). */
export const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

const center = new Vector3();

/** Collects triangles, each its own color, under a transform; `geometry()` makes them one mesh's worth. */
export class Sculpt {
  private positions: number[] = [];
  private colors: number[] = [];
  private matrix = new Matrix4();
  /** Build `draw` moved by `matrix` (on top of any transform already in place). */
  at(matrix: Matrix4, draw: () => void) {
    const before = this.matrix.clone();
    this.matrix.multiply(matrix);
    draw();
    this.matrix.copy(before);
    return this;
  }
  tri(a: Vector3, b: Vector3, c: Vector3, color: Color) {
    for (const p of [a, b, c]) {
      const q = p.clone().applyMatrix4(this.matrix);
      this.positions.push(q.x, q.y, q.z);
      this.colors.push(color.r, color.g, color.b);
    }
  }
  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: Color) { this.tri(a, b, c, color); this.tri(a, c, d, color); }
  get triangles() { return this.positions.length / 9; }
  geometry() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}

/**
 * A tube along `spine` (t from 0 to 1), its cross-section an ellipse `radius(t)` = [across, up]
 * wide, `up` saying which way is up for the cross-section (it must not run along the spine). Capped
 * at both ends (a radius of 0 closes it to a point anyway).
 */
export function tube(sculpt: Sculpt, spine: (t: number) => Vector3, radius: (t: number) => readonly [number, number], options: {
  segments: number; sides: number; paint: Paint; up?: Vector3; caps?: boolean; turn?: number;
}) {
  const { segments, sides, paint, up = new Vector3(0, 1, 0), caps = true, turn = 0 } = options;
  const rings: Vector3[][] = [], mids: Vector3[] = [];
  for (let j = 0; j <= segments; j++) {
    const t = j / segments, c = spine(t), e = 1e-3;
    const tangent = spine(Math.min(1, t + e)).sub(spine(Math.max(0, t - e))).normalize();
    const side = new Vector3().crossVectors(tangent, up).normalize(), top = new Vector3().crossVectors(side, tangent).normalize();
    const [rx, ry] = radius(t);
    mids.push(c);
    rings.push(Array.from({ length: sides }, (_, k) => {
      const a = (k / sides + turn) * Math.PI * 2;
      return c.clone().addScaledVector(side, Math.cos(a) * rx).addScaledVector(top, Math.sin(a) * ry);
    }));
  }
  for (let j = 0; j < segments; j++) {
    for (let k = 0; k < sides; k++) {
      const n = (k + 1) % sides, a = rings[j][k], b = rings[j + 1][k], c = rings[j + 1][n], d = rings[j][n];
      center.copy(a).add(b).add(c).add(d).multiplyScalar(.25);
      sculpt.quad(a, b, c, d, pick(paint, (j + .5) / segments, (k + .5) / sides, center));
    }
  }
  if (!caps) return;
  for (let k = 0; k < sides; k++) {
    const n = (k + 1) % sides;
    sculpt.tri(mids[0], rings[0][k], rings[0][n], pick(paint, 0, (k + .5) / sides, mids[0]));
    sculpt.tri(mids[segments], rings[segments][n], rings[segments][k], pick(paint, 1, (k + .5) / sides, mids[segments]));
  }
}

/** A solid of revolution about y: `profile` is [radius, height] from bottom to top, `squash` scales its z (an oval). */
export function lathe(sculpt: Sculpt, profile: readonly (readonly [number, number])[], options: { sides: number; paint: Paint; squash?: number; turn?: number }) {
  const { sides, paint, squash = 1, turn = 0 } = options;
  const ring = ([r, y]: readonly [number, number]) => Array.from({ length: sides }, (_, k) => {
    const a = (k / sides + turn) * Math.PI * 2;
    return new Vector3(Math.cos(a) * r, y, -Math.sin(a) * r * squash);
  });
  const rings = profile.map(ring);
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < sides; k++) {
      const n = (k + 1) % sides, a = rings[j][k], b = rings[j][n], c = rings[j + 1][n], d = rings[j + 1][k];
      center.copy(a).add(b).add(c).add(d).multiplyScalar(.25);
      sculpt.quad(a, b, c, d, pick(paint, (j + .5) / (rings.length - 1), (k + .5) / sides, center));
    }
  }
}

/**
 * A lumpy rounded shape: an icosphere (`detail` 0 to 2) with these semi-axes, each corner pushed in
 * or out by up to `lumps` of its size (the same corners always, from `seed`), its middle at `at`;
 * cut flat `below` and `above` these heights from its middle (a slug's sole, a rock's top).
 */
export function blob(sculpt: Sculpt, at: Vector3, axes: readonly [number, number, number], options: { detail?: number; lumps?: number; seed?: number; paint: Paint; below?: number; above?: number }) {
  const { detail = 1, lumps = 0, seed = 0, paint, below = -Infinity, above = Infinity } = options;
  const source = new IcosahedronGeometry(1, detail), positions = source.attributes.position, corners: Vector3[] = [];
  for (let i = 0; i < positions.count; i++) {
    const p = new Vector3().fromBufferAttribute(positions, i);
    // The same corner (shared by several faces) always moves the same way.
    const bump = 1 + lumps * (hash(seed + Math.round(p.x * 97), Math.round(p.y * 89) * 31 + Math.round(p.z * 83)) * 2 - 1);
    const q = new Vector3(p.x * axes[0] * bump, Math.min(above, Math.max(below, p.y * axes[1] * bump)), p.z * axes[2] * bump).add(at);
    corners.push(q);
  }
  source.dispose();
  for (let i = 0; i < corners.length; i += 3) {
    const [a, b, c] = [corners[i], corners[i + 1], corners[i + 2]];
    center.copy(a).add(b).add(c).divideScalar(3);
    const d = center.clone().sub(at);
    sculpt.tri(a, b, c, pick(paint, (d.y / axes[1] + 1) / 2, (Math.atan2(-d.z, d.x) / (Math.PI * 2) + 1) % 1, center));
  }
}

/** A flat fan of triangles from `root` through `edge` (a fin, a leaf, a petal), one color or painted along the edge. */
export function fan(sculpt: Sculpt, root: Vector3, edge: readonly Vector3[], paint: Paint) {
  for (let i = 0; i < edge.length - 1; i++) {
    center.copy(root).add(edge[i]).add(edge[i + 1]).divideScalar(3);
    sculpt.tri(root, edge[i], edge[i + 1], pick(paint, (i + .5) / (edge.length - 1), 0, center));
  }
}

/** Shorthands for building transforms. */
export const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);
export const place = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, scale = 1) =>
  new Matrix4().makeRotationY(yaw).multiply(new Matrix4().makeRotationX(pitch)).multiply(new Matrix4().makeRotationZ(roll))
    .premultiply(new Matrix4().makeTranslation(x, y, z)).multiply(new Matrix4().makeScale(scale, scale, scale));
/** A color between two, by `t`. */
export const mix = (a: Color, b: Color, t: number) => a.clone().lerp(b, Math.min(1, Math.max(0, t)));
