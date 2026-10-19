import { useEffect, useMemo } from 'react';
import { BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, IcosahedronGeometry, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { islets, outlinePoints, shoreDistance } from '@/lib/island-outline';
import { smoothstep } from '@/lib/steering';
import { shoreline } from './island-shape';

/**
 * The Kelp Forest's island: a rugged headland of dark rock on a cold coast, like the granite of
 * Point Lobos. Low cliffs and a skirt of wave-washed boulders where the sandy island has its beach,
 * a low hill of sun-dried golden grass with darker patches of coastal scrub and bare rock showing
 * through, a few wind-shaped Monterey cypress leaning away from the sea wind, and sea stacks standing
 * in the water off its points. Drawn in the island group's coordinates (scaled with the level, like
 * the sandy island).
 */
const ROCK_WET = new Color('#4A463E'), ROCK = new Color('#6B6457'), ROCK_LIGHT = new Color('#8A8372');
const GRASS = new Color('#928A5A'), GRASS_DRY = new Color('#A69C66'), SCRUB = new Color('#66744B'), SCRUB_DARK = new Color('#54633F');
const CYPRESS = new Color('#3B5536'), CYPRESS_LIGHT = new Color('#4E6B44'), TRUNK = new Color('#4A3F33');
/** The cliffs' foot (below the water surface, so the waves wash it) and top. */
const FOOT = -.26, TOP = .07;

const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
/** Smooth value noise in 0..1, features about one unit across. */
function noise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Gives each face of a non-indexed geometry one color from `pick` (its center and index). */
function paintFaces(geometry: BufferGeometry, pick: (x: number, y: number, z: number, face: number) => Color) {
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
function faces(geometry: BufferGeometry) {
  if (!geometry.index) return geometry;
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  return flat;
}

/** A low-poly boulder at (x, y, z), its semi-axes, turned `yaw`. */
function boulder(x: number, y: number, z: number, a: number, b: number, c: number, yaw: number, seed: number) {
  const geometry = new IcosahedronGeometry(1, 0);
  geometry.scale(a, b, c);
  geometry.rotateY(yaw);
  geometry.translate(x, y, z);
  const shade = new Color();
  return paintFaces(faces(geometry), (_x, fy, _z, f) => {
    const n = hash(seed, f);
    return shade.copy(fy < -.16 ? ROCK_WET : ROCK).lerp(n < .5 ? ROCK_WET : ROCK_LIGHT, Math.abs(n - .5) * 1.2).clone();
  });
}

/** The outline in the island group's ground plane (x, z), for distances from the cliff edge. */
const OUTLINE = (() => {
  const points = outlinePoints(10), polygon = new Float32Array(points.length * 2);
  points.forEach(([x, y], i) => { polygon[i * 2] = x; polygon[i * 2 + 1] = -y; });
  return polygon;
})();
/** Where the headland's hill rises highest, how high above the cliff top, and how far it spreads (units). */
const HILL = { x: -.45, z: .2, height: .2, radius: 1.9 };
/** The ground's height on top of the headland at (x, z): a low hill rising from the cliff edge, a little uneven. */
function groundAt(x: number, z: number) {
  const inside = Math.max(0, -shoreDistance([OUTLINE], x, z));
  const rise = Math.max(0, 1 - Math.hypot(x - HILL.x, z - HILL.z) / HILL.radius) ** 1.4;
  const lumps = (Math.sin(x * 4.1 + 1.3) * Math.sin(z * 3.7 - .4) + Math.sin((x + z) * 6.3)) * .012;
  return TOP + .045 + (HILL.height * rise + lumps) * smoothstep(0, .45, inside);
}

/**
 * The headland's rock walls: the island's outline extruded from below the waterline to the cliff
 * top, the walls broken up so they read as rough rock, darker and wetter toward the water, taller
 * on the hill's side. `scale` and the offset place an islet with the same build.
 */
function headland(scale = 1, ox = 0, oz = 0, seed = 0) {
  const geometry = new ExtrudeGeometry(shoreline(), { depth: TOP - FOOT, bevelEnabled: true, bevelThickness: .03, bevelSize: .05, bevelSegments: 1, curveSegments: 12, steps: 3 });
  // Lying flat: the outline's plane becomes the ground, the extrusion rises from the foot.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, FOOT, 0);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    // Rough walls: each vertex pushed in or out from the middle; the cliff top higher toward the hill.
    const r = Math.hypot(x, z) || 1, rough = (hash(Math.round(x * 30) + seed, Math.round(z * 30) + Math.round(y * 30)) - .5) * .13;
    const up = Math.max(0, (y - FOOT) / (TOP - FOOT));
    position.setXYZ(i, x + x / r * rough * (.3 + .7 * up), y, z + z / r * rough * (.3 + .7 * up));
  }
  geometry.scale(scale, 1, scale);
  geometry.translate(ox, 0, oz);
  const shade = new Color();
  return paintFaces(faces(geometry), (_x, y, _z, f) => {
    const n = hash(f + seed, 3.3);
    const base = shade.copy(ROCK_WET).lerp(ROCK, Math.min(1, Math.max(0, (y - FOOT) / (TOP - FOOT)) * 1.3));
    return base.lerp(n < .5 ? ROCK_WET : ROCK_LIGHT, Math.abs(n - .5) * .9).clone();
  });
}

/** Delaunay triangulation (Bowyer–Watson) of a few hundred points: index triples, wound counter-clockwise in (x, y). */
function delaunay(points: readonly (readonly [number, number])[]) {
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

/**
 * The headland's top: the outline (a little wider than the cliffs' top, covering it) filled with
 * evenly spread facets over a jittered lattice of points, following `groundAt`. Sun-dried golden
 * grass, darker patches of coastal scrub, and bare rock showing at the cliff edge and in outcrops.
 */
function hilltop(seed: number) {
  const contour = outlinePoints(8).map(([x, y]) => [x * 1.02, -y * 1.02] as const);
  const rim = new Float32Array(contour.flat());
  const step = .19, points: (readonly [number, number])[] = [...contour];
  for (let z = -1.9; z <= 1.9; z += step * .87) {
    for (let x = -2.5; x <= 2.5; x += step) {
      const px = x + (Math.round(z / step) % 2) * step / 2 + (hash(x * 7 + seed, z * 3) - .5) * step * .45, pz = z + (hash(z * 5, x * 9 + seed) - .5) * step * .45;
      if (-shoreDistance([rim], px, pz) > step * .5) points.push([px, pz]);
    }
  }
  const height = (i: number) => (i < contour.length ? TOP + .045 : groundAt(points[i][0], points[i][1]));
  const positions: number[] = [];
  for (const [a, b, c] of delaunay(points)) {
    // Only inside the outline (Delaunay also bridges its bays).
    const cx = (points[a][0] + points[b][0] + points[c][0]) / 3, cz = (points[a][1] + points[b][1] + points[c][1]) / 3;
    if (shoreDistance([rim], cx, cz) > 0) continue;
    // Counter-clockwise in (x, z) faces down once z is the scene's depth: reverse for an upward face.
    for (const i of [a, c, b]) positions.push(points[i][0], height(i), points[i][1]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(new Float32Array(positions.length), 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  const shade = new Color();
  return paintFaces(geometry, (x, y, z, f) => {
    // Scrub in soft-edged patches (thicker in the hollows, lee of the hill), bare rock at the cliff
    // edge and in outcrops, each fading into the grass rather than stopping at a line.
    const scrub = noise(x * 2.2 + seed, z * 2.2 - seed) * .75 + noise(x * 5, z * 5) * .25, inside = -shoreDistance([OUTLINE], x, z);
    const outcrop = noise(x * 3.3 - 7, z * 3.3 + 4);
    const color = shade.copy(GRASS).lerp(GRASS_DRY, Math.min(1, hash(f, 3.3) * .3 + (y - TOP) * 2.5));
    color.lerp(SCRUB_DARK.clone().lerp(SCRUB, hash(f, 2.2) * .5), smoothstep(.5, .68, scrub) * .9);
    color.lerp(ROCK.clone().lerp(ROCK_LIGHT, hash(f, 1.1) * .6), Math.max(smoothstep(.1, .03, inside), smoothstep(.76, .9, outcrop) * .85));
    return color.clone();
  });
}

/** A Monterey cypress: a short, leaning trunk under a broad, flat-topped, wind-sheared crown of a few dark masses. */
function cypress(x: number, z: number, size: number, lean: number, seed: number) {
  const parts: BufferGeometry[] = [], shade = new Color(), ground = groundAt(x, z);
  const trunk = new IcosahedronGeometry(1, 0);
  trunk.scale(.025 * size, .14 * size, .025 * size);
  trunk.rotateZ(lean * .5);
  trunk.translate(x - lean * .05 * size, ground + .1 * size, z);
  parts.push(paintFaces(faces(trunk), () => TRUNK));
  // The crown: overlapping flattened masses swept to the lee side.
  for (let k = 0; k < 4; k++) {
    const mass = new IcosahedronGeometry(1, 0);
    const w = (.13 + .05 * hash(seed, k)) * size;
    mass.scale(w, w * .38, w * .8);
    mass.rotateY(hash(seed, k + 9) * 3);
    mass.translate(x - lean * (.05 + .08 * k) * size + (hash(seed, k + 3) - .5) * .06 * size, ground + (.2 + .05 * (k % 2)) * size, z + (hash(seed, k + 5) - .5) * .12 * size);
    parts.push(paintFaces(faces(mass), (_x, y, _z, f) => shade.copy(CYPRESS).lerp(CYPRESS_LIGHT, hash(f, k + seed) * .6 + (y > ground + .22 * size ? .3 : 0)).clone()));
  }
  return parts;
}

/**
 * Boulders along the waterline and sea stacks off the points: island-group coordinates from the
 * outline itself, so they follow the shore.
 */
function shoreRocks(seed: number) {
  const points = outlinePoints(6), parts: BufferGeometry[] = [];
  points.forEach(([px, py], i) => {
    if (hash(i, seed) < .35) return;
    const [qx, qy] = points[(i + 1) % points.length];
    const nx = qy - py, nz = qx - px, length = Math.hypot(nx, nz) || 1;
    // Just outside the cliff foot, a little way into the water.
    const out = .05 + .07 * hash(i, 2.2), x = px + nx / length * out, z = -py + nz / length * out;
    const s = .05 + .06 * hash(i, 4.4);
    parts.push(boulder(x, FOOT + .06 + s * .2, z, s, s * .7, s * .85, hash(i, 6.6) * 3, i * 3.7));
  });
  // Sea stacks: tall rocks standing off the headland's points, their tops well clear of the water.
  for (const [x, z, s, h] of [[2.32, .78, .17, .34], [-1.95, -1.55, .14, .28], [-2.55, .5, .1, .22]] as const) {
    parts.push(boulder(x, FOOT + h * .5, z, s, h, s * .85, x * 3, x * 11));
    parts.push(boulder(x + s * .9, FOOT + .02, z - s * .4, s * .5, s * .4, s * .45, z, z * 7));
  }
  return parts;
}

/** Everything of the Kelp Forest's island in one mesh (it never moves): rock, hill, cypress, boulders, stacks. */
export function KelpCoast({ level }: { level: number }) {
  const mesh = useMemo(() => {
    const parts: BufferGeometry[] = [
      headland(),
      hilltop(1),
      ...cypress(-.85, .3, 1.7, .9, 1), ...cypress(-.45, .62, 1.5, .9, 2), ...cypress(-.2, .2, 1.3, .9, 3),
      ...cypress(.85, -.3, 1.25, .9, 4), ...cypress(1.35, .4, 1, .9, 5),
      ...shoreRocks(1),
      // From level 5 the islets (island-outline.ts) rise as rocky skerries.
      ...islets(level).map(({ position: [x, z], scale }, i) => headland(scale, x, z, 7 + i)),
    ];
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.name = 'kelp-coast';
    mesh.raycast = () => {};
    return mesh;
  }, [level]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as MeshLambertMaterial).dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}
