import { useEffect, useMemo } from 'react';
import { type BufferGeometry, Color, CylinderGeometry, IcosahedronGeometry, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { islets, outlinePoints, shoreDistance } from '@/lib/island-outline';
import { smoothstep } from '@/lib/steering';
import { cliffs, delaunay, faces, hash, noise, paintFaces, triangles } from './coast-geometry';
import { useSceneQuality } from './scene-quality';

/**
 * The Mangroves & Seagrass island: a low island of tidal mud under a dense, glossy canopy of
 * mangroves, like the cays of Belize and the Florida Keys. Red mangroves stand at its edge in the
 * water on arching prop roots; a spit of pale sand runs out on its south-east side, where the canopy
 * opens; two white egrets wade at the water's edge. A tidal creek winds in from the south-west shore to a
 * lagoon in the island's heart (`CREEK`). The seagrass meadows on the shelf around it are
 * seagrass-meadow.tsx. Drawn in the island group's coordinates (scaled with the level).
 */
const MUD = new Color('#4F4334'), MUD_WET = new Color('#3A3128'), LITTER = new Color('#65583F'), UNDER = new Color('#4E6A3A');
const SAND = new Color('#E2D7B0'), SAND_WET = new Color('#C9BC92');
const LEAF = new Color('#2F5A2E'), LEAF_MID = new Color('#40703A'), LEAF_LIGHT = new Color('#5E8F48'), LEAF_SUN = new Color('#7DA457');
const BARK = new Color('#6A5D4C'), ROOT = new Color('#7A6B58'), ROOT_WET = new Color('#45392D');
const BIRD = new Color('#F6F5EF'), BILL = new Color('#E2B33A'), LEGS = new Color('#222222');
const PLANK = new Color('#9C8466'), PLANK_DARK = new Color('#7A6650'), SNAG = new Color('#B8B2A6');
const CREEK_WATER = new Color('#33544A'), CREEK_SHEEN = new Color('#5E8A7A');
/** Leaf tints: white mangroves paler and yellower, black and red mangroves darker. */
const TINTS = [new Color('#7FA352'), new Color('#2A4E2B'), new Color('#4C7A3E')];
const BANK = { wet: MUD_WET, rock: MUD, light: LITTER };
/** The mud bank's foot (under the water), its top, and the water's calm surface (OCEAN.surfaceLevel). */
const FOOT = -.3, TOP = -.145, WATER = -.18;
/** The sand spit: where along the shore (angle about the island's middle) and how wide (rad). */
const SPIT = { angle: .55, width: .42 };
/** The Mangroves' own island: a long, low, ragged cay (island-outline.ts). */
const SHAPE = 'mangrove';

const OUTLINE = (() => {
  const points = outlinePoints(10, SHAPE), polygon = new Float32Array(points.length * 2);
  points.forEach(([x, y], i) => { polygon[i * 2] = x; polygon[i * 2 + 1] = -y; });
  return polygon;
})();
const angleTo = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
/** How much (0..1) a point lies on the sand spit. */
const spit = (x: number, z: number) => smoothstep(SPIT.width, SPIT.width * .5, angleTo(Math.atan2(z, x), SPIT.angle));
const inside = (x: number, z: number) => -shoreDistance([OUTLINE], x, z);

/**
 * The tidal creek: from a mouth on the south-west shore it winds in under the canopy to a lagoon in the
 * island's heart, its dark, tea-stained water lying flat at the tide's level. A cubic Bézier from the mouth
 * to the lagoon's edge (`path`, sampled), narrowing as it goes in, and the lagoon, a ragged round pool.
 */
const CREEK = (() => {
  const mouthAngle = 2.45, outline = outlinePoints(10, SHAPE).map(([x, y]) => [x, -y] as const);
  const [mx, mz] = outline.reduce((best, p) => (angleTo(Math.atan2(p[1], p[0]), mouthAngle) < angleTo(Math.atan2(best[1], best[0]), mouthAngle) ? p : best));
  const lagoon = { x: -.32, z: -.12, radius: .34 };
  const c = [[mx * 1.06, mz * 1.06], [mx * .7 + .14, mz * .7 + .02], [mx * .42 - .12, mz * .42 - .02], [lagoon.x - .06, lagoon.z + .2]];
  const path = Array.from({ length: 17 }, (_, i) => {
    const t = i / 16, u = 1 - t;
    return [0, 1].map((k) => u ** 3 * c[0][k] + 3 * u * u * t * c[1][k] + 3 * u * t * t * c[2][k] + t ** 3 * c[3][k]) as [number, number];
  });
  return { path, lagoon, width: (t: number) => .085 - .025 * t };
})();
/** How far (units) a point lies outside the creek's water: negative in it, its banks just past zero. */
function creekMargin(x: number, z: number) {
  const { path, lagoon, width } = CREEK;
  let margin = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1], dx = bx - ax, dz = bz - az;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    margin = Math.min(margin, Math.hypot(x - ax - dx * u, z - az - dz * u) - width((i + u) / (path.length - 1)));
  }
  const a = Math.atan2(z - lagoon.z, x - lagoon.x);
  const ragged = lagoon.radius * (1 + .1 * Math.sin(a * 3 + 1) + .06 * Math.sin(a * 5 - 2));
  return Math.min(margin, Math.hypot(x - lagoon.x, z - lagoon.z) - ragged);
}

/** The ground's height at (x, z): tidal mud just above the water, a little higher inland, lumpy with roots. */
function groundAt(x: number, z: number) {
  const lumps = (noise(x * 3.1 + 2, z * 3.1 - 1) - .5) * .02;
  const land = TOP + .02 + (.06 + lumps) * smoothstep(.05, .6, Math.max(0, inside(x, z))) * (1 - .6 * spit(x, z));
  // The creek's water lies flat just above the tide line, its muddy banks sloping down to it.
  return land + (WATER + .008 - land) * smoothstep(.035, -.005, creekMargin(x, z));
}

/** The island's ground: the outline filled with facets over a jittered lattice. Mud and leaf litter under the trees, pale sand on the spit. */
function ground(seed: number) {
  const contour = outlinePoints(8, SHAPE).map(([x, y]) => [x * 1.02, -y * 1.02] as const);
  const rim = new Float32Array(contour.flat());
  const step = .2, points: (readonly [number, number])[] = [...contour];
  for (let z = -1.9; z <= 1.9; z += step * .87) {
    for (let x = -3; x <= 3; x += step) {
      const px = x + (Math.round(z / step) % 2) * step / 2 + (hash(x * 7 + seed, z * 3) - .5) * step * .45, pz = z + (hash(z * 5, x * 9 + seed) - .5) * step * .45;
      if (-shoreDistance([rim], px, pz) > step * .5 && Math.abs(creekMargin(px, pz)) > .03) points.push([px, pz]);
    }
  }
  // The creek's banks and the lagoon's rim get points of their own, so their edges stay clean.
  const { path, lagoon, width } = CREEK, lip = (px: number, pz: number) => { if (-shoreDistance([rim], px, pz) > .03) points.push([px, pz]); };
  path.forEach(([cx, cz], i) => {
    const [nx, nz] = path[Math.min(i + 1, path.length - 1)], [ox, oz] = path[Math.max(i - 1, 0)], len = Math.hypot(nx - ox, nz - oz) || 1;
    const sx = -(nz - oz) / len, sz = (nx - ox) / len, w = width(i / (path.length - 1));
    lip(cx, cz);
    for (const side of [-1, 1]) for (const d of [w, w + .045]) lip(cx + sx * side * d, cz + sz * side * d);
  });
  for (let k = 0; k < 28; k++) {
    const a = k / 28 * Math.PI * 2;
    for (const r of [.55, 1, 1.18]) lip(lagoon.x + Math.cos(a) * lagoon.radius * r, lagoon.z + Math.sin(a) * lagoon.radius * r);
  }
  lip(lagoon.x, lagoon.z);
  const height = (i: number) => (i < contour.length ? Math.min(TOP + .02, groundAt(points[i][0], points[i][1])) : groundAt(points[i][0], points[i][1]));
  const positions: number[] = [];
  for (const [a, b, c] of delaunay(points)) {
    const cx = (points[a][0] + points[b][0] + points[c][0]) / 3, cz = (points[a][1] + points[b][1] + points[c][1]) / 3;
    if (shoreDistance([rim], cx, cz) > 0) continue;
    for (const i of [a, c, b]) positions.push(points[i][0], height(i), points[i][1]);
  }
  const shade = new Color();
  return paintFaces(triangles(positions), (x, _y, z, f) => {
    const n = hash(f, 2.7), d = inside(x, z);
    const color = shade.copy(MUD).lerp(LITTER, smoothstep(.1, .5, d) * (.5 + .5 * n));
    color.lerp(UNDER, smoothstep(.55, .75, noise(x * 2.4 + seed, z * 2.4)) * smoothstep(.2, .5, d) * .8);
    color.lerp(MUD_WET, smoothstep(.12, 0, d) * .7);
    color.lerp(SAND.clone().lerp(SAND_WET, smoothstep(.15, 0, d)), spit(x, z) * smoothstep(.85, .45, d));
    // The creek: wet mud on its banks, dark tea-stained water catching a little of the sky.
    const creek = creekMargin(x, z);
    color.lerp(MUD_WET, smoothstep(.05, .01, creek));
    if (creek < 0) color.copy(CREEK_WATER).lerp(CREEK_SHEEN, .25 * n + .35 * smoothstep(0, -.12, creek));
    return color.clone();
  });
}

/** A mangrove's crown: overlapping, flattened masses of glossy leaves, sunlit on top, each tree a little different in tone. */
function crown(x: number, y: number, z: number, size: number, seed: number, lumps = 4) {
  const parts: BufferGeometry[] = [], shade = new Color(), tint = TINTS[Math.floor(hash(seed, 1.3) * TINTS.length)], tone = .6 * hash(seed, 2.9);
  for (let k = 0; k < lumps; k++) {
    const mass = new IcosahedronGeometry(1, 0), a = k * 2.4 + seed, w = (.13 + .06 * hash(seed, k)) * size;
    mass.scale(w, w * .55, w * .9);
    mass.rotateY(hash(seed, k + 9) * 3);
    const r = k === 0 ? 0 : .09 * size;
    mass.translate(x + Math.cos(a) * r, y + (.02 + .03 * hash(k, seed)) * size, z + Math.sin(a) * r);
    parts.push(paintFaces(faces(mass), (_x, fy, _z, f) => {
      const top = smoothstep(y, y + .07 * size, fy);
      return shade.copy(LEAF).lerp(LEAF_MID, hash(f, k + seed) * .8).lerp(tint, tone).lerp(hash(f + 3, seed) > .7 ? LEAF_SUN : LEAF_LIGHT, top * .7).clone();
    }));
  }
  return parts;
}

/** A thin tube along a cubic Bézier from p0 to p3, `sides` sided, its radius tapering from r0 to r1: bark, wet toward the water, unless `paint` says otherwise. */
function root(p0: number[], p1: number[], p2: number[], p3: number[], r0: number, r1: number, sides: number, segments: number, paint?: () => Color) {
  const at = (t: number) => p0.map((_, k) => (1 - t) ** 3 * p0[k] + 3 * (1 - t) ** 2 * t * p1[k] + 3 * (1 - t) * t * t * p2[k] + t ** 3 * p3[k]);
  const positions: number[] = [];
  const rings = Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments, c = at(t), d = at(Math.min(1, t + .02)).map((v, k) => v - at(Math.max(0, t - .02))[k]);
    const len = Math.hypot(d[0], d[1], d[2]) || 1, tx = d[0] / len, ty = d[1] / len, tz = d[2] / len;
    // A side vector across the tube (horizontal), and the third axis.
    let sx = -tz, sz = tx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
    const ux = ty * sz, uy = tz * sx - tx * sz, uz = -ty * sx;
    const r = r0 + (r1 - r0) * t;
    return Array.from({ length: sides }, (_, k) => {
      const a = Math.PI * 2 * k / sides;
      return [c[0] + (sx * Math.cos(a) + ux * Math.sin(a)) * r, c[1] + uy * Math.sin(a) * r, c[2] + (sz * Math.cos(a) + uz * Math.sin(a)) * r];
    });
  });
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k < sides; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % sides], c = rings[i + 1][(k + 1) % sides], d = rings[i + 1][k];
      positions.push(...a, ...c, ...b, ...a, ...d, ...c);
    }
  }
  const shade = new Color();
  return paintFaces(triangles(positions), paint ?? ((_x, y, _z, f) => shade.copy(ROOT).lerp(ROOT_WET, smoothstep(WATER + .06, WATER - .02, y)).lerp(BARK, hash(f, 4.4) * .3).clone()));
}

/** A red mangrove at the water's edge: a short trunk on a tangle of prop roots arching out and down into the water, under its crown. */
function redMangrove(x: number, z: number, size: number, seed: number, roots: number) {
  const parts: BufferGeometry[] = [];
  const base = Math.max(groundAt(x, z), WATER), hub = base + .13 * size;
  const trunk = new CylinderGeometry(.014 * size, .02 * size, .16 * size, 5);
  trunk.translate(x, hub + .06 * size, z);
  parts.push(paintFaces(faces(trunk), () => BARK));
  for (let k = 0; k < roots; k++) {
    const a = seed * 1.7 + k * Math.PI * 2 / roots + (hash(seed, k) - .5) * .5, reach = (.13 + .07 * hash(k, seed)) * size, ca = Math.cos(a), sa = Math.sin(a);
    const start = hub + (.02 + .05 * hash(seed + 2, k)) * size;
    parts.push(root(
      [x + ca * .012, start, z + sa * .012],
      [x + ca * reach * .45, start + .04 * size, z + sa * reach * .45],
      [x + ca * reach * .9, start - .02 * size, z + sa * reach * .9],
      [x + ca * reach, WATER - .12, z + sa * reach],
      .0085 * size, .0055 * size, 4, 5,
    ));
  }
  // The crown leans out over the water, as the edge trees reach for the light.
  const out = Math.hypot(x, z) || 1;
  parts.push(...crown(x + x / out * .05 * size, hub + .17 * size, z + z / out * .05 * size, size * 1.1, seed, 3));
  return parts;
}

/** A white egret standing in the shallows: a slim body, an S-curved neck, a yellow bill and long dark legs. */
function egret(x: number, z: number, facing: number) {
  const parts: BufferGeometry[] = [], y = WATER + .045, ca = Math.cos(facing), sa = Math.sin(facing);
  const body = new IcosahedronGeometry(1, 1);
  body.scale(.016, .016, .034);
  body.rotateX(-.3);
  body.rotateY(Math.atan2(ca, sa));
  body.translate(x, y + .02, z);
  parts.push(paintFaces(faces(body), () => BIRD));
  const forward = (d: number, up: number) => [x + ca * d, y + up, z + sa * d];
  // The neck: an S-curve from the shoulders up to the head.
  parts.push(root(forward(.02, .03), forward(.04, .04), forward(.012, .06), forward(.03, .075), .006, .0045, 4, 4, () => BIRD));
  const head = new IcosahedronGeometry(.008, 1);
  head.translate(...(forward(.032, .078) as [number, number, number]));
  parts.push(paintFaces(faces(head), () => BIRD));
  const bill = new CylinderGeometry(0, .0035, .03, 4);
  bill.rotateZ(-Math.PI / 2);
  bill.rotateY(-facing);
  bill.translate(...(forward(.05, .076) as [number, number, number]));
  parts.push(paintFaces(faces(bill), () => BILL));
  for (const side of [-1, 1]) {
    const leg = new CylinderGeometry(.0018, .0018, .05, 3);
    leg.translate(x + sa * side * .006, y - .012, z - ca * side * .006);
    parts.push(paintFaces(faces(leg), () => LEGS));
  }
  return parts;
}

/** A dead mangrove, bleached silver-grey: a leaning trunk and a few bare branches. */
function snag(x: number, z: number, seed: number) {
  const parts: BufferGeometry[] = [], y = groundAt(x, z), lean = (hash(seed, 1) - .5) * .5;
  parts.push(root([x, y - .01, z], [x + lean * .05, y + .1, z], [x + lean * .1, y + .2, z + .02], [x + lean * .14, y + .3, z + .03], .012, .005, 4, 4, () => SNAG));
  for (let k = 0; k < 3; k++) {
    const a = seed + k * 2.2, h = y + .14 + .05 * k, bx = x + lean * (.07 + .02 * k);
    parts.push(root([bx, h, z], [bx + Math.cos(a) * .04, h + .03, z + Math.sin(a) * .04], [bx + Math.cos(a) * .07, h + .05, z + Math.sin(a) * .07], [bx + Math.cos(a) * .09, h + .08, z + Math.sin(a) * .09], .005, .002, 3, 3, () => SNAG));
  }
  return parts;
}

/** A weathered boardwalk out from the sand spit over the shallows: planks on posts, a rail along one side. */
function boardwalk(from: number, length: number, angle: number) {
  const parts: BufferGeometry[] = [], ca = Math.cos(angle), sa = Math.sin(angle), deck = WATER + .07, width = .09;
  for (let i = 0; i * .03 < length; i++) {
    const d = from + i * .03, x = ca * d, z = sa * d;
    const plank = new CylinderGeometry(.5, .5, 1, 4);
    plank.scale(.024, .008, width);
    plank.rotateY(-angle + Math.PI / 4);
    plank.translate(x, deck, z);
    parts.push(paintFaces(faces(plank), (_x, _y, _z, f) => PLANK.clone().lerp(PLANK_DARK, hash(i, f) * .6)));
    if (i % 5 === 0) {
      for (const side of [-1, 1]) {
        const post = new CylinderGeometry(.007, .007, .2, 4);
        post.translate(x - sa * side * width * .5, deck - .07 + (side > 0 ? .04 : 0), z + ca * side * width * .5);
        parts.push(paintFaces(faces(post), () => PLANK_DARK));
      }
    }
  }
  // The rail, on the posts of one side.
  const rx = -sa * width * .5, rz = ca * width * .5, start = [ca * from + rx, deck + .045, sa * from + rz], end = [ca * (from + length) + rx, deck + .045, sa * (from + length) + rz];
  parts.push(root(start, start.map((v, k) => v + (end[k] - v) / 3), start.map((v, k) => v + 2 * (end[k] - v) / 3), end, .004, .004, 3, 6, () => PLANK_DARK));
  return parts;
}

/** Everything of the Mangroves & Seagrass island in one mesh (it never moves): mud, canopy, prop roots, the spit, egrets. */
export function MangroveCoast({ level }: { level: number }) {
  const lite = useSceneQuality() === 'lite';
  const mesh = useMemo(() => {
    // The banks lose their lids (the ground covers the island) and dip where the creek runs out to the sea.
    const parts: BufferGeometry[] = [cliffs(BANK, FOOT, TOP, 1, 0, 0, 0, (x, z) => Math.min(TOP, groundAt(x, z) - .01), SHAPE), ground(1)];
    // The canopy: trees on a jittered lattice inland, clear of the spit, with a few gaps where the mud shows.
    const step = .3;
    for (let z = -1.7; z <= 1.7; z += step * .87) {
      for (let x = -2.8; x <= 2.8; x += step) {
        const px = x + (Math.round(z / step) % 2) * step / 2 + (hash(x * 3 + 1, z * 7) - .5) * step * .5, pz = z + (hash(z * 5 + 2, x) - .5) * step * .5;
        const d = inside(px, pz);
        if (d < .16 || spit(px, pz) > .35 || creekMargin(px, pz) < .22 || noise(px * 1.8 + 5, pz * 1.8 - 2) < .16) continue;
        // Taller inland, so the canopy rises gently toward the island's middle.
        parts.push(...crown(px, groundAt(px, pz) + .2 + .07 * smoothstep(.2, 1, d) + .04 * hash(px, pz), pz, 1.35 + .35 * hash(pz, px) + .2 * smoothstep(.3, 1, d), Math.round(px * 31 + pz * 17)));
      }
    }
    // Red mangroves round the edge, on their prop roots in the water.
    const edge = outlinePoints(7, SHAPE);
    edge.forEach(([ox, oy], i) => {
      if (i % 2 && lite) return;
      const x = ox * (1.02 + .035 * hash(i, 3)), z = -oy * (1.02 + .035 * hash(i, 5));
      if (spit(x, z) > .3 || creekMargin(x, z) < .12) return;
      parts.push(...redMangrove(x, z, 1.05 + .35 * hash(i, 7), i, lite ? 4 : 7));
    });
    // A few bleached snags among the living trees, and a boardwalk out from the spit.
    for (const [sx, sz, seed] of [[-1.25, .45, 1], [.35, -.7, 2], [1.15, .1, 3]] as const) parts.push(...snag(sx, sz, seed));
    parts.push(...boardwalk(1.55, .85, SPIT.angle - .12));
    // Egrets wading off the spit.
    parts.push(...egret(Math.cos(SPIT.angle) * 2.25, Math.sin(SPIT.angle) * 1.75, 2.4), ...egret(Math.cos(SPIT.angle + .25) * 1.9, Math.sin(SPIT.angle + .25) * 1.6, -.6));
    // On the lagoon's far side a few red mangroves stand in its water on their roots (on the near side they
    // would hide it), and an egret fishes at its edge.
    const { lagoon } = CREEK;
    for (let k = 0; k < (lite ? 1 : 3); k++) {
      const a = -2.3 + k * .75;
      parts.push(...redMangrove(lagoon.x + Math.cos(a) * lagoon.radius * .92, lagoon.z + Math.sin(a) * lagoon.radius * .92, .62, 60 + k, lite ? 3 : 5));
    }
    parts.push(...egret(lagoon.x - lagoon.radius * .45, lagoon.z + lagoon.radius * .55, .9));
    // From level 5 the islets (island-outline.ts) rise as clumps of red mangroves on their roots.
    for (const { position: [ix, iz], scale } of islets(level, SHAPE)) {
      parts.push(cliffs(BANK, FOOT, TOP, scale, ix, iz, 9, undefined, SHAPE));
      for (let k = 0; k < 3; k++) parts.push(...redMangrove(ix + Math.cos(k * 2.1) * scale * 1.1, iz + Math.sin(k * 2.1) * scale * .8, .9, 40 + k, lite ? 4 : 6));
    }
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.name = 'mangrove-coast';
    mesh.raycast = () => {};
    return mesh;
  }, [level, lite]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as MeshLambertMaterial).dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}
