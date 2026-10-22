import { useContext, useEffect, useMemo } from 'react';
import { type BufferGeometry, Color, CylinderGeometry, DoubleSide, IcosahedronGeometry, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { islets, outlinePoints, SEABED_PROPS, shoreDistance } from '@/lib/island-outline';
import { coralHeads, JETTY, jettyLine, type CoralHead, type CoralKind } from '@/lib/reef-coast';
import { smoothstep } from '@/lib/steering';
import { boulder, cliffs, delaunay, faces, hash, noise, paintFaces, triangles, type RockColors } from './coast-geometry';
import { islandScale } from './island-shape';
import { OceanContext } from './ocean-context';
import type { Ocean } from './water-surface';
import { useSceneQuality } from './scene-quality';
import { FLOOR_BIAS, prepareUnderwater } from './underwater-material';
import { Unlock } from './unlock';

/**
 * The Coral Reef: Home's island, a coral cay like Heron Island or the cays of the Maldives. A white
 * beach of coral sand rings a low island under a dense, bright forest, with coconut palms leaning out
 * over the sand and a hedge of silvery shrubs between; slabs of beach rock lie along its west shore. A
 * jetty runs out from its north shore over the lagoon to a moored dive boat. Around it the lagoon's
 * pale sand runs out to the reef crest, where the swell breaks (the ocean's depth map: seabedProfile
 * and reefCrestAt in ocean.ts); coral heads dot the lagoon and crowd the crest's inner slope
 * (ReefCorals, from reef-coast.ts). Each level adds to it: corals and a reef rock in the lagoon (levels
 * 2 and 3, SEABED_PROPS), another palm (4), and islets of sand and palms out on the reef (5 and 6).
 */
const SAND = new Color('#F3ECD6'), SAND_WET = new Color('#D9CDA8'), RUBBLE = new Color('#CDBF9C'), WRACK = new Color('#A89A74');
const LITTER = new Color('#8E8A5E'), GRASS = new Color('#A3AE6C');
const SHRUB = new Color('#6F9663'), SHRUB_LIGHT = new Color('#9DBB86');
const LEAF = new Color('#3F7A34'), LEAF_MID = new Color('#529140'), LEAF_LIGHT = new Color('#6FA84D'), LEAF_SUN = new Color('#94C45E');
const FROND = new Color('#4F8A3E'), FROND_LIGHT = new Color('#7DAE55'), FROND_DRY = new Color('#B4A55E'), TRUNK = new Color('#A08A68'), TRUNK_DARK = new Color('#7E6A50');
const PLANK = new Color('#A98E6C'), PLANK_DARK = new Color('#7C6750');
const HULL = new Color('#F4F4EF'), HULL_STRIPE = new Color('#2F6FA6'), DECK = new Color('#C9B48E'), CANOPY = new Color('#E3EDF0'), TANK = new Color('#E2C24A');
const BEACH: RockColors = { wet: SAND_WET, rock: SAND, light: SAND };
const BEACH_ROCK: RockColors = { wet: new Color('#6C675C'), rock: new Color('#8D887A'), light: new Color('#ABA594') };
/** The beach's foot (under the water), the berm's top, and the water's calm surface (OCEAN.surfaceLevel). */
const FOOT = -.3, TOP = -.085, WATER = -.18;
/** Beach rock along the west shore: the angle about the island's middle and how far either way (rad). */
const ROCKS = { angle: Math.PI * 1.02, spread: .38 };
/** The Coral Reef's own island: the sandy bean Home's island always had (island-outline.ts). */
const SHAPE = 'reef';

const OUTLINE = (() => {
  const points = outlinePoints(10, SHAPE), polygon = new Float32Array(points.length * 2);
  points.forEach(([x, y], i) => { polygon[i * 2] = x; polygon[i * 2 + 1] = -y; });
  return polygon;
})();
const inside = (x: number, z: number) => -shoreDistance([OUTLINE], x, z);
const angleTo = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** The ground's height at (x, z): the beach rising from the water to a low berm, then the island's flat top, a little uneven. */
function groundAt(x: number, z: number) {
  const d = inside(x, z), lumps = (noise(x * 2.7 + 5, z * 2.7 - 2) - .5) * .018;
  return WATER + .012 + (TOP - WATER - .012) * smoothstep(0, .24, d) + (.012 + lumps) * smoothstep(.3, .9, d);
}

/** The island's ground: the outline filled with facets over a jittered lattice. White sand, a line of wrack, then grass and leaf litter under the trees. */
function ground(seed: number) {
  const contour = outlinePoints(8, SHAPE).map(([x, y]) => [x * 1.02, -y * 1.02] as const);
  const rim = new Float32Array(contour.flat());
  const step = .18, points: (readonly [number, number])[] = [...contour];
  for (let z = -1.8; z <= 1.8; z += step * .87) {
    for (let x = -2.4; x <= 2.5; x += step) {
      const px = x + (Math.round(z / step) % 2) * step / 2 + (hash(x * 7 + seed, z * 3) - .5) * step * .45, pz = z + (hash(z * 5, x * 9 + seed) - .5) * step * .45;
      if (-shoreDistance([rim], px, pz) > step * .4) points.push([px, pz]);
    }
  }
  // A ring of points just inside the shore keeps the beach's slope smooth.
  outlinePoints(8, SHAPE).forEach(([x, y]) => { for (const k of [.94, .88]) points.push([x * k, -y * k]); });
  const height = (i: number) => (i < contour.length ? WATER + .006 : groundAt(points[i][0], points[i][1]));
  const positions: number[] = [];
  for (const [a, b, c] of delaunay(points)) {
    const cx = (points[a][0] + points[b][0] + points[c][0]) / 3, cz = (points[a][1] + points[b][1] + points[c][1]) / 3;
    if (shoreDistance([rim], cx, cz) > 0) continue;
    for (const i of [a, c, b]) positions.push(points[i][0], height(i), points[i][1]);
  }
  const shade = new Color();
  return paintFaces(triangles(positions), (x, _y, z, f) => {
    const n = hash(f, 2.7), d = inside(x, z);
    const color = shade.copy(SAND_WET).lerp(SAND, smoothstep(0, .07, d) * (.85 + .15 * n));
    // The wrack line at the top of the beach: dried seagrass and coral rubble.
    color.lerp(n > .5 ? WRACK : RUBBLE, smoothstep(.13, .17, d) * (1 - smoothstep(.19, .23, d)) * .6);
    // Inland, under the shrubs and the forest: grass, then leaf litter.
    color.lerp(GRASS, smoothstep(.22, .32, d) * (.6 + .4 * n));
    color.lerp(LITTER, smoothstep(.4, .7, d) * smoothstep(.35, .6, noise(x * 2.1 + seed, z * 2.1)) * .8);
    return color.clone();
  });
}

/** A rounded mass of foliage: lumps of leaves, sunlit on top. */
export function foliage(x: number, y: number, z: number, size: number, seed: number, colors: readonly [Color, Color, Color, Color], lumps = 4, flat = .6) {
  const parts: BufferGeometry[] = [], shade = new Color(), [dark, mid, light, sun] = colors;
  for (let k = 0; k < lumps; k++) {
    const mass = new IcosahedronGeometry(1, 0), a = k * 2.4 + seed, w = (.12 + .06 * hash(seed, k)) * size;
    mass.scale(w, w * flat, w * .92);
    mass.rotateY(hash(seed, k + 9) * 3);
    const r = k === 0 ? 0 : .085 * size;
    mass.translate(x + Math.cos(a) * r, y + (.02 + .03 * hash(k, seed)) * size, z + Math.sin(a) * r);
    parts.push(paintFaces(faces(mass), (_x, fy, _z, f) => {
      const top = smoothstep(y, y + .07 * size, fy);
      return shade.copy(dark).lerp(mid, hash(f, k + seed) * .8).lerp(hash(f + 3, seed) > .7 ? sun : light, top * .7).clone();
    }));
  }
  return parts;
}
const FOREST = [LEAF, LEAF_MID, LEAF_LIGHT, LEAF_SUN] as const;
/** Pisonia, paler and yellower; she-oak, a darker grey-green. */
const PISONIA = [new Color('#6A9A43'), new Color('#82B052'), new Color('#9DC466'), new Color('#C0DB84')] as const;
const SHE_OAK = [new Color('#4A6646'), new Color('#5B7954'), new Color('#76926C'), new Color('#93AC86')] as const;
const HEDGE = [SHRUB, SHRUB.clone().lerp(SHRUB_LIGHT, .4), SHRUB_LIGHT, SHRUB_LIGHT.clone().lerp(new Color('#C9D9B8'), .4)] as const;

/** A thin tube along a cubic Bézier from p0 to p3, its radius tapering from r0 to r1, painted by `paint`. */
export function tube(p0: number[], p1: number[], p2: number[], p3: number[], r0: number, r1: number, sides: number, segments: number, paint: (y: number, face: number) => Color) {
  const at = (t: number) => p0.map((_, k) => (1 - t) ** 3 * p0[k] + 3 * (1 - t) ** 2 * t * p1[k] + 3 * (1 - t) * t * t * p2[k] + t ** 3 * p3[k]);
  const positions: number[] = [];
  const rings = Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments, c = at(t), d = at(Math.min(1, t + .02)).map((v, k) => v - at(Math.max(0, t - .02))[k]);
    const len = Math.hypot(d[0], d[1], d[2]) || 1, tx = d[0] / len, ty = d[1] / len, tz = d[2] / len;
    let sx = -tz, sz = tx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
    const ux = ty * sz, uy = tz * sx - tx * sz, uz = -ty * sx, r = r0 + (r1 - r0) * t;
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
  return paintFaces(triangles(positions), (_x, y, _z, f) => paint(y, f));
}

/**
 * A coconut palm: a slender, curving trunk leaning out (toward `lean`, radians) and a crown of long
 * fronds arching up and drooping, each a folded strip of leaflets, the lowest yellowed.
 */
export function palm(x: number, z: number, height: number, lean: number, seed: number, base = groundAt(x, z) - .01) {
  const parts: BufferGeometry[] = [], tilt = .16 + .12 * hash(seed, 1);
  const lx = Math.cos(lean) * tilt * height, lz = Math.sin(lean) * tilt * height;
  const top = [x + lx * 1.6, base + height, z + lz * 1.6];
  const shade = new Color();
  parts.push(tube([x, base, z], [x + lx * .3, base + height * .35, z + lz * .3], [x + lx * 1.1, base + height * .7, z + lz * 1.1], top, .022, .014, 5, 5,
    (_y, f) => shade.copy(TRUNK).lerp(TRUNK_DARK, hash(f, seed) * .5).clone()));
  const fronds = 8, length = .26 + .06 * hash(seed, 2);
  for (let k = 0; k < fronds; k++) {
    const a = seed * .7 + k * Math.PI * 2 / fronds + (hash(seed, k) - .5) * .4, ca = Math.cos(a), sa = Math.sin(a);
    const old = k % 3 === 0 && hash(seed, k + 4) > .4, droop = old ? 1.25 : .85 + .3 * hash(k, seed), L = length * (old ? .85 : 1);
    const positions: number[] = [], segments = 5;
    const spine = (t: number) => [top[0] + ca * L * t, top[1] + L * (.28 * t - droop * .62 * t * t), top[2] + sa * L * t];
    const half = (t: number) => L * .1 * Math.sin(Math.PI * Math.min(1, t * 1.15 + .05));
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments, t1 = (i + 1) / segments, s0 = spine(t0), s1 = spine(t1);
      // Each half of the frond folds down from the midrib a little, like a shallow roof.
      for (const side of [-1, 1]) {
        const e0 = [s0[0] - sa * side * half(t0), s0[1] - half(t0) * .35, s0[2] + ca * side * half(t0)];
        const e1 = [s1[0] - sa * side * half(t1), s1[1] - half(t1) * .35, s1[2] + ca * side * half(t1)];
        if (side > 0) positions.push(...s0, ...e1, ...e0, ...s0, ...s1, ...e1);
        else positions.push(...s0, ...e0, ...e1, ...s0, ...e1, ...s1);
      }
    }
    parts.push(paintFaces(triangles(positions), (_x, _y, _z, f) => shade.copy(FROND).lerp(FROND_LIGHT, hash(f, k + seed) * .7).lerp(FROND_DRY, old ? .75 : 0).clone()));
  }
  return parts;
}

/** The jetty: planks on posts from the beach out over the lagoon, a rail along its east side, a wider landing at its end. */
function jetty() {
  const parts: BufferGeometry[] = [], { from, to } = jettyLine, ca = Math.cos(JETTY.angle), sa = Math.sin(JETTY.angle), deck = WATER + .06, width = .085;
  for (let i = 0; from + i * .028 < to; i++) {
    const d = from + i * .028, x = ca * d, z = sa * d, landing = d > to - .12;
    const plank = new CylinderGeometry(.5, .5, 1, 4);
    plank.scale(.022, .007, landing ? width * 1.8 : width);
    plank.rotateY(-JETTY.angle + Math.PI / 4);
    plank.translate(x, Math.max(deck, groundAt(x, z) + .012), z);
    parts.push(paintFaces(faces(plank), (_x, _y, _z, f) => PLANK.clone().lerp(PLANK_DARK, hash(i, f) * .6)));
    if (i % 5 === 0 && d > from + .1) {
      for (const side of [-1, 1]) {
        const post = new CylinderGeometry(.006, .006, .2, 4), w = (landing ? width * 1.8 : width) * .5;
        post.translate(x - sa * side * w, deck - .07 + (side > 0 ? .035 : 0), z + ca * side * w);
        parts.push(paintFaces(faces(post), () => PLANK_DARK));
      }
    }
  }
  const rx = -sa * width * .5, rz = ca * width * .5, start = [ca * (from + .12) + rx, deck + .04, sa * (from + .12) + rz], end = [ca * (to - .12) + rx, deck + .04, sa * (to - .12) + rz];
  parts.push(tube(start, start.map((v, k) => v + (end[k] - v) / 3), start.map((v, k) => v + 2 * (end[k] - v) / 3), end, .0035, .0035, 3, 6, () => PLANK_DARK));
  return parts;
}

/** A small dive boat moored off the jetty's end: a white hull with a blue stripe, a deck, a canopy over its stern and tanks racked along its sides. */
function diveBoat() {
  const parts: BufferGeometry[] = [], { boat } = jettyLine, heading = JETTY.angle + Math.PI / 2 + .25;
  const cx = Math.cos(JETTY.angle) * boat, cz = Math.sin(JETTY.angle) * boat, ch = Math.cos(heading), sh = Math.sin(heading);
  const place = (g: BufferGeometry, along: number, up: number, across = 0) => {
    g.rotateY(-heading);
    g.translate(cx + ch * along - sh * across, WATER + up, cz + sh * along + ch * across);
    return g;
  };
  // The hull: a long box drawn to a point at the bow, its sides flaring a little.
  const L = .42, B = .13, H = .07, positions: number[] = [];
  const outline = [[-L / 2, -B / 2], [L * .22, -B / 2], [L / 2, 0], [L * .22, B / 2], [-L / 2, B / 2]];
  const top = outline.map(([u, v]) => [u, H, v * 1.08]), bottom = outline.map(([u, v]) => [u * .94, -.02, v * .7]);
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    positions.push(...bottom[i], ...top[j], ...top[i], ...bottom[i], ...bottom[j], ...top[j]);
  }
  for (let i = 1; i < outline.length - 1; i++) positions.push(...top[0], ...top[i + 1], ...top[i]);
  const hull = triangles(positions);
  const shade = new Color();
  parts.push(place(paintFaces(hull, (_x, y) => (y > WATER + H * .8 ? DECK : y > WATER + H * .45 ? HULL_STRIPE : HULL).clone()), 0, 0));
  // The stern canopy on four posts, and the wheelhouse ahead of it.
  const canopy = new CylinderGeometry(.5, .5, 1, 4);
  canopy.rotateY(Math.PI / 4);
  canopy.scale(.2, .008, .12);
  parts.push(place(paintFaces(faces(canopy), () => CANOPY), -L * .18, H + .075));
  for (const [u, v] of [[-.09, -.05], [-.09, .05], [.09, -.05], [.09, .05]]) {
    const post = new CylinderGeometry(.004, .004, .075, 3);
    parts.push(place(paintFaces(faces(post), () => HULL), -L * .18 + u, H + .037, v));
  }
  const house = new CylinderGeometry(.5, .5, 1, 4);
  house.rotateY(Math.PI / 4);
  house.scale(.07, .05, .08);
  parts.push(place(paintFaces(faces(house), (_x, y) => shade.copy(HULL).lerp(HULL_STRIPE, y > WATER + H + .03 ? 0 : .15).clone()), L * .1, H + .025));
  // Dive tanks racked down both sides under the canopy.
  for (let k = 0; k < 5; k++) {
    for (const side of [-1, 1]) {
      const tank = new CylinderGeometry(.009, .009, .045, 5);
      parts.push(place(paintFaces(faces(tank), () => TANK), -L * .3 + k * .035, H + .022, side * B * .38));
    }
  }
  return parts;
}

/** One coral head, its base at the origin: what it is gives its build and colors. */
export function coralGeometry(kind: CoralKind, radius: number, height: number, seed: number) {
  const parts: BufferGeometry[] = [], shade = new Color();
  const pick = (...hexes: string[]) => new Color(hexes[Math.floor(hash(seed, 11) * hexes.length)]);
  if (kind === 'boulder' || kind === 'brain') {
    // A massive dome, sunk a little into the sand: lumpy porites, or a brain coral's maze of ridges.
    const dome = new IcosahedronGeometry(1, 1), base = kind === 'brain' ? pick('#D8BC6A', '#B7C46E', '#C99A6A') : pick('#C2A066', '#A98E9E', '#9FB07A');
    const ridge = kind === 'brain' ? base.clone().multiplyScalar(.72) : base.clone().lerp(new Color('#E2D3AE'), .35);
    const position = dome.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const bump = 1 + (hash(Math.round(position.getX(i) * 9) + seed, Math.round(position.getZ(i) * 9) + Math.round(position.getY(i) * 9)) - .5) * (kind === 'boulder' ? .28 : .1);
      position.setXYZ(i, position.getX(i) * bump, position.getY(i) * bump, position.getZ(i) * bump);
    }
    dome.scale(radius, height * 1.25, radius * (.85 + .15 * hash(seed, 2)));
    dome.translate(0, -height * .25, 0);
    parts.push(paintFaces(faces(dome), (_x, y, _z, f) => shade.copy(base).lerp(ridge, (kind === 'brain' ? hash(f, seed) > .5 ? 1 : 0 : hash(f, seed) * .6)).lerp(new Color('#6E6450'), y < 0 ? .4 : 0).clone()));
  } else if (kind === 'table') {
    // A table coral: a flat, wide plate on a short stalk, its rim tinted.
    const plateColor = pick('#8DB07A', '#B8A270', '#7FA8A0'), rim = pick('#9A8CD0', '#C9A6DA', '#E2D6A8');
    const stalk = new CylinderGeometry(radius * .12, radius * .2, height * .7, 5);
    stalk.translate(0, height * .35, 0);
    parts.push(paintFaces(faces(stalk), () => plateColor.clone().multiplyScalar(.75)));
    // Two or three overlapping tiers, each an uneven plate tipped a little toward the light.
    for (let tier = 0; tier < 2 + (hash(seed, 9) > .5 ? 1 : 0); tier++) {
      const r = radius * (1 - tier * .28), plate = new CylinderGeometry(r, r * .8, Math.max(.01, height * .15), 9, 1), position = plate.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const k = .8 + .35 * hash(Math.round(Math.atan2(position.getZ(i), position.getX(i)) * 3) + seed, tier);
        position.setXYZ(i, position.getX(i) * k, position.getY(i), position.getZ(i) * k);
      }
      plate.rotateZ((hash(seed, tier + 4) - .5) * .25);
      plate.rotateY(hash(seed, tier + 7) * Math.PI);
      plate.translate((hash(seed, tier + 2) - .5) * radius * .5, height * (.8 - tier * .22), (hash(seed, tier + 3) - .5) * radius * .5);
      parts.push(paintFaces(faces(plate), (x, _y, z, f) => shade.copy(plateColor).lerp(rim, smoothstep(r * .5, r * .95, Math.hypot(x, z)) * .8).lerp(new Color('#E8DFC4'), hash(f, seed) * .15).clone()));
    }
  } else if (kind === 'branching') {
    // Staghorn: a thicket of tapering branches spreading up and out, pale at the tips.
    const body = pick('#D19A6A', '#9A72C0', '#C9B05A', '#7FAE7A', '#C9768C'), tip = new Color('#F2E4C4').lerp(body, .25), count = 8 + Math.floor(hash(seed, 6) * 6);
    for (let k = 0; k < count; k++) {
      const a = k * 2.399 + seed, spread = radius * (.3 + .7 * hash(seed, k + 20)), h = height * (.65 + .35 * hash(k, seed + 2));
      const ex = Math.cos(a) * spread, ez = Math.sin(a) * spread;
      parts.push(tube([0, 0, 0], [ex * .2, h * .45, ez * .2], [ex * .7, h * .8, ez * .7], [ex, h, ez], radius * .09, radius * .04, 4, 3,
        (y) => shade.copy(body).lerp(tip, smoothstep(h * .55, h, y)).clone()));
    }
  } else {
    // Soft corals and sea fans: a couple of fans of red or orange, or a purple, lumpy soft coral.
    const fan = hash(seed, 8) > .45;
    if (fan) {
      const color = pick('#D8574E', '#E8963E', '#C84A78');
      for (let k = 0; k < 2; k++) {
        const a = hash(seed, k + 30) * Math.PI, ca = Math.cos(a), sa = Math.sin(a), positions: number[] = [], steps = 6, r = radius * (k ? .75 : 1);
        for (let i = 0; i < steps; i++) {
          const u0 = (i / steps - .5) * Math.PI * .9, u1 = ((i + 1) / steps - .5) * Math.PI * .9;
          const p0 = [Math.sin(u0) * r * ca, Math.cos(u0) * height, Math.sin(u0) * r * sa], p1 = [Math.sin(u1) * r * ca, Math.cos(u1) * height, Math.sin(u1) * r * sa];
          positions.push(0, 0, 0, ...p0, ...p1, 0, 0, 0, ...p1, ...p0);
        }
        parts.push(paintFaces(triangles(positions), (_x, y, _z, f) => shade.copy(color).lerp(new Color('#F0C9A0'), hash(f, seed) * .25 + smoothstep(height * .6, height, y) * .2).clone()));
      }
    } else {
      parts.push(...foliage(0, -height * .2, 0, radius * 5.5, seed, [new Color('#7F5A8E'), new Color('#9E6FA8'), new Color('#B98CC0'), new Color('#D2B2D6')], 3, .9));
    }
  }
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return geometry;
}

/** A mesh of coral heads, drawn on the bottom like the reef's rocks (behind any animal over them) and tinted by the water over them. */
function useCoralMesh(heads: readonly CoralHead[], name: string) {
  const ocean = useContext(OceanContext);
  const lite = useSceneQuality() === 'lite';
  const { mesh, look } = useMemo(() => {
    const parts = heads.filter((head, i) => !lite || !head.crest || i % 2 === 0).map((head) => {
      const geometry = coralGeometry(head.kind, head.radius, head.height, head.seed);
      geometry.rotateY(hash(head.seed, 13) * Math.PI * 2);
      geometry.translate(head.x, head.floor - .01, head.z);
      return geometry;
    });
    const geometry = parts.length ? mergeGeometries(parts) : new IcosahedronGeometry(.001, 0);
    parts.forEach((part) => part.dispose());
    const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide });
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.raycast = () => {};
    // Standing up off the bottom, they take on a little less of the water's color than the sand around them.
    const look = prepareUnderwater(mesh, ocean ?? undefined, lite, { bias: FLOOR_BIAS, seabed: .32 });
    geometry.dispose();
    material.dispose();
    return { mesh, look };
  }, [heads, name, ocean, lite]);
  useEffect(() => () => look.dispose(), [look]);
  return mesh;
}

/** The coral heads of the lagoon and the crest (reef-coast.ts), in the island's frame (world units, not scaled with the island). */
export function ReefCorals({ level }: { level: number }) {
  const heads = useMemo(() => coralHeads(level), [level]);
  return <primitive object={useCoralMesh(heads, 'reef-corals')} />;
}

/** One of the lagoon's showpiece corals (SEABED_PROPS) or its reef rock, in the island group's frame, grown in at its level. */
function Showpiece({ at, level, from, kind, radius, height, seed, ocean, place }: {
  at: readonly [number, number]; level: number; from: number; kind: CoralKind | 'rock'; radius: number; height: number; seed: number; ocean: Ocean; place: readonly [number, number];
}) {
  const scale = islandScale(level), [x, z] = at;
  const floor = useMemo(() => ocean.field.profile(place[0] + x * scale, place[1] + z * scale).floor, [ocean, place, x, z, scale]);
  const heads = useMemo<CoralHead[]>(() => [{ x: 0, z: 0, floor: .01, radius, height, kind: kind === 'rock' ? 'boulder' : kind, seed, crest: false }], [radius, height, kind, seed]);
  const mesh = useCoralMesh(heads, `reef-showpiece-${seed}`);
  return <group position={[x, floor / scale, z]}><Unlock at={from} level={level} kind="grow"><primitive object={mesh} /></Unlock></group>;
}

/** A small cay of sand out on the reef (an islet, from level 5): a beach, a few shrubs and a palm or two. */
function IsletCay({ position, scale, seed }: { position: [number, number]; scale: number; seed: number }) {
  const mesh = useMemo(() => {
    const [ix, iz] = position;
    const parts: BufferGeometry[] = [cliffs(BEACH, FOOT, TOP + .005, scale, ix, iz, seed, undefined, SHAPE)];
    for (let k = 0; k < 4; k++) parts.push(...foliage(ix + Math.cos(k * 1.7 + seed) * scale * .7, TOP, iz + Math.sin(k * 1.7 + seed) * scale * .5, .6, seed * 10 + k, HEDGE, 3));
    for (let k = 0; k < 2; k++) parts.push(...palm(ix + (k - .5) * scale * .9, iz + (hash(seed, k) - .5) * scale * .4, .36 + .06 * k, seed + k * 2.5, seed * 7 + k, TOP));
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide }));
    mesh.name = 'reef-islet';
    mesh.raycast = () => {};
    return mesh;
  }, [position, scale, seed]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as MeshLambertMaterial).dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}

/** Everything of the Coral Reef's cay in one mesh (it never moves): beach, shrubs, forest, palms, beach rock, the jetty and the boat. */
export function ReefCoast({ level, ocean, place }: { level: number; ocean: Ocean; place: readonly [number, number] }) {
  const lite = useSceneQuality() === 'lite';
  const mesh = useMemo(() => {
    // The beach loses its lids: the ground drawn over it covers the island.
    const parts: BufferGeometry[] = [cliffs(BEACH, FOOT, TOP, 1, 0, 0, 0, (x, z) => Math.min(TOP, groundAt(x, z) - .008), SHAPE), ground(1)];
    // Inland, a dense, bright forest on a jittered lattice, rising a little toward the middle, with a few clearings.
    const step = lite ? .34 : .27;
    for (let z = -1.7; z <= 1.7; z += step * .87) {
      for (let x = -2.3; x <= 2.4; x += step) {
        const px = x + (Math.round(z / step) % 2) * step / 2 + (hash(x * 3 + 1, z * 7) - .5) * step * .5, pz = z + (hash(z * 5 + 2, x) - .5) * step * .5;
        const d = inside(px, pz);
        if (d < .5 || noise(px * 1.6 + 3, pz * 1.6 - 7) < .28 || angleTo(Math.atan2(pz, px), JETTY.angle) < .12) continue;
        const kind = hash(px * 5, pz * 3), colors = kind < .55 ? FOREST : kind < .82 ? PISONIA : SHE_OAK;
        parts.push(...foliage(px, groundAt(px, pz) + .12 + .06 * smoothstep(.5, 1, d) + .03 * hash(px, pz), pz, 1.3 + .4 * hash(pz, px) + .2 * smoothstep(.5, 1, d), Math.round(px * 31 + pz * 17), colors));
      }
    }
    // A hedge of silvery shrubs between the beach and the forest.
    const ring = outlinePoints(lite ? 9 : 13, SHAPE);
    ring.forEach(([ox, oy], i) => {
      const k = .8 - .05 * hash(i, 2), x = ox * k, z = -oy * k;
      if (angleTo(Math.atan2(z, x), JETTY.angle) < .1) return;
      parts.push(...foliage(x, groundAt(x, z) - .005, z, .7 + .3 * hash(i, 5), i * 3 + 7, HEDGE, 3, .5));
    });
    // Coconut palms leaning out over the beach all round, and a few among the trees.
    const palms = outlinePoints(lite ? 3 : 4, SHAPE);
    palms.forEach(([ox, oy], i) => {
      const k = .9 - .05 * hash(i, 9), x = ox * k, z = -oy * k, out = Math.atan2(z, x);
      if (angleTo(out, JETTY.angle) < .15 || angleTo(out, ROCKS.angle) < ROCKS.spread * .6) return;
      parts.push(...palm(x, z, .36 + .12 * hash(i, 4), out + (hash(i, 6) - .5) * .5, i + 1));
    });
    for (const [px, pz, seed] of [[-.6, .25, 41], [.55, -.35, 42], [1.35, .2, 43], [-1.45, -.3, 44]] as const) parts.push(...palm(px, pz, .5, seed, seed));
    // Slabs of beach rock along the west shore, wet where the water laps them.
    const shore = outlinePoints(14, SHAPE);
    shore.forEach(([ox, oy], i) => {
      const x = ox * 1.01, z = -oy * 1.01, out = Math.atan2(z, x);
      if (angleTo(out, ROCKS.angle) > ROCKS.spread) return;
      parts.push(boulder(BEACH_ROCK, x, WATER - .005, z, .1 + .05 * hash(i, 3), .025, .06, out + 1.4, 50 + i, WATER + .005));
    });
    parts.push(...jetty(), ...diveBoat());
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide }));
    mesh.name = 'reef-coast';
    mesh.raycast = () => {};
    return mesh;
  }, [lite]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as MeshLambertMaterial).dispose(); }, [mesh]);
  const [first, second] = islets(6, SHAPE);
  return <>
    <primitive object={mesh} />
    {/* What each level adds grows in (or rises from the water) when it's unlocked on screen. */}
    <Showpiece at={SEABED_PROPS.coralA} level={level} from={2} kind="table" radius={.2} height={.18} seed={101} ocean={ocean} place={place} />
    <Showpiece at={SEABED_PROPS.coralB} level={level} from={2} kind="brain" radius={.18} height={.16} seed={102} ocean={ocean} place={place} />
    <Showpiece at={SEABED_PROPS.coralC} level={level} from={3} kind="branching" radius={.22} height={.2} seed={103} ocean={ocean} place={place} />
    <Showpiece at={SEABED_PROPS.reefRock} level={level} from={3} kind="rock" radius={.17} height={.12} seed={104} ocean={ocean} place={place} />
    <group position={[-.15, 0, .75]}><Unlock at={4} level={level} kind="grow"><PalmAt x={-.15} z={.75} /></Unlock></group>
    <Unlock at={5} level={level} kind="rise"><IsletCay position={first.position} scale={first.scale} seed={5} /></Unlock>
    <Unlock at={6} level={level} kind="rise"><IsletCay position={second.position} scale={second.scale} seed={6} /></Unlock>
  </>;
}

/** The palm level 4 adds, among the trees (drawn about its own foot, so it grows in where it stands). */
function PalmAt({ x, z }: { x: number; z: number }) {
  const mesh = useMemo(() => {
    const parts = palm(x, z, .56, 2.2, 77), geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    geometry.translate(-x, 0, -z);
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide }));
    mesh.raycast = () => {};
    return mesh;
  }, [x, z]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as MeshLambertMaterial).dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}
