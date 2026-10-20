import { BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, IcosahedronGeometry } from 'three';
import type { IslandShape } from '@/lib/island-outline';
import { curveSegments, shoreline } from './island-shape';

/**
 * Building blocks of the rocky islands' coasts (kelp-coast.tsx, volcanic-coast.tsx): flat-shaded,
 * vertex-coloured geometry in the island group's coordinates, merged into one mesh per island.
 */
export const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
/** Smooth value noise in 0..1, features about one unit across. */
export function noise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Gives each face of a non-indexed geometry one color from `pick` (its center and index). */
export function paintFaces(geometry: BufferGeometry, pick: (x: number, y: number, z: number, face: number) => Color) {
  const position = geometry.attributes.position, faces = position.count / 3, colors = new Float32Array(position.count * 3);
  for (let f = 0; f < faces; f++) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) { x += position.getX(f * 3 + k) / 3; y += position.getY(f * 3 + k) / 3; z += position.getZ(f * 3 + k) / 3; }
    const color = pick(x, y, z, f);
    for (let k = 0; k < 3; k++) colors.set([color.r, color.g, color.b], (f * 3 + k) * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}
/** A geometry's triangles as separate faces, ready for paintFaces (disposing the indexed source). */
export function faces(geometry: BufferGeometry) {
  if (!geometry.index) return geometry;
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  return flat;
}
/** A non-indexed geometry from flat (x, y, z) triangle positions, with the attributes the merge expects. */
export function triangles(positions: number[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(new Float32Array(positions.length), 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  return geometry;
}

/** Rock colours: wet (at and under the waterline), dry and the lightest faces. */
export type RockColors = { wet: Color; rock: Color; light: Color };

/** A low-poly boulder at (x, y, z), its semi-axes, turned `yaw`; faces below `wetBelow` are wet. */
export function boulder(colors: RockColors, x: number, y: number, z: number, a: number, b: number, c: number, yaw: number, seed: number, wetBelow = -.16) {
  const geometry = new IcosahedronGeometry(1, 0);
  geometry.scale(a, b, c);
  geometry.rotateY(yaw);
  geometry.translate(x, y, z);
  const shade = new Color();
  return paintFaces(faces(geometry), (_x, fy, _z, f) => {
    const n = hash(seed, f);
    return shade.copy(fy < wetBelow ? colors.wet : colors.rock).lerp(n < .5 ? colors.wet : colors.light, Math.abs(n - .5) * 1.2).clone();
  });
}

/**
 * The island's rock walls: its outline extruded from `foot` (below the waterline) to `top`, the
 * walls broken up so they read as rough rock, darker and wetter toward the water. `scale` and the
 * offset place an islet with the same build; `cap` (x, z) lowers the walls where a beach comes down
 * to the water, and leaves off the flat lids (the ground drawn over the walls covers their top).
 * `island` is whose outline it is.
 */
export function cliffs(colors: RockColors, foot: number, top: number, scale = 1, ox = 0, oz = 0, seed = 0, cap?: (x: number, z: number) => number, island: IslandShape = 'reef') {
  let geometry: BufferGeometry = new ExtrudeGeometry(shoreline(island), { depth: top - foot, bevelEnabled: true, bevelThickness: .03, bevelSize: .05, bevelSegments: 1, curveSegments: curveSegments(island, 12), steps: 3 });
  if (cap) {
    // The lids are the first group, the walls (and bevels) the second.
    const walls = geometry.groups[1], lidless = new BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const attribute = geometry.getAttribute(name);
      lidless.setAttribute(name, new Float32BufferAttribute(attribute.array.slice(walls.start * attribute.itemSize, (walls.start + walls.count) * attribute.itemSize), attribute.itemSize));
    }
    geometry.dispose();
    geometry = lidless;
  }
  // Lying flat: the outline's plane becomes the ground, the extrusion rises from the foot.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, foot, 0);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    // Rough walls: each vertex pushed in or out from the middle, more toward the top.
    const r = Math.hypot(x, z) || 1, rough = (hash(Math.round(x * 30) + seed, Math.round(z * 30) + Math.round(y * 30)) - .5) * .13;
    const up = Math.max(0, (y - foot) / (top - foot));
    position.setXYZ(i, x + x / r * rough * (.3 + .7 * up), cap ? Math.min(y, Math.max(foot, cap(x, z))) : y, z + z / r * rough * (.3 + .7 * up));
  }
  geometry.scale(scale, 1, scale);
  geometry.translate(ox, 0, oz);
  const shade = new Color();
  return paintFaces(faces(geometry), (_x, y, _z, f) => {
    const n = hash(f + seed, 3.3);
    const base = shade.copy(colors.wet).lerp(colors.rock, Math.min(1, Math.max(0, (y - foot) / (top - foot)) * 1.3));
    return base.lerp(n < .5 ? colors.wet : colors.light, Math.abs(n - .5) * .9).clone();
  });
}

/** Delaunay triangulation (Bowyer–Watson) of a few hundred points: index triples, wound counter-clockwise in (x, y). */
export function delaunay(points: readonly (readonly [number, number])[]) {
  const n = points.length, all = [...points, [-50, -50], [50, -50], [0, 50]] as (readonly [number, number])[];
  type Tri = { a: number; b: number; c: number; x: number; y: number; r: number };
  const make = (a: number, b: number, c: number): Tri => {
    const [ax, ay] = all[a], [bx, by] = all[b], [cx, cy] = all[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    return { a, b, c, x: ux, y: uy, r: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let triangles = [make(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const [px, py] = all[i];
    const bad = triangles.filter((t) => (px - t.x) ** 2 + (py - t.y) ** 2 < t.r);
    const edges = new Map<string, [number, number]>();
    for (const t of bad) {
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
        const key = u < v ? `${u},${v}` : `${v},${u}`;
        if (edges.has(key)) edges.delete(key); else edges.set(key, [u, v]);
      }
    }
    triangles = triangles.filter((t) => !bad.includes(t));
    for (const [u, v] of edges.values()) triangles.push(make(u, v, i));
  }
  return triangles.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => {
    const [ax, ay] = all[t.a], [bx, by] = all[t.b], [cx, cy] = all[t.c];
    return ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) > 0 ? [t.a, t.b, t.c] : [t.a, t.c, t.b]) as [number, number, number];
  });
}
